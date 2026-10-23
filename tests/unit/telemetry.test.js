import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { createSim } from '../../src/core/sim.js';
import { createTelemetry } from '../../src/core/telemetry.js';
import { createTelemetrySender, serializeRun, encodeRun } from '../../src/services/telemetry.js';
import { hashSim } from '../../src/core/lockstep.js';
import { TELEMETRY } from '../../src/data/telemetry.js';

const idle = { x: 0, y: 0 };
function setup(options = {}) {
  const sim = createSim({ seed: 42, ...options });
  const tr = createTelemetry({ sim, local: options.local || 0, coop: sim.coop,
    sessionId: 'test-session', fingerprint: '12345678' });
  return { sim, tr };
}
function offer(sim) {
  sim.player.xp = sim.player.xpNext;
  sim._checkLevel();
}
function finish(sim, tr) {
  sim.time = Math.max(30, sim.time);
  return tr.finish(sim, { status: 'quit' });
}

test('telemetry observes choices before applying them and budgets before spending', () => {
  const { sim, tr } = setup();
  offer(sim);
  const before = tr.offers[0];
  const budget = sim.player.levelUp.rerolls;
  sim.reroll();
  assert.equal(tr.decisions[0].context.budgets[0], budget);
  assert.equal(tr.decisions[0].offerId, before.id);
  assert.equal(tr.offers[1].context.budgets[0], budget - 1);
  const cards = sim.player.levelUp.cards.map((x) => `${x.kind}:${x.id}:${x.level}`);
  const originalBuild = JSON.stringify(tr.context(sim, 0));
  sim.chooseCard(0);
  assert.deepEqual(tr.decisions[1].pick[3], cards);
  assert.equal(JSON.stringify(tr.decisions[1].context), originalBuild);
  assert.equal(tr.applications.length, 1);
  assert.equal(tr.decisions[1].offerId, tr.offers[1].id);
  assert.equal(tr.picks.length, 2);
});

test('duo observers receive their own choices without draining the partner log', () => {
  const { sim, tr } = setup({ players: 2 });
  const other = createTelemetry({ sim, local: 1, coop: true, sessionId: 'test-session' });
  offer(sim);
  sim.chooseCard(0, sim.picker);
  while (sim.state === 'resume') sim.step(1 / 60, idle);
  offer(sim);
  assert.equal(sim.picker, 1);
  sim.chooseCard(0, 1);
  assert.equal(tr.picks.length, 1);
  assert.equal(other.picks.length, 1);
  assert.equal(tr.applications.length, 1);
  assert.equal(other.applications.length, 1);
  const a = finish(sim, tr);
  const b = finish(sim, other);
  assert.equal(a.sessionId, b.sessionId);
  assert.notEqual(a.local, b.local);
  assert.equal(sim.telemetryObservers.size, 0);
});

test('input changes include both players, do not change simulation and stop after finish', () => {
  const { sim, tr } = setup({ players: 2 });
  const plain = createSim({ seed: 42, players: 2 });
  const input = { players: [{ x: 0.123456, y: 1 }, { x: -1, y: 0 }] };
  for (let i = 0; i < 120; i++) {
    sim.step(1 / 60, input);
    plain.step(1 / 60, input);
  }
  assert.equal(hashSim(sim), hashSim(plain));
  assert.deepEqual(tr.inputs, [[1, 0.123456, 1, -1, 0]]);
  assert.ok(tr.movement.length >= 1);
  const result = finish(sim, tr);
  assert.equal(result.seed, 42);
  assert.equal(result.fingerprint, '12345678');
  assert.equal(result.capture.exactReplay, false);
  assert.equal(tr.finish(sim, { status: 'quit' }), null);
});

test('evolution retains consumed weapon damage and distinguishes reward from choice', () => {
  const { sim, tr } = setup();
  const p = sim.player;
  p.weapons = [{ id: 'blade_arc', level: 7 }];
  p.passives = [{ id: 'attack', level: 1 }];
  p.damageByWeapon.blade_arc = 1234;
  p.rawByWeapon.blade_arc = 1500;
  p.hitsByWeapon.blade_arc = 99;
  sim._openChest(p);
  sim.chooseChest(0);
  assert.deepEqual(tr.picks.map((x) => x[1]), ['evo', 'chest']);
  assert.equal(tr.applications.length, 1);
  assert.deepEqual(tr.applications[0].from, ['blade_arc', 'attack']);
  const result = finish(sim, tr);
  assert.equal(result.end.w.some((x) => x[0] === 'blade_arc'), false);
  assert.deepEqual(result.end.damage.find((x) => x[0] === 'blade_arc'),
      ['blade_arc', 1234, 1500, 99, 0]);
});

test('large UTF-8 runs stay within Firestore limit and report removed data', () => {
  const { sim, tr } = setup();
  const run = finish(sim, tr);
  run.movement = Array.from({ length: 3600 }, (_, tick) => ({ tick, label: 'я'.repeat(100) }));
  run.inputs = [[1, 0, 0]];
  const encoded = serializeRun(run);
  const stored = JSON.parse(encoded);
  assert.ok(new TextEncoder().encode(encoded).length < TELEMETRY.maxBytes);
  assert.equal(run.movement.length, 3600);
  assert.equal(stored.capture.total.movement, 3600);
  assert.equal(stored.movement.length + stored.capture.dropped.movement, 3600);
  assert.deepEqual(stored.end, run.end);
});

