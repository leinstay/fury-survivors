import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import {
  createRunTracker, mergeRun, emptyCodex, normalizeCodex, isSeen, runStatus, validCodexId,
  weaponDps, foeKind,
} from '../../src/core/codex.js';
import { CODEX } from '../../src/data/codex.js';
import { ENEMIES } from '../../src/data/enemies.js';
import { BOSSES } from '../../src/data/bosses.js';

const DT = 1 / 60;

// Забег с автовыбором карточек: трекер получает события каждого тика и кадр после тика, как в Game.
function play(sim, tracker, seconds, input = { x: 0.6, y: 0.3 }) {
  const all = [];
  for (let i = 0; i < seconds / DT && sim.state !== 'gameover' && sim.state !== 'victory'; i++) {
    sim.step(DT, input);
    all.push(...sim.events);
    tracker.onEvents(sim.events);
    tracker.observe(sim);
    if (sim.state === 'levelup') sim.chooseCard(0, sim.picker);
    else if (sim.state === 'chest') sim.chooseChest(0);
    else if (sim.state === 'reveal') sim.endReveal();
  }
  return all;
}

// Минимальный sim для трекера: только то, что он читает.
function fakeSim(over = {}) {
  const p = (id) => ({
    id, x: 0, y: 0, dead: false, hero: 'heroine', level: 3,
    weapons: [{ id: 'blade_arc', level: 2 }], passives: [{ id: 'armor', level: 1 }],
    damageByWeapon: { blade_arc: 120.4 }, levelUp: { cards: [] },
  });
  const players = [p(0), p(1)];
  return {
    players, player: players[0], time: 30, state: 'running', picker: 0, chest: { cards: [], player: 0 },
    enemies: [], kills: 7, coins: 3, difficulty: 'normal', ...over,
  };
}

test('codex: id shape', () => {
  assert.ok(validCodexId('a'.repeat(CODEX.idLength)));
  assert.ok(!validCodexId('A'.repeat(CODEX.idLength)));
  assert.ok(!validCodexId('a'.repeat(CODEX.idLength - 1)));
  assert.ok(!validCodexId(null));
});

test('codex: foe ids are unique across enemies and bosses', () => {
  for (const id of Object.keys(ENEMIES)) assert.ok(!(id in BOSSES), id);
  assert.equal(foeKind('harpy'), 'enemy');
  assert.equal(foeKind('reaper'), 'boss');
  assert.equal(foeKind('nope'), null);
});

test('codex tracker: counts only own kills, hurts and pickups in co-op', () => {
  const tr = createRunTracker({ local: 1, coop: true, partner: 'ANN' });
  tr.onEvents([
    { type: 'kill', enemy: 'harpy', by: 0 },                  // напарник: видел, но не мой
    { type: 'kill', enemy: 'slime', by: 1, elite: true },
    { type: 'kill', enemy: 'slime', by: 1 },
    { type: 'playerHurt', player: 0, amount: 5, src: 'catgirl' }, // по напарнику
    { type: 'playerHurt', player: 1, amount: 8, src: 'lamia' },
    { type: 'playerHurt', player: 1, amount: 4, src: 'lamia' },
    { type: 'playerHurt', player: 1, amount: 4, src: '' },         // неизвестный источник
    { type: 'pickup', kind: 'coin', player: 1 },
    { type: 'pickup', kind: 'coin', player: 0 },
    { type: 'pickup', kind: 'heal', player: 1 },
    { type: 'bossSpawn', boss: 'kitsune_empress' },
    { type: 'chest', player: 1, items: [{ kind: 'weapon', id: 'thunder_loop' }, { kind: 'heal', id: 'heal' }] },
    { type: 'chest', player: 0, items: [{ kind: 'passive', id: 'luck' }] },
  ]);
  const sim = fakeSim();
  sim.players[1].weapons = [{ id: 'storm_chain', level: 4 }];
  sim.players[1].passives = [];
  sim.players[1].damageByWeapon = { storm_chain: 99.6 };
  const res = tr.finish(sim, { status: 'victory', at: 123, score: 456 });
  assert.equal(res.run.mode, 'duo');
  assert.equal(res.run.partner, 'ANN');
  assert.equal(res.run.kills, 2);
  assert.equal(res.run.coins, 1);
  assert.deepEqual(res.run.damage, { storm_chain: 100 });
  assert.deepEqual(res.run.weapons, [['storm_chain', 4]]);
  assert.equal(res.foes.slime.kills, 2);
  assert.equal(res.foes.slime.elites, 1);
  assert.equal(res.foes.harpy, undefined);
  assert.equal(res.foes.lamia.hits, 2);
  assert.equal(res.foes.lamia.taken, 12);
  assert.equal(res.foes.catgirl, undefined);
  assert.equal(res.foes.kitsune_empress.met, 1);
  assert.deepEqual(res.pickups, { coin: 1, heal: 1 });
  assert.ok(res.seen.enemy.harpy && res.seen.enemy.slime && res.seen.enemy.lamia);
  assert.ok(!res.seen.enemy.catgirl);
  assert.ok(res.seen.boss.kitsune_empress);
  assert.ok(res.seen.weapon.thunder_loop && res.seen.weapon.storm_chain);
  assert.ok(!res.seen.passive.luck, 'chest of the partner does not unlock');
  assert.equal(tr.finish(sim, { status: 'victory' }), null, 'finish only once');
});

