import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import { COOP } from '../../src/data/coop.js';
import { DEFAULT_HERO } from '../../src/data/heroes.js';
import { validHero, freeHero, distinctHeroes, heroIds } from '../../src/core/heroes.js';
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
  // герои по умолчанию: первые два из data/heroes.js, разные
  assert.deepEqual(sim.players.map((p) => p.hero), heroIds().slice(0, 2));
  assert.deepEqual(sim.players.map((p) => p.weapons[0].id), ['blade_arc', 'storm_chain']);
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
      if (x.state === 'levelup') x.chooseCard(0, x.picker);
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
  b.iframes = 1e9; // напарник стоит на месте и не должен умереть раньше, чем оживёт гроб
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
    if (sim.state === 'levelup') sim.chooseCard(0, sim.picker);
    if (sim.state === 'chest') sim.skipChest();
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
  assert.equal(sim.picker, 0);
  const build = (p) => JSON.stringify([
    p.weapons.map((w) => [w.id, w.level]), p.passives.map((q) => [q.id, q.level]),
  ]);
  const before = build(a);
  sim.chooseCard(0, 1); // не его ход: ничего
  assert.equal(sim.state, 'levelup');
  sim.chooseCard(0, 0);
  assert.notEqual(build(a), before);
  assert.equal(build(b), JSON.stringify([[['storm_chain', 1]], []]));
  sim.player.xp = sim.player.xpNext;
  sim.step(DT, { players: [idle, idle] });
  assert.equal(sim.picker, 1);
  const b0 = build(b);
  sim.chooseCard(0, 1);
  assert.notEqual(build(b), b0);
});

test('coop: each player has an own pool: banished cards and reroll/skip/banish budgets', () => {
  const sim = coop(11);
  const [a, b] = sim.players;
  const lvl = () => { sim.player.xp = sim.player.xpNext; sim.step(DT, { players: [idle, idle] }); };
  lvl();
  assert.equal(sim.picker, 0);
  const victim = a.levelUp.cards[0];
  assert.ok(sim.banish(0, 0));
  assert.ok(sim.reroll(0));
  assert.equal(sim.reroll(1), false, 'partner cannot spend my rerolls');
  assert.ok(a.levelUp.banished.has(`${victim.kind}:${victim.id}`));
  assert.equal(b.levelUp.banished.size, 0);
  assert.ok(sim.skip(0));
  assert.equal(sim.state, 'running');
  lvl();
  assert.equal(sim.picker, 1);
  assert.equal(b.levelUp.rerolls, a.levelUp.rerolls + 1);
  assert.equal(b.levelUp.banishes, a.levelUp.banishes + 1);
  assert.equal(b.levelUp.skips, a.levelUp.skips + 1);
  assert.ok(!a.levelUp.cards.length && b.levelUp.cards.length > 0);
});

test('coop: damage and DPS are counted per player', () => {
  const sim = coop(12);
  const [a, b] = sim.players;
  const e = sim.spawnEnemy('slime', 40, 0);
  sim.damageEnemy(e, 3, 'storm_chain', 0, 0, 0, b);
  assert.ok(b.damageByWeapon.storm_chain >= 3); // крит магессы может удвоить
  assert.equal(a.damageByWeapon.storm_chain, undefined);
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

test('heroes: solo hero choice, distinct heroes per player in co-op', () => {
  const solo = createSim({ seed: 1, hero: 'mage' });
  assert.equal(solo.player.hero, 'mage');
  assert.equal(solo.player.sprite, 'mage');
  assert.equal(solo.player.weapons[0].id, 'storm_chain');
  assert.equal(solo.player.maxHp, 80);
  assert.equal(createSim({ seed: 1, hero: 'nope' }).player.hero, DEFAULT_HERO);
  const swap = createSim({ seed: 1, players: 2, heroes: ['mage', 'heroine'] });
  assert.deepEqual(swap.players.map((p) => p.weapons[0].id), ['storm_chain', 'blade_arc']);
  // один герой на двоих не бывает: второму достаётся первый свободный
  const same = createSim({ seed: 1, players: 2, heroes: ['mage', 'mage'] });
  assert.deepEqual(same.players.map((p) => p.hero), ['mage', 'heroine']);
  const bad = createSim({ seed: 1, players: 2, heroes: ['nope', 'mage'] });
  assert.deepEqual(bad.players.map((p) => p.hero), [DEFAULT_HERO, 'mage']);
  const none = createSim({ seed: 1, players: 2 });
  assert.notEqual(none.players[0].hero, none.players[1].hero);
});

test('heroes: core helpers', () => {
  assert.equal(validHero('mage'), 'mage');
  assert.equal(validHero('x'), DEFAULT_HERO);
  assert.equal(validHero(undefined), DEFAULT_HERO);
  assert.equal(freeHero(['heroine'], 'heroine'), 'mage');
  assert.equal(freeHero([], 'mage'), 'mage');
  assert.deepEqual(distinctHeroes(2, ['mage', 'mage']), ['mage', 'heroine']);
  assert.deepEqual(distinctHeroes(2), heroIds().slice(0, 2));
});
