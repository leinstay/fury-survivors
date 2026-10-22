import test from 'node:test';
import assert from 'node:assert/strict';
import {
  topTen, rankOf, computeScore, createLeaderboard, fetchTop10, submitScore, __setBackendForTests,
} from '../../src/services/leaderboard.js';
import { SCORE_FORMULA } from '../../src/data/leaderboard.js';

const run = (extra = {}) => ({ name: 'lein', score: 1500, time: 100, kills: 500, level: 8, victory: false, ...extra });

function fake({ rows = [], failTop = null, failAdd = null } = {}) {
  const added = [];
  const loadBackend = async () => ({
    async top() { if (failTop) throw failTop; return rows; },
    async add(doc) { if (failAdd) throw failAdd; added.push(doc); },
  });
  return { added, loadBackend };
}

test('computeScore: data formula', () => {
  const f = SCORE_FORMULA;
  assert.equal(computeScore({ time: 100.9, kills: 50, victory: false }),
      100 * f.perSecond + 50 * f.perKill);
  assert.equal(computeScore({ time: 600, kills: 0, victory: true }),
      600 * f.perSecond + f.victoryBonus);
  assert.equal(computeScore({}), 0);
});

test('topTen: one best row per player, sorted, trimmed, upper-cased', () => {
  const rows = [
    { name: 'bob', score: 10 }, { name: 'BOB', score: 50, time: 7, kills: 3 },
    { name: 'ann', score: 50 }, { name: 'cat', score: 5 },
    null, { name: 5, score: 1 }, { name: 'bad', score: 'x' },
  ];
  const top = topTen(rows);
  assert.deepEqual(top.map((r) => [r.name, r.score]), [['BOB', 50], ['ANN', 50], ['CAT', 5]]);
  assert.equal(top[0].time, 7);
  assert.equal(topTen(Array.from({ length: 30 }, (_, i) => ({ name: `p${i}`, score: i })), 10).length, 10);
  assert.deepEqual(topTen(null), []);
  assert.equal(rankOf(top, 'ann'), 2);
  assert.equal(rankOf(top, 'zed'), 0);
});

test('fetchTop10 through a fake backend', async () => {
  const f = fake({ rows: [{ name: 'aaa', score: 3 }, { name: 'bbb', score: 9 }] });
  const lb = createLeaderboard({ loadBackend: f.loadBackend });
  assert.deepEqual((await lb.fetchTop10()).map((r) => r.name), ['BBB', 'AAA']);
});

test('errors: offline, denied, invalid, cooldown', async () => {
  const off = createLeaderboard({ loadBackend: async () => { throw new Error('network'); } });
  await assert.rejects(off.fetchTop10(), { message: 'offline' });
  await assert.rejects(off.submitScore(run()), { message: 'offline' });

  const denied = createLeaderboard({ loadBackend: fake({ failAdd: Object.assign(new Error('x'), { code: 'permission-denied' }) }).loadBackend });
  await assert.rejects(denied.submitScore(run()), { message: 'denied' });

  const f = fake();
  const lb = createLeaderboard({ loadBackend: f.loadBackend });
  for (const bad of [run({ name: 'ab' }), run({ name: 'a b c' }), run({ score: 0 }), run({ score: 1e8 }), run({ level: 0 }), run({ time: -1 }), null]) {
    await assert.rejects(lb.submitScore(bad), { message: 'invalid' });
  }
  assert.equal(f.added.length, 0);

  let clock = 1000;
  const cd = createLeaderboard({
    loadBackend: fake().loadBackend, now: () => clock, cooldownMs: 10000,
  });
  await cd.submitScore(run());
  await assert.rejects(cd.submitScore(run()), { message: 'cooldown' });
  clock += 10001;
  await cd.submitScore(run());
});

test('submit writes a normalized document; failed write does not start cooldown', async () => {
  const f = fake();
  const lb = createLeaderboard({ loadBackend: f.loadBackend, now: () => 5 });
  await lb.submitScore(run({ victory: true, time: 12.7 }));
  assert.deepEqual(f.added[0], { name: 'LEIN', score: 1500, time: 12, kills: 500, level: 8, victory: true });

  let fail = true;
  const flaky = createLeaderboard({
    now: () => 5,
    loadBackend: async () => ({ top: async () => [], add: async () => { if (fail) throw new Error('net'); } }),
  });
  await assert.rejects(flaky.submitScore(run()), { message: 'offline' });
  fail = false;
  await flaky.submitScore(run());
});

test('timeout gives offline; module seam works', async () => {
  const hang = createLeaderboard({ loadBackend: () => new Promise(() => {}), timeoutMs: 20 });
  await assert.rejects(hang.fetchTop10(), { message: 'offline' });

  __setBackendForTests({ loadBackend: fake({ rows: [{ name: 'zed', score: 1 }] }).loadBackend });
  assert.equal((await fetchTop10())[0].name, 'ZED');
  await submitScore(run());
  __setBackendForTests();
});

test('submit after a timeout waits for the same write instead of adding a second document', async () => {
  const added = [];
  let release;
  const slow = new Promise((r) => { release = r; });
  const loadBackend = async () => ({
    async top() { return []; },
    async add(doc) { await slow; added.push(doc); },
  });
  let clock = 0;
  const lb = createLeaderboard({ loadBackend, now: () => clock, timeoutMs: 5, cooldownMs: 10000 });
  await assert.rejects(lb.submitScore(run()), { message: 'offline' });
  const again = lb.submitScore(run());
  release();
  await again;
  assert.equal(added.length, 1);
  clock += 1;
  await assert.rejects(lb.submitScore(run()), { message: 'cooldown' });
});