test('codex tracker: level-up and chest cards unlock only for the picker', () => {
  const tr = createRunTracker({ local: 0 });
  const sim = fakeSim({ state: 'levelup', picker: 0 });
  sim.player.levelUp.cards = [{ kind: 'weapon', id: 'firebomb' }, { kind: 'passive', id: 'luck' }, { kind: 'heal', id: 'heal' }];
  tr.observe(sim);
  sim.state = 'levelup';
  sim.picker = 1;
  sim.players[1].levelUp.cards = [{ kind: 'weapon', id: 'war_axe' }];
  tr.observe(sim);
  sim.state = 'chest';
  sim.chest = { cards: [{ kind: 'weapon', id: 'crimson_arc' }], player: 0 };
  tr.observe(sim);
  const res = tr.finish(sim, { status: 'dead', at: 1, score: 1 });
  assert.ok(res.seen.weapon.firebomb && res.seen.passive.luck && res.seen.weapon.crimson_arc);
  assert.ok(!res.seen.weapon.war_axe);
  assert.ok(res.seen.weapon.blade_arc && res.seen.passive.armor, 'own build is seen');
  assert.equal(res.run.mode, 'solo');
  assert.equal(res.run.coins, 3, 'solo coins from sim');
});

test('codex tracker: enemies near the hero are seen, far ones are not', () => {
  const tr = createRunTracker();
  const sim = fakeSim({
    enemies: [
      { type: 'ghost', x: 100, y: 0, dead: false, boss: false },
      { type: 'lamia', x: CODEX.seenRange + 50, y: 0, dead: false, boss: false },
      { type: 'dryad_queen', x: 0, y: 50, dead: false, boss: true },
    ],
  });
  tr.observe(sim);
  const res = tr.finish(sim, { status: 'dead' });
  assert.ok(res.seen.enemy.ghost && res.seen.boss.dryad_queen);
  assert.ok(!res.seen.enemy.lamia);
});

test('codex tracker: distance and time held per weapon', () => {
  const tr = createRunTracker();
  const sim = fakeSim({ time: 0 });
  tr.observe(sim);
  sim.player.x = 30; sim.player.y = 40; sim.time = 2;
  tr.observe(sim);
  sim.player.x = 5000; sim.time = 3; // телепорт: не шаги
  tr.observe(sim);
  const res = tr.finish(sim, { status: 'dead' });
  assert.equal(res.run.dist, 50);
  assert.equal(res.run.held.blade_arc, 3);
  assert.ok(Math.abs(weaponDps(res.run, 'blade_arc') - 120 / 3) < 1e-9);
});

test('codex tracker: short quit is not recorded, long quit is', () => {
  const a = createRunTracker();
  assert.equal(a.finish(fakeSim({ time: CODEX.minQuitTime - 1 }), { status: 'quit' }), null);
  const b = createRunTracker();
  assert.equal(b.finish(fakeSim({ time: CODEX.minQuitTime + 1 }), { status: 'quit' }).run.status, 'quit');
  const c = createRunTracker();
  assert.ok(c.finish(fakeSim({ time: 2 }), { status: 'dead' }), 'early death is recorded');
});

test('codex: runStatus', () => {
  assert.equal(runStatus({ state: 'victory' }, false), 'victory');
  assert.equal(runStatus({ state: 'gameover' }, true), 'dead');
  assert.equal(runStatus({ state: 'running' }, true), 'disconnected');
  assert.equal(runStatus({ state: 'running' }, false), 'quit');
});

test('codex merge: totals, records, unlocks and capped history', () => {
  const codex = emptyCodex('x'.repeat(CODEX.idLength), 'ANN');
  const one = (status, mode, score, coop = mode === 'duo') => {
    const tr = createRunTracker({ coop, partner: coop ? 'BOB' : '' });
    tr.onEvents([{ type: 'kill', enemy: 'harpy', by: 0 }, { type: 'pickup', kind: 'xp', player: 0 }]);
    return tr.finish(fakeSim(), { status, at: 5, score });
  };
  mergeRun(codex, one('victory', 'solo', 300));
  mergeRun(codex, one('dead', 'duo', 900));
  mergeRun(codex, one('dead', 'solo', 100));
  const t = codex.totals;
  assert.deepEqual(t.runs, { solo: 2, duo: 1 });
  assert.deepEqual(t.wins, { solo: 1, duo: 0 });
  assert.deepEqual(t.best, { solo: 300, duo: 900 });
  assert.equal(t.kills, 3);
  assert.equal(t.time, 90);
  assert.equal(t.damage, 360);
  assert.equal(t.pickups.xp, 3);
  assert.equal(t.heroes.heroine, 3);
  assert.equal(codex.foes.harpy.kills, 3);
  assert.ok(isSeen(codex, 'enemy', 'harpy'));
  assert.ok(isSeen(codex, 'weapon', 'blade_arc'));
  assert.ok(!isSeen(codex, 'weapon', 'firebomb'));
  assert.equal(codex.runs[0].score, 100, 'newest first');
  for (let i = 0; i < CODEX.maxRuns + 5; i++) mergeRun(codex, one('dead', 'solo', i));
  assert.equal(codex.runs.length, CODEX.maxRuns);
  assert.equal(mergeRun(codex, null), codex);
});

