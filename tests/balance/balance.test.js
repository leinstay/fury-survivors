import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBot } from './bot.js';
import { SIM } from '../../src/data/constants.js';

// Боты играют на core/sim с фиксированными сидами; весь файл должен работать быстро.
const withUpgrades = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => runBot({ seed, upgrades: true }));
const withoutUpgrades = [1, 2, 3, 4, 5].map((seed) => runBot({ seed, upgrades: false }));

test('balance: level at 5:00 is in range', () => {
  // считаем только забеги, дожившие до 5:00
  for (const r of withUpgrades.filter((x) => x.time >= 300)) {
    const lv = r.levelAt[300];
    assert.ok(lv >= 12 && lv <= 26, `level at 5:00 = ${lv}`);
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

// Жадный бот играет хуже человека: цель сложности — он доживает до 6:00 на большинстве сидов,
// а до босса доходит игрок, который сам выбирает билд и уворачивается.
test('balance: greedy bot with upgrades survives past 6:00 on at least 6 of 8 seeds', () => {
  const alive = withUpgrades.filter((r) => r.time >= 360);
  const times = withUpgrades.map((r) => r.time.toFixed(0));
  assert.ok(alive.length >= 6, `survived 6:00 on ${alive.length}/8, run times ${times.join(', ')}s`);
});

// Бот с полным лечением каждую секунду: проверяет, что босс появляется и убиваем сильным билдом.
const heal = (sim) => { sim.player.hp = sim.player.maxHp; };

test('balance: enemy count never exceeds the limit', () => {
  for (const r of [...withUpgrades, ...withoutUpgrades]) assert.ok(r.maxEnemies <= SIM.maxEnemies, `max ${r.maxEnemies}`);
});

test('balance: boss can be beaten by a strong bot (victory ends the run)', () => {
  // Даже с лечением раз в секунду бот может погибнуть от пачки ударов, поэтому берём первый сид с победой.
  const r = [1, 2, 3, 4].map((seed) => runBot({ seed, upgrades: true, until: 900, onSecond: heal })).find((x) => x.state === 'victory');
  assert.ok(r, 'no victory on seeds 1-4');
  assert.ok(r.victoryTime > 600);
});

test('balance: same seed gives the same run', () => {
  const a = runBot({ seed: 1, upgrades: true, until: 200 });
  const b = runBot({ seed: 1, upgrades: true, until: 200 });
  assert.equal(a.sim.kills, b.sim.kills);
  assert.equal(a.sim.player.level, b.sim.player.level);
  assert.equal(a.sim.player.hp, b.sim.player.hp);
});

test('balance: boss is not immortal (takes damage within 3 minutes) and bot kills it on some seed', () => {
  let victories = 0;
  for (const seed of [1, 2, 3, 4]) {
    let minRatio = 1;
    let sawBoss = false;
    const r = runBot({
      seed, upgrades: true, until: 780,
      onSecond: (sim) => { heal(sim); if (sim.boss) { sawBoss = true; minRatio = Math.min(minRatio, sim.boss.hp / sim.boss.maxHp); } },
    });
    if (r.state === 'victory') { victories++; continue; }
    if (r.state === 'gameover' && r.time < 600) continue; // не дожил до босса
    assert.ok(sawBoss, `seed ${seed}: boss appeared`);
    assert.ok(minRatio < 1, `seed ${seed}: boss took no damage`);
  }
  assert.ok(victories >= 1, 'bot beat the boss on at least one of 4 seeds');
});
