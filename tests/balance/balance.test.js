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

// Жадный бот играет хуже человека: цель сложности — он доживает до первого босса (5:00) на большинстве сидов,
// а дальше идёт игрок, который сам выбирает билд, уворачивается и лечится.
test('balance: greedy bot with upgrades reaches the first boss (5:00) on at least 6 of 8 seeds', () => {
  const alive = withUpgrades.filter((r) => r.time >= 300);
  const times = withUpgrades.map((r) => r.time.toFixed(0));
  assert.ok(alive.length >= 6, `survived 5:00 on ${alive.length}/8, run times ${times.join(', ')}s`);
});

// Бот с полным лечением каждую секунду: проверяет, что босс появляется и убиваем сильным билдом.
const heal = (sim) => { sim.player.hp = sim.player.maxHp; };

test('balance: enemy count never exceeds the limit', () => {
  for (const r of [...withUpgrades, ...withoutUpgrades]) assert.ok(r.maxEnemies <= SIM.maxEnemies, `max ${r.maxEnemies}`);
});

test('balance: all three bosses can be beaten by a healed strong bot, only the last ends the run', () => {
  // Даже с лечением раз в секунду бот может погибнуть от пачки ударов, поэтому берём первый сид, где все боссы убиты.
  let found = null;
  for (const seed of [1, 2, 3, 4]) {
    const killed = {};
    const r = runBot({
      seed, upgrades: true, until: 1100, onSecond: heal,
      onEvents: (evs) => { for (const ev of evs) if (ev.type === 'kill' && ev.boss) killed[ev.enemy] = true; },
    });
    if (r.state === 'victory' && Object.keys(killed).length === 3) { found = { r, killed }; break; }
  }
  assert.ok(found, 'no seed in 1-4 where the bot killed all 3 bosses');
  assert.ok(found.r.victoryTime > 900);
  assert.deepEqual(Object.keys(found.killed).sort(), ['dryad_queen', 'harpy_queen', 'kitsune_empress']);
});

test('balance: same seed gives the same run', () => {
  const a = runBot({ seed: 1, upgrades: true, until: 200 });
  const b = runBot({ seed: 1, upgrades: true, until: 200 });
  assert.equal(a.sim.kills, b.sim.kills);
  assert.equal(a.sim.player.level, b.sim.player.level);
  assert.equal(a.sim.player.hp, b.sim.player.hp);
});

test('balance: bosses are not immortal: each takes damage within 3 minutes of appearing', () => {
  const seen = {};
  const r = runBot({
    seed: 1, upgrades: true, until: 1100,
    onSecond: (sim) => {
      heal(sim);
      for (const e of sim.enemies) {
        if (!e.boss) continue;
        const s = seen[e.type] || (seen[e.type] = { t0: sim.time, min: 1 });
        s.min = Math.min(s.min, e.hp / e.maxHp);
        if (sim.time - s.t0 > 180) assert.ok(s.min < 1, `${e.type} took no damage in 3 minutes`);
      }
    },
  });
  assert.equal(r.state, 'victory');
  for (const id of ['kitsune_empress', 'harpy_queen', 'dryad_queen']) assert.ok(seen[id] && seen[id].min < 1, id);
});