test('codex normalize: survives JSON, drops junk, refuses newer schema', () => {
  const codex = emptyCodex('y'.repeat(CODEX.idLength), 'BOB');
  const tr = createRunTracker();
  tr.onEvents([{ type: 'kill', enemy: 'lamia', by: 0, elite: true }]);
  mergeRun(codex, tr.finish(fakeSim(), { status: 'victory', at: 9, score: 77 }));
  const back = normalizeCodex(JSON.parse(JSON.stringify(codex)));
  assert.deepEqual(back, codex);

  const junk = JSON.parse(JSON.stringify(codex));
  junk.id = 'NOT VALID';
  junk.nick = '<script>';
  junk.seen.weapon.no_such_weapon = 1;
  junk.foes.no_such_enemy = { kills: 5 };
  junk.foes.lamia.kills = -3;
  junk.totals.kills = 'lots';
  junk.totals.pickups.bogus = 4;
  junk.runs.push('bad', { status: 'exploded', mode: 'trio', damage: { blade_arc: Infinity } });
  junk.extra = 'x';
  const n = normalizeCodex(junk);
  assert.equal(n.id, '');
  assert.equal(n.nick, '');
  assert.equal(n.seen.weapon.no_such_weapon, undefined);
  assert.equal(n.foes.no_such_enemy, undefined);
  assert.equal(n.foes.lamia.kills, 0);
  assert.equal(n.totals.kills, 0);
  assert.equal(n.totals.pickups.bogus, undefined);
  assert.equal(n.runs.length, 2);
  assert.equal(n.runs[1].status, 'quit');
  assert.equal(n.runs[1].mode, 'solo');
  assert.deepEqual(n.runs[1].damage, {});
  assert.equal(n.extra, undefined);

  assert.equal(normalizeCodex({ v: CODEX.version + 1 }), null);
  assert.equal(normalizeCodex('nope'), null);
  assert.deepEqual(normalizeCodex({}).runs, []);
});

test('codex tracker on a real sim: kill.by and playerHurt.src are filled, records add up', () => {
  const sim = createSim({ seed: 5, stage: 'forest' });
  const tr = createRunTracker({ local: 0 });
  const events = play(sim, tr, 90, { x: 0.2, y: 0 });
  const kills = events.filter((e) => e.type === 'kill');
  const hurts = events.filter((e) => e.type === 'playerHurt');
  assert.ok(kills.length > 0 && kills.every((e) => e.by === 0));
  assert.ok(hurts.length > 0 && hurts.every((e) => foeKind(e.src)), 'every hurt has a known source');
  const res = tr.finish(sim, { status: runStatus(sim, false), at: 1, score: 1 });
  assert.equal(res.run.kills, sim.kills);
  const sumKills = Object.values(res.foes).reduce((s, f) => s + f.kills, 0);
  assert.equal(sumKills, sim.kills);
  const taken = Object.values(res.foes).reduce((s, f) => s + f.taken, 0);
  assert.ok(Math.abs(taken - hurts.reduce((s, e) => s + e.amount, 0)) < 1e-6);
  assert.ok(res.run.dist > 0);
});

test('codex tracker on a real co-op sim: own kills of both players sum to team kills', () => {
  const sim = createSim({ seed: 3, stage: 'forest', players: 2 });
  const a = createRunTracker({ local: 0, coop: true });
  const b = createRunTracker({ local: 1, coop: true });
  for (let i = 0; i < 60 / DT && sim.state !== 'gameover'; i++) {
    sim.step(DT, { players: [{ x: 0.3, y: 0 }, { x: -0.3, y: 0 }] });
    a.onEvents(sim.events);
    b.onEvents(sim.events);
    if (sim.state === 'levelup') sim.chooseCard(0, sim.picker);
    else if (sim.state === 'chest') sim.chooseChest(0);
    else if (sim.state === 'reveal') sim.endReveal();
  }
  const ra = a.finish(sim, { status: 'quit' });
  const rb = b.finish(sim, { status: 'quit' });
  assert.equal(ra.run.kills + rb.run.kills, sim.kills);
});

test('codex: Attack passive stays unlocked, removed collabs are dropped', () => {
  const c = normalizeCodex({ v: 1,
    seen: { passive: { attack: 1 }, weapon: { phantom_blades: 1, blade_arc: 1 } } });
  assert.ok(c.seen.passive.attack);
  assert.ok(!c.seen.weapon.phantom_blades && c.seen.weapon.blade_arc);
});
