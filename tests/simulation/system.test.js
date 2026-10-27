import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fetchRuns } from '../../tools/telemetry/export.mjs';
import { normalizeRun } from '../../tools/telemetry/data.mjs';
import { runSimulation, replay } from '../../tools/simulation/runner.mjs';
import { resolveProfile } from '../../tools/simulation/runner.mjs';
import { createPolicy } from '../../tools/simulation/policy.mjs';
import { observe } from '../../tools/simulation/observe.mjs';
import { recipeProfiles } from '../../tools/simulation/profiles.mjs';
import { matrix } from '../../tools/simulation/matrix.mjs';
import { upperBinomial, summarize } from '../../tools/simulation/stats.mjs';
import { createSim, xpForLevel } from '../../src/core/sim.js';
import { createTelemetry } from '../../src/core/telemetry.js';
import { installImmortality, stateHash } from '../../tools/simulation/record.mjs';
import { createLockstep, applyCommand } from '../../src/core/lockstep.js';

const root = new URL('../fixtures/telemetry/', import.meta.url);
const raw = readFileSync(new URL('runs.json', root), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const dataset = JSON.parse(raw).map((r, i) => normalizeRun(r.run, i));

test('pinned dataset checksum, counts and honest missing v1 intervals', () => {
  assert.equal(createHash('sha256').update(raw).digest('hex'), manifest.sha256);
  assert.equal(dataset.length, 13);
  assert.equal(dataset.reduce((n, r) => n + r.decisions.length, 0), 969);
  assert.equal(dataset.reduce((n, r) => n + r.snapshots.length, 0), 135);
  assert.ok(dataset.some((r) => r.intervals.some((i) => !i.complete && i.dealt === null)));
  assert.ok(dataset.every((r) => !r.warnings.includes('reconstructed build differs from final snapshot')));
});

test('new v2 decisions retain observed pre-choice HP and budgets during normalization', () => {
  const sim = createSim({ seed: 18 });
  const telemetry = createTelemetry({ sim });
  sim.player.hp = 13;
  sim.player.xp = sim.player.xpNext;
  sim._checkLevel();
  const rerolls = sim.player.levelUp.rerolls;
  sim.reroll();
  sim.chooseCard(0);
  sim.time = 30;
  const run = normalizeRun(telemetry.finish(sim, { status: 'quit' }));
  const choice = run.decisions.find((d) => d.act === 'take');
  assert.equal(choice.source, 'observed');
  assert.equal(choice.context.hp, 13);
  assert.equal(choice.context.budgets[0], rerolls - 1);
});

test('export checks HTTP, all pages and invalid records rather than inventing zero runs', async () => {
  const pages = [{ documents: [], nextPageToken: 'second' }, { documents: [{ createTime:
    '2026-10-23T01:00:00Z', fields: { data: { stringValue: '{}' } } }] }];
  let calls = 0;
  const result = await fetchRuns({ fetcher: async (url) => {
    if (calls === 1) assert.ok(url.includes('pageToken=second'));
    return { ok: true, json: async () => pages[calls++] };
  } });
  assert.equal(calls, 2);
  assert.equal(result.records.length, 0);
  assert.equal(result.rejected.length, 1);
  await assert.rejects(fetchRuns({ fetcher: async () => ({ ok: false, status: 403 }), retries: 0 }),
      /HTTP 403/);
});

test('model validation holds out whole runs and beats legacy and uniform choices', () => {
  const v = JSON.parse(readFileSync(new URL('validation.json', root), 'utf8'));
  assert.equal(v.dataset, manifest.sha256);
  assert.equal(v.split, 'leave-one-run-out');
  assert.equal(v.folds.length, 13);
  assert.ok(v.gate);
  assert.ok(v.metrics.learned.runMeanLogLoss < v.metrics.legacy.runMeanLogLoss);
});

test('honest solo and duo traces replay every checkpoint and reject altered input', () => {
  for (const players of [1, 2]) {
    const r = runSimulation({ seed: 3, players, until: 120, record: true, checkpointEvery: 300 });
    assert.notEqual(r.outcome, 'error', r.error);
    assert.ok(r.trace.inputs.length > 1);
    assert.ok(r.trace.actions.length > 1);
    assert.equal(replay(r.trace).matched, true);
    const bad = structuredClone(r.trace);
    bad.inputs[0][1] += 0.5;
    assert.throws(() => replay(bad), /diverged|differs/);
    assert.equal(r.interventions.length, 0);
  }
});

test('observation omits hidden data, and policy never consumes the world RNG', () => {
  const sim = createSim({ seed: 4 });
  sim.spawnEnemy('slime', 10000, 10000);
  const p = createPolicy({ seed: 1, profile: resolveProfile('focus') });
  const state = sim.rng.state;
  const o = observe(sim, 0);
  assert.equal(o.enemies.length, 0);
  assert.equal(o.rng, undefined);
  assert.equal(o.sim, undefined);
  p.move(o); p.choose(o);
  assert.equal(sim.rng.state, state);
  assert.equal(recipeProfiles().length, 16);
});

test('no-evolution uses legal refusals; horizon is not defeat', () => {
  const r = runSimulation({ seed: 1, until: 360, noEvolution: [true], record: true });
  assert.notEqual(r.outcome, 'error', r.error);
  assert.equal(r.recipes.length, 0);
  assert.ok(['defeat', 'timeout'].includes(r.outcome));
  assert.ok(r.decisions[0].rerolls <= 3);
  const tiny = runSimulation({ until: 0.1 });
  assert.equal(tiny.outcome, 'timeout');
});

test('immortality intervenes only on lethal damage and preserves normal HP rules', () => {
  const a = createSim({ seed: 1 });
  const b = createSim({ seed: 1 });
  const interventions = installImmortality(b, [true]);
  a.hurtPlayer(20); b.hurtPlayer(20);
  assert.equal(a.player.hp, b.player.hp);
  assert.equal(interventions.length, 0);
  a.player.iframes = 0; b.player.iframes = 0;
  a.hurtPlayer(1000); b.hurtPlayer(1000);
  assert.equal(a.state, 'gameover');
  assert.equal(b.state, 'running');
  assert.equal(b.player.maxHp, a.player.maxHp);
  assert.equal(interventions.length, 1);
  assert.equal(b.player.hp, b.player.maxHp * 0.3);
});

test('headless and zero-delay lockstep apply the same trace at matching ticks', () => {
  const r = runSimulation({ seed: 6, players: 2, until: 30, record: true });
  const q = [[], []];
  const pair = [0, 1].map((local) => createLockstep({ local,
    sim: createSim({ seed: 6, players: 2, heroes: r.config.heroes }), delay: 0, hashEvery: 0,
    send: (msg) => q[1 - local].push(msg) }));
  let ai = 0;
  let ii = 0;
  let input = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  const reference = createSim({ seed: 6, players: 2, heroes: r.config.heroes });
  for (let step = 0; step < r.trace.steps; step++) {
    while (r.trace.actions[ai]?.step === step) {
      const { who, command } = r.trace.actions[ai++];
      pair[who].command(command); applyCommand(reference, who, command);
    }
    if (r.trace.inputs[ii]?.[0] === step) {
      const v = r.trace.inputs[ii++];
      input = [{ x: v[1], y: v[2] }, { x: v[3], y: v[4] }];
    }
    for (let guard = 0; pair.some((p) => p.tick <= step); guard++) {
      assert.ok(guard < 10);
      pair.forEach((p, i) => { if (p.tick <= step) p.advance(input[i], 1 / 60); });
      pair.forEach((p, i) => { for (const msg of q[i].splice(0)) p.receive(msg); });
    }
    reference.step(1 / 60, { players: input });
    if (step % 120 === 0) {
      assert.equal(stateHash(pair[0].sim), stateHash(reference));
      assert.equal(stateHash(pair[1].sim), stateHash(reference));
    }
  }
});

test('qualification seeds are disjoint and missing/errors cannot pass the statistical gate', () => {
  const a = matrix({ n: 20, split: 'tuning' });
  const b = matrix({ n: 20, split: 'qualification' });
  assert.ok(!a.some((r) => b.some((s) => s.seed === r.seed)));
  assert.ok(upperBinomial(0, 200) < 0.05);
  const summary = summarize([{ config: { difficulty: 'normal', players: 1,
    immortal: [], noEvolution: [] }, outcome: 'error', minutes: [], interventions: [], wallMs: 0 }]);
  assert.equal(summary['normal/1/human'].qualified, false);
});

test('banking profile ignores loose XP and seeks a magnet visible on the real minimap', () => {
  const sim = createSim({ seed: 8 });
  sim.player.level = 15; sim.time = 120;
  sim.dropPickup('xp_small', sim.player.x + 80, sim.player.y, 20);
  sim.dropPickup('magnet', sim.player.x - 500, sim.player.y);
  sim.dropPickup('xp_small', sim.player.x + 10000, sim.player.y, 999);
  const o = observe(sim, 0);
  assert.equal(o.pickups.filter((x) => x.kind === 'xp').length, 1);
  assert.equal(o.pickups.find((x) => x.kind === 'magnet').source, 'minimap');
  const banker = createPolicy({ seed: 1, profile: resolveProfile('focus') });
  const steady = createPolicy({ seed: 1, profile: resolveProfile('defensive') });
  assert.ok(banker.move(o).x < -0.5);
  assert.ok(steady.move(o).x > 0.5);
});

test('experimental balance overrides replay exactly and restore production data', () => {
  const before = runSimulation({ seed: 19, until: 5 });
  const r = runSimulation({ seed: 19, until: 20, record: true,
    players: 2, experiment: { cursedXP: 0.77, coopXP: 1.75, coopLevelScale: 2,
      xp: { thresholds: [], steps: [{ below: 1000000000, per: 18 }] } } });
  assert.notEqual(r.outcome, 'error', r.error);
  assert.equal(replay(r.trace).matched, true);
  assert.equal(runSimulation({ seed: 19, until: 5 }).fingerprint, before.fingerprint);
});

test('duo personal-round pricing repeats each solo price for two shared levels', () => {
  for (let level = 1; level <= 45; level++) {
    assert.equal(xpForLevel(level * 2 - 1, 2), xpForLevel(level));
    assert.equal(xpForLevel(level * 2, 2), xpForLevel(level));
  }
});

test('expired or pooled shields cannot keep blocking projectiles', () => {
  const sim = createSim({ seed: 1 });
  const projectile = { x: 0, y: 0, radius: 2, dmg: 20 };
  const shield = { x: 0, y: 0, radius: 10, life: 0, blocks: true,
    wid: 'guardian_shields', ws: null };
  assert.equal(sim._blocked(projectile, [shield]), false);
  shield.life = 1;
  shield.ws = { owner: sim.player };
  assert.equal(sim._blocked(projectile, [shield]), true);
  shield.blocks = false; // object reused from the projectile pool
  assert.equal(sim._blocked(projectile, [shield]), false);
});
