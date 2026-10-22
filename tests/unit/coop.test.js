import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import { COOP } from '../../src/data/coop.js';
import { SLOTS, GAME_WIDTH } from '../../src/data/constants.js';

const DT = 1 / 60;
const idle = { x: 0, y: 0 };

function run(sim, seconds, input = idle) {
  for (let i = 0; i < seconds / DT; i++) sim.step(DT, input);
}

function coop(seed = 1) {
  return createSim({ seed, players: 2 });
}

test('coop: two players share xp and level, each has own weapons and fewer slots', () => {
  const sim = coop();
  assert.equal(sim.coop, true);
  assert.equal(sim.players.length, 2);
  assert.equal(sim.player, sim.players[0]);
  assert.deepEqual(sim.players[1].slots, COOP.slots);
  assert.ok(COOP.slots.weapons < SLOTS.weapons);
  const solo = createSim({ seed: 1 });
  assert.equal(solo.coop, false);
  assert.deepEqual(solo.player.slots, SLOTS);
  for (const p of sim.players) assert.deepEqual(p.weapons.map((w) => w.id), ['blade_arc']);
  assert.notEqual(sim.players[0].stats, sim.players[1].stats);
});

test('coop: each player moves by own input, the view is the midpoint, nobody leaves the screen', () => {
  const sim = coop();
  run(sim, 2, { players: [{ x: -1, y: 0 }, { x: 1, y: 0 }] });
  const [a, b] = sim.players;
  assert.ok(a.x < 0 && b.x > 0, `${a.x} ${b.x}`);
  assert.ok(Math.abs(sim.view.x - (a.x + b.x) / 2) < 1e-6);
  run(sim, 20, { players: [{ x: -1, y: 0 }, { x: 1, y: 0 }] });
  assert.ok(sim.players[1].x - sim.players[0].x <= GAME_WIDTH - 2 * COOP.edge + 1e-6);
  // в соло вход без players работает как раньше
  const solo = createSim({ seed: 1 });
  run(solo, 1, { x: 1, y: 0 });
  assert.ok(solo.player.x > 0);
});

test('coop: enemies chase the nearest living player', () => {
  const sim = coop(3);
  const [a, b] = sim.players;
  a.x = -200; b.x = 200;
  assert.equal(sim.target(-150, 0), a);
  assert.equal(sim.target(150, 0), b);
  b.dead = true;
  assert.equal(sim.target(150, 0), a);
});

test('coop: spawns more enemies with more hp than solo', () => {
  const sim = coop(5);
  const solo = createSim({ seed: 5 });
  assert.ok(sim.spawnMul > solo.spawnMul);
  const e = sim.spawnEnemy('slime', 300, 0);
  const s = solo.spawnEnemy('slime', 300, 0);
  assert.ok(Math.abs(e.maxHp / s.maxHp - COOP.enemyHpMul) < 1e-6, `${e.maxHp} vs ${s.maxHp}`);
  const alive = (x) => x.enemies.filter((o) => !o.dead).length;
  // шаг с открытым экраном карточек не идёт: ждём ровно 30 игровых секунд в обоих забегах
  const play = (x) => {
    for (let i = 0; i < 60 * 60 && x.time < 30; i++) {
      if (x.state === 'levelup') x.chooseCard(0);
      if (x.state === 'chest') x.skipChest();
      x.step(DT, idle);
    }
  };
  play(sim); play(solo);
  assert.ok(alive(sim) > alive(solo), `${alive(sim)} vs ${alive(solo)}`);
});

test('coop: a dead player becomes a coffin and revives, the run ends only when both are dead', () => {
  const sim = coop(7);
  const [a, b] = sim.players;
  a.x = 0; b.x = 300;
  sim.hurtPlayer(1e9, a);
  assert.equal(sim.state, 'running');
  assert.ok(a.dead && a.coffinT === COOP.reviveTime);
  assert.ok(sim.events.some((e) => e.type === 'playerDown' && e.player === 0));
  // враги на гробу замедляют таймер не больше чем в 1/enemySlow раз
  const both = { players: [idle, idle] };
  run(sim, COOP.reviveTime * 0.5, both);
  assert.ok(a.dead, 'still a coffin halfway');
  let t = 0;
  while (a.dead && t < COOP.reviveTime / COOP.enemySlow + 1) {
    if (sim.state === 'levelup') sim.chooseCard(0);
    sim.step(DT, both);
    t += DT;
  }
  assert.ok(!a.dead, 'revived after the timer');
  assert.ok(a.hp > 0 && a.iframes > 0 && a.revives === 1);
  a.iframes = 0; b.iframes = 0;
  sim.hurtPlayer(1e9, a);
  sim.hurtPlayer(1e9, b);
  assert.equal(sim.state, 'gameover');
});

test('coop: a partner next to the coffin speeds up the revive', () => {
  const far = coop(8);
  far.players[1].x = 300;
  far.hurtPlayer(1e9, far.players[0]);
  const near = coop(8);
  near.players[1].x = 10;
  near.hurtPlayer(1e9, near.players[0]);
  run(far, 2, { players: [idle, idle] });
  run(near, 2, { players: [idle, idle] });
  assert.ok(near.players[0].coffinT < far.players[0].coffinT - 1);
});

test('coop: level-up cards alternate between players and apply to the chooser', () => {
  const sim = coop(9);
  const [a, b] = sim.players;
  sim.player.xp = sim.player.xpNext;
  sim.step(DT, { players: [idle, idle] });
  assert.equal(sim.state, 'levelup');
  assert.equal(sim.levelUp.player, 0);
  const build = (p) => JSON.stringify([
    p.weapons.map((w) => [w.id, w.level]), p.passives.map((q) => [q.id, q.level]),
  ]);
  const before = build(a);
  sim.chooseCard(0);
  assert.notEqual(build(a), before);
  assert.equal(build(b), JSON.stringify([[['blade_arc', 1]], []]));
  sim.player.xp = sim.player.xpNext;
  sim.step(DT, { players: [idle, idle] });
  assert.equal(sim.levelUp.player, 1);
  const b0 = build(b);
  sim.chooseCard(0);
  assert.notEqual(build(b), b0);
});

test('coop: the chest goes to whoever picked it up', () => {
  const sim = coop(10);
  const b = sim.players[1];
  b.x = 300;
  sim.dropPickup('chest', 300, 0, 0);
  sim.step(DT, { players: [idle, idle] });
  const ev = sim.events.find((e) => e.type === 'chest');
  assert.ok(ev && ev.player === 1, JSON.stringify(ev));
  assert.ok(b.weapons.some((w) => w.level > 1) || b.weapons.length > 1 || b.passives.length > 0);
});

test('coop: same seed and inputs give the same run', () => {
  const inp = { players: [{ x: 1, y: 0.3 }, { x: -0.5, y: 1 }] };
  const a = coop(11);
  const b = coop(11);
  run(a, 60, inp); run(b, 60, inp);
  const snap = (s) => JSON.stringify([
    s.time, s.kills, s.players.map((p) => [p.x, p.y, p.hp]), s.enemies.length,
  ]);
  assert.equal(snap(a), snap(b));
});
