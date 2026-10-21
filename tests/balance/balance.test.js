import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBot } from './bot.js';
import { SIM } from '../../src/data/constants.js';

// Боты играют на core/sim с фиксированными сидами; весь файл должен работать быстро.
const withUpgrades = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => runBot({ seed, upgrades: true }));
const withoutUpgrades = [1, 2, 3, 4, 5].map((seed) => runBot({ seed, upgrades: false }));

test('balance: level at 5:00 is in range', () => {
  for (const r of withUpgrades) {
    const lv = r.levelAt[300];
    assert.ok(lv >= 12 && lv <= 24, `level at 5:00 = ${lv}`);
  }
});

test('balance: level 10 comes between 1:20 and 5:00', () => {
  for (const r of withUpgrades) {
    const t = r.levelTimes[10];
    assert.ok(t >= 80 && t <= 300, `level 10 at ${t}s`);
  }
});

test('balance: bot without upgrades dies before 4:00', () => {
  for (const r of withoutUpgrades) {
    assert.equal(r.state, 'gameover');
    assert.ok(r.deathTime < 240, `died at ${r.deathTime.toFixed(0)}s`);
  }
});

// Жадный бот иногда собирает слабый билд, поэтому требуем большинство, а не все сиды.
test('balance: bot with upgrades survives to the boss on at least 6 of 8 seeds', () => {
  const alive = withUpgrades.filter((r) => r.time >= 600);
  const deaths = withUpgrades.filter((r) => r.time < 600).map((r) => r.time.toFixed(0));
  assert.ok(alive.length >= 6, `survived ${alive.length}/8, deaths at ${deaths.join(', ')}s`);
  for (const r of alive) assert.ok(r.sim.enemies.some((e) => e.boss) || r.state === 'victory', 'boss spawned');
});

test('balance: enemy count never exceeds the limit', () => {
  for (const r of [...withUpgrades, ...withoutUpgrades]) assert.ok(r.maxEnemies <= SIM.maxEnemies, `max ${r.maxEnemies}`);
});

test('balance: boss can be beaten by a strong bot (victory ends the run)', () => {
  const r = runBot({ seed: 1, upgrades: true, until: 900 });
  assert.equal(r.state, 'victory');
  assert.ok(r.victoryTime > 600);
});

test('balance: same seed gives the same run', () => {
  const a = runBot({ seed: 1, upgrades: true, until: 200 });
  const b = runBot({ seed: 1, upgrades: true, until: 200 });
  assert.equal(a.sim.kills, b.sim.kills);
  assert.equal(a.sim.player.level, b.sim.player.level);
  assert.equal(a.sim.player.hp, b.sim.player.hp);
});
