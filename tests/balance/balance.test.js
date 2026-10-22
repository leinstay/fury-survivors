import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBot } from './bot.js';
import { SIM } from '../../src/data/constants.js';
import { createSim } from '../../src/core/sim.js';

// Боты играют на core/sim с фиксированными сидами; весь файл должен работать быстро.
const withUpgrades = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => runBot({ seed, upgrades: true }));
const withoutUpgrades = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  .map((seed) => runBot({ seed, upgrades: false }));

// Кривая опыта как в VS (5, затем +10 за уровень): жадный бот к 5:00 на 9-21 уровне, человек выше.
test('balance: level at 5:00 is in range', () => {
  // считаем только забеги, дожившие до 5:00
  for (const r of withUpgrades.filter((x) => x.time >= 300)) {
    const lv = r.levelAt[300];
    assert.ok(lv >= 8 && lv <= 24, `level at 5:00 = ${lv}`);
  }
});

test('balance: level 10 comes between 1:20 and 5:30', () => {
  // забеги, дожившие до 5:30
  for (const r of withUpgrades.filter((x) => x.time >= 330)) {
    const t = r.levelTimes[10];
    assert.ok(t >= 80 && t <= 330, `level 10 at ${t}s`);
  }
});

// Стоять на месте с максимальными чесноком и молниями нельзя: без движения толпа продавливает (проверка
// жалобы «встал в чеснок и победил»). Бот не двигается и не выбирает карточки.
test('balance: standing still with maxed Holy Ground + Storm Chain dies before 10:00', () => {
  for (const seed of [1, 2, 3]) {
    const sim = createSim({ seed });
    sim.player.weapons.length = 0;
    sim.player.weapons.push({ id: 'holy_ground', level: 7 }, { id: 'storm_chain', level: 7 });
    sim._syncBuild();
    const idle = { x: 0, y: 0 };
    while (sim.time < 600 && sim.state !== 'gameover') {
      if (sim.state !== 'running') sim.state = 'running';
      sim.step(1 / 30, idle);
    }
    assert.equal(sim.state, 'gameover', `seed ${seed}: survived to 10:00 standing still`);
  }
});

// Обычную толпу можно обогнать (как в VS): без оружия бег по большой дуге живёт заметно дольше, чем стояние.
test('balance: running away without weapons outlives standing still', () => {
  const life = (seed, run) => {
    const sim = createSim({ seed });
    sim.player.weapons.length = 0;
    sim._syncBuild();
    while (sim.state === 'running' && sim.time < 120) {
      const a = sim.time * 0.02;
      sim.step(1 / 30, run ? { x: Math.cos(a), y: Math.sin(a) } : { x: 0, y: 0 });
    }
    return sim.time;
  };
  const seeds = [1, 2, 3, 4];
  const stand = seeds.reduce((s, x) => s + life(x, false), 0);
  const run = seeds.reduce((s, x) => s + life(x, true), 0);
  assert.ok(run >= stand * 1.8, `running ${run.toFixed(0)}s vs standing ${stand.toFixed(0)}s (sum of 4 seeds)`);
});

test('balance: bot without upgrades dies before 4:00 (median of 10 seeds), never past 10:00', () => {
  // Разброс по сидам большой (любое событие таймлайна или объект чанка сдвигает поток RNG, а удачный кайт
  // на пределе врагов тянется долго), поэтому порог на медиану; до 10:00 не доживает никто.
  const times = withoutUpgrades.map((r) => {
    assert.equal(r.state, 'gameover');
    assert.ok(r.deathTime < 600, `died at ${r.deathTime.toFixed(0)}s`);
    return r.deathTime;
  }).sort((a, b) => a - b);
  const median = (times[4] + times[5]) / 2;
  assert.ok(median < 240, `median death ${median.toFixed(0)}s`);
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
    if (r.sim.won && Object.keys(killed).length === 3) { found = { r, killed }; break; }
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
  assert.ok(r.sim.won);
  for (const id of ['kitsune_empress', 'harpy_queen', 'dryad_queen']) assert.ok(seen[id] && seen[id].min < 1, id);
});

test('balance: co-op pair with upgrades reaches the first boss on at least 4 of 8 seeds and kills more than solo', () => {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  let alive = 0;
  const killsCoop = [];
  const killsSolo = [];
  for (const seed of seeds) {
    const c = runBot({ seed, preset: 'greedy', players: 2, until: 301 });
    const s = runBot({ seed, preset: 'greedy', until: 301 });
    if (c.state !== 'gameover') alive++;
    killsCoop.push(c.sim.kills);
    killsSolo.push(s.sim.kills);
  }
  const median = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  assert.ok(alive >= 4, `co-op alive at 5:00 on ${alive}/8 seeds`);
  assert.ok(median(killsCoop) > median(killsSolo), `kills co-op ${median(killsCoop)} vs solo ${median(killsSolo)}`);
});