test('capture limits are explicit and do not silently claim complete input', () => {
  const { sim, tr } = setup();
  for (let i = 0; i <= TELEMETRY.maxInputChanges; i++) tr.input(sim, { x: i, y: 0 });
  const run = JSON.parse(serializeRun(finish(sim, tr)));
  assert.equal(run.capture.inputComplete, false);
  assert.equal(run.capture.total.inputs, TELEMETRY.maxInputChanges + 1);
  assert.ok(run.capture.dropped.inputs > 0);
});

function backend() {
  const docs = new Map();
  let offline = true;
  const mem = new Map();
  const storage = () => ({ getItem: (k) => mem.get(k), setItem: (k, v) => mem.set(k, v) });
  const load = async () => ({ db: {}, fs: {
    doc: (_, collection, id) => `${collection}/${id}`,
    serverTimestamp: () => 'SERVER',
    setDoc: async (id, data) => {
      if (offline) throw new Error('offline');
      if (docs.has(id)) throw new Error('update denied');
      docs.set(id, data);
    },
    getDoc: async (id) => {
      if (offline) throw new Error('offline');
      return { exists: () => docs.has(id), data: () => docs.get(id) };
    },
  } });
  return { docs, storage, load, online: () => { offline = false; } };
}

test('sender persists offline runs, flushes after restart, and retries idempotently', async () => {
  const b = backend();
  const { sim, tr } = setup();
  const run = finish(sim, tr);
  const first = createTelemetrySender({ ...b, automated: () => false });
  assert.equal(await first.send(run), false);
  b.online();
  const restarted = createTelemetrySender({ ...b, automated: () => false });
  assert.equal(await restarted.flush(), true);
  assert.equal(b.docs.size, 1);
  assert.equal(await restarted.send(run), true);
  assert.equal(b.docs.size, 1);
  const doc = [...b.docs.values()][0];
  assert.equal(doc.v, 2);
  assert.deepEqual(Object.keys(doc).sort(), ['v', 'ver', 'mode', 'difficulty', 'status',
    'time', 'level', 'hero', 'data', 'createdAt'].sort());
});

test('automated browsers never upload or flush production telemetry', async () => {
  const sender = createTelemetrySender({ automated: () => true,
    load: () => { throw new Error('must not load'); } });
  const { sim, tr } = setup();
  assert.equal(await sender.send(finish(sim, tr)), false);
  assert.equal(await sender.flush(), false);
});


test('compressed details round-trip without losing late-game choices or movement', async () => {
  const { sim, tr } = setup();
  const run = finish(sim, tr);
  run.movement = Array.from({ length: 1800 }, (_, tick) => ({ tick, hp: 42, x: tick, y: 0 }));
  run.decisions = Array.from({ length: 300 }, (_, id) => ({ id, context: run.initial }));
  const stored = JSON.parse(await encodeRun(run));
  assert.equal(stored.detail.encoding, 'gzip-base64');
  const detail = JSON.parse(gunzipSync(Buffer.from(stored.detail.data, 'base64')));
  assert.deepEqual(detail.movement, run.movement);
  assert.deepEqual(detail.decisions, run.decisions);
  assert.deepEqual(stored.capture.dropped, {});
});

test('combat records setup then finish, distance, knockback and pooled target reset', () => {
  const { sim, tr } = setup({ players: 2 });
  sim.players.forEach((p) => { p.stats.crit = 0; });
  const target = sim.spawnEnemy('slime', sim.player.x + 30, sim.player.y);
  target.hp = 100;
  target.resist = 0;
  sim.damageEnemy(target, 30, 'storm_chain', 10, sim.player.x, sim.player.y, sim.players[1]);
  sim.damageEnemy(target, 100, 'blade_arc', 4, sim.player.x, sim.player.y);
  const row = tr.combat.blade_arc;
  assert.equal(row.firstHits, 0);
  assert.equal(row.finishes, 1);
  assert.equal(row.finishesAfter['1:storm_chain'], 1);
  assert.equal(row.dealt, 70);
  assert.equal(row.distanceHits[0], 1);
  assert.equal(row.knockbacks, 1);
  target.uid++;
  target.dead = false;
  target.hp = 100;
  sim.damageEnemy(target, 1, 'blade_arc', 0, sim.player.x, sim.player.y);
  assert.equal(row.firstHits, 1);
  assert.equal(row.finishesAfter['1:storm_chain'], 1);
});

test('shield interception is attributed to its owner and is not claimed as prevented HP loss', () => {
  const { sim, tr } = setup({ players: 2 });
  const other = createTelemetry({ sim, local: 1, coop: true });
  const projectile = { x: 0, y: 0, radius: 2, dmg: 25 };
  const shield = { x: 0, y: 0, radius: 8, life: 1, blocks: true, wid: 'guardian_shields',
    ws: { owner: sim.players[1] } };
  assert.equal(sim._blocked(projectile, [shield]), true);
  assert.deepEqual(tr.blocks, {});
  assert.deepEqual(other.blocks.guardian_shields, { count: 1, interceptedRaw: 25 });
});

test('magnet telemetry measures banked ground XP before attraction, without inventing XP gain', () => {
  const { sim, tr } = setup();
  sim.dropPickup('xp_small', 80, 0, 20);
  sim._collect({ kind: 'magnet', value: 0 }, sim.player);
  assert.equal(tr.magnets.length, 1);
  assert.equal(tr.magnets[0].groundXP, 20);
  assert.equal(tr.economy.pickedXP, 0);
  assert.equal(tr.snap(sim, 0).economy.groundXP, 20);
  sim._collect({ kind: 'xp', value: 20 }, sim.player);
  assert.equal(tr.snap(sim, 0).economy.pickedXP, 20);
  assert.ok(sim.pickups.every((x) => x.pulled));
});
