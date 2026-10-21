import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, xpForLevel } from '../../src/core/sim.js';
import { SIM, XP, LEVEL_UP } from '../../src/data/constants.js';
import { PICKUPS } from '../../src/data/pickups.js';

const DT = 1 / 60;
const idle = { x: 0, y: 0 };

function run(sim, seconds, input = idle) {
  for (let i = 0; i < seconds / DT; i++) sim.step(DT, input);
}

test('sim: contract fields exist at start', () => {
  const sim = createSim({ hero: 'heroine', stage: 'forest', seed: 1 });
  assert.equal(sim.state, 'running');
  assert.equal(sim.time, 0);
  assert.equal(sim.kills, 0);
  for (const k of ['x', 'y', 'hp', 'maxHp', 'level', 'xp', 'xpNext', 'facing', 'moving', 'iframes', 'hurtFlash', 'weapons', 'passives', 'stats']) {
    assert.ok(k in sim.player, `player.${k}`);
  }
  assert.deepEqual(sim.player.weapons.map((w) => [w.id, w.level]), [['blade_arc', 1]]);
  for (const k of ['enemies', 'projectiles', 'pickups', 'props', 'events']) assert.ok(Array.isArray(sim[k]), k);
  assert.equal(typeof sim.damageByWeapon, 'object');
  assert.ok(sim.props.length > 0 && sim.props.every((p) => p.breakable && p.uid && p.sprite));
});

test('sim: entity fields follow the contract after some play', () => {
  const sim = createSim({ seed: 2 });
  run(sim, 30, { x: 1, y: 0 });
  assert.ok(sim.player.x > 0 && sim.player.moving && sim.player.facing === 1);
  assert.ok(sim.enemies.length > 0);
  for (const e of sim.enemies) {
    for (const k of ['uid', 'type', 'sprite', 'x', 'y', 'hp', 'maxHp', 'size', 'facing', 'elite', 'boss', 'hitFlash', 'moving']) assert.ok(k in e, `enemy.${k}`);
  }
  for (const p of sim.projectiles) for (const k of ['uid', 'sprite', 'x', 'y', 'angle', 'scale', 'alpha', 'owner']) assert.ok(k in p, `projectile.${k}`);
  for (const p of sim.pickups) for (const k of ['uid', 'type', 'sprite', 'x', 'y']) assert.ok(k in p, `pickup.${k}`);
  const uids = sim.enemies.map((e) => e.uid);
  assert.equal(new Set(uids).size, uids.length);
});

test('sim: deterministic for the same seed', () => {
  const a = createSim({ seed: 7 });
  const b = createSim({ seed: 7 });
  const c = createSim({ seed: 8 });
  for (let i = 0; i < 1800; i++) {
    const inp = { x: Math.cos(i / 90), y: Math.sin(i / 70) };
    a.step(DT, inp); b.step(DT, inp); c.step(DT, inp);
  }
  assert.equal(a.kills, b.kills);
  assert.equal(a.player.hp, b.player.hp);
  assert.equal(a.enemies.length, b.enemies.length);
  assert.equal(a.pickups.length, b.pickups.length);
  assert.notEqual(JSON.stringify(a.enemies.map((e) => [e.x, e.y])), JSON.stringify(c.enemies.map((e) => [e.x, e.y])));
});

test('sim: events are cleared every step and weapons fire', () => {
  const sim = createSim({ seed: 3 });
  const types = new Set();
  for (let i = 0; i < 1200; i++) {
    sim.step(DT, idle);
    for (const ev of sim.events) types.add(ev.type);
  }
  assert.ok(types.has('weaponFire'));
  assert.ok(types.has('hit'));
  sim.step(DT, idle);
  const before = sim.events.length;
  sim.step(DT, idle);
  assert.ok(sim.events.length <= before + 50);
  assert.ok(sim.damageByWeapon.blade_arc > 0);
});

test('sim: level up flow, step is frozen while choosing', () => {
  const sim = createSim({ seed: 4 });
  sim.player.xp = sim.player.xpNext;
  sim.step(DT, idle);
  assert.equal(sim.state, 'levelup');
  assert.equal(sim.player.level, 2);
  assert.ok(sim.events.some((e) => e.type === 'levelup' && e.level === 2));
  assert.ok(sim.levelUp.cards.length > 0 && sim.levelUp.cards.length <= LEVEL_UP.cards);
  const card = sim.levelUp.cards[0];
  for (const k of ['kind', 'id', 'level', 'isNew', 'icon']) assert.ok(k in card, `card.${k}`);
  const t = sim.time;
  sim.step(DT, idle);
  assert.equal(sim.time, t);
  assert.equal(sim.events.length, 0);
  sim.chooseCard(0);
  assert.equal(sim.state, 'running');
  const owned = [...sim.player.weapons, ...sim.player.passives].some((x) => x.id === card.id && x.level === card.level);
  assert.ok(owned);
});

test('sim: reroll, banish, skip use their limits', () => {
  const sim = createSim({ seed: 5 });
  sim.player.xp = sim.player.xpNext;
  sim.step(DT, idle);
  const first = sim.levelUp.cards[0];
  assert.ok(sim.reroll());
  assert.equal(sim.levelUp.rerolls, LEVEL_UP.rerolls - 1);
  const victim = sim.levelUp.cards[1];
  assert.ok(sim.banish(1));
  assert.equal(sim.levelUp.banishes, LEVEL_UP.banishes - 1);
  assert.ok(sim.levelUp.cards.every((c) => !(c.kind === victim.kind && c.id === victim.id)));
  assert.ok(sim.skip());
  assert.equal(sim.levelUp.skips, LEVEL_UP.skips - 1);
  assert.equal(sim.state, 'running');
  assert.ok(first);
  // лимиты исчерпываются
  sim.levelUp.rerolls = 0;
  sim.player.xp = sim.player.xpNext;
  sim.step(DT, idle);
  assert.equal(sim.reroll(), false);
});

test('sim: several pending levels give several card sets', () => {
  const sim = createSim({ seed: 6 });
  sim.player.xp = xpForLevel(1) + xpForLevel(2) + 1;
  sim.step(DT, idle);
  assert.equal(sim.player.level, 3);
  sim.chooseCard(0);
  assert.equal(sim.state, 'levelup');
  sim.chooseCard(0);
  assert.equal(sim.state, 'running');
});

test('sim: xp curve', () => {
  assert.equal(xpForLevel(1), XP.base);
  assert.equal(xpForLevel(2), XP.base + XP.perLevel);
  assert.equal(xpForLevel(20), XP.base + XP.perLevel * 19 + 600);
});

test('sim: contact damage, i-frames, gameover', () => {
  const sim = createSim({ seed: 9 });
  sim.spawnEnemy('slime', sim.player.x, sim.player.y);
  sim.step(DT, idle);
  assert.ok(sim.player.hp < sim.player.maxHp);
  assert.ok(sim.player.iframes > 0);
  assert.ok(sim.events.some((e) => e.type === 'playerHurt'));
  const hp = sim.player.hp;
  sim.step(DT, idle);
  assert.ok(sim.player.hp >= hp && sim.player.hp < hp + 0.1, 'no second hit during i-frames (regen aside)');
  sim.player.hp = 1;
  sim.player.iframes = 0;
  sim.step(DT, idle);
  assert.equal(sim.state, 'gameover');
  assert.ok(sim.events.some((e) => e.type === 'gameover'));
  const t = sim.time;
  sim.step(DT, idle);
  assert.equal(sim.time, t);
});

test('sim: enemy limit holds', () => {
  const sim = createSim({ seed: 10 });
  for (let i = 0; i < 600; i++) sim.spawnEnemy('harpy', 300 + i, 300);
  assert.equal(sim.enemies.length, SIM.maxEnemies);
  sim.spawnEnemy('slime', 0, 300, true);
  assert.equal(sim.enemies.filter((e) => !e.dead).length, SIM.maxEnemies, 'elite evicts a regular enemy instead of exceeding the cap');
  sim.step(DT, idle);
  assert.ok(sim.enemies.length <= SIM.maxEnemies);
  assert.ok(sim.enemies.some((e) => e.elite));
});

test('sim: food heals, magnet pulls all xp', () => {
  const sim = createSim({ seed: 11 });
  sim.player.hp = 10;
  sim.dropPickup('food', sim.player.x, sim.player.y);
  sim.step(DT, idle);
  assert.equal(Math.round(sim.player.hp), 10 + PICKUPS.food.value);
  for (let i = 0; i < 20; i++) sim.dropPickup('xp_small', 400 + i * 10, 300, 1);
  sim.dropPickup('magnet', sim.player.x, sim.player.y);
  sim.step(DT, idle);
  assert.ok(sim.events.some((e) => e.type === 'pickup' && e.kind === 'magnet'));
  const xp0 = sim.player.xp + sim.player.level * 1000;
  run(sim, 3);
  assert.equal(sim.pickups.filter((p) => p.kind === 'xp' && p.x >= 400).length, 0);
  assert.ok(sim.player.xp + sim.player.level * 1000 > xp0 - 1);
});

test('sim: far xp crystals merge when there are too many', () => {
  const sim = createSim({ seed: 12 });
  for (let i = 0; i < XP.mergeAbove + 100; i++) sim.dropPickup('xp_small', 600 + (i % 10) * 3, 600 + Math.floor(i / 10) * 3, 1);
  const total = sim.pickups.reduce((s, p) => s + p.value, 0);
  run(sim, 2);
  const xp = sim.pickups.filter((p) => p.kind === 'xp');
  assert.ok(xp.length < XP.mergeAbove + 100);
  assert.equal(Math.round(xp.reduce((s, p) => s + p.value, 0)), total);
});

test('sim: breakable props drop pickups when hit', () => {
  const sim = createSim({ seed: 13 });
  const prop = sim.props[0];
  sim.player.x = prop.x - 20; sim.player.y = prop.y;
  sim.spawnEnemy('slime', prop.x, prop.y);
  let broken = false;
  for (let i = 0; i < 1200 && !broken; i++) {
    sim.step(DT, idle);
    broken = !sim.props.some((p) => p.uid === prop.uid);
  }
  assert.ok(broken, 'prop destroyed by blade arc');
});

test('sim: boss death means victory', () => {
  const sim = createSim({ seed: 14 });
  const boss = sim.spawnBoss('dryad_queen');
  assert.ok(boss && boss.boss);
  assert.ok(sim.events.some((e) => e.type === 'bossSpawn'));
  sim.damageEnemy(boss, 1e9, 'blade_arc', 0, 0, 0);
  assert.equal(sim.state, 'victory');
  assert.ok(sim.events.some((e) => e.type === 'victory'));
});

test('sim: elite drops a chest, chest gives a weapon upgrade', () => {
  const sim = createSim({ seed: 15 });
  const e = sim.spawnEnemy('slime', 500, 500, true);
  sim.damageEnemy(e, 1e9, 'blade_arc', 0, 0, 0);
  const chest = sim.pickups.find((p) => p.kind === 'chest');
  assert.ok(chest);
  chest.x = sim.player.x; chest.y = sim.player.y;
  sim.step(DT, idle);
  const ev = sim.events.find((x) => x.type === 'chest');
  assert.ok(ev && ev.items.length === 1);
  assert.equal(sim.player.weapons[0].level, 2);
});

test('sim: evolution from chest when both parts are maxed', () => {
  const sim = createSim({ seed: 16 });
  sim.player.weapons[0].level = 7;
  sim.player.weapons.push({ id: 'guardian_shields', level: 7 });
  sim._syncBuild();
  sim.dropPickup('chest', sim.player.x, sim.player.y);
  sim.step(DT, idle);
  assert.deepEqual(sim.player.weapons.map((w) => w.id), ['aegis_storm']);
  run(sim, 5);
  assert.ok(sim.projectiles.some((p) => p.sprite === 'proj_blade_arc'), 'evolved shields orbit');
});

test('sim: every weapon fires and deals damage in a crowd', () => {
  for (const id of ['blade_arc', 'throwing_daggers', 'guardian_shields', 'holy_ground', 'war_axe', 'storm_chain', 'firebomb', 'aegis_storm', 'thunder_knives']) {
    const sim = createSim({ seed: 20 });
    sim.player.weapons.length = 0;
    sim.player.weapons.push({ id, level: 1 });
    sim._syncBuild();
    sim.player.hp = sim.player.maxHp = 1e9;
    sim.player.stats.maxHp = 1e9;
    for (let i = 0; i < 12; i++) sim.spawnEnemy('slime', 100 * Math.cos(i * 0.5), 100 * Math.sin(i * 0.5));
    run(sim, 6);
    assert.ok((sim.damageByWeapon[id] || 0) > 0, `${id} dealt no damage`);
  }
});

test('sim: step stays fast with 400 enemies', () => {
  const sim = createSim({ seed: 21 });
  sim.player.stats.maxHp = 1e9; sim.player.maxHp = 1e9; sim.player.hp = 1e9;
  sim.levelUp.skips = 1e9;
  const go = (inp) => { if (sim.state === 'levelup') sim.skip(); sim.step(DT, inp); };
  sim.player.weapons.push({ id: 'holy_ground', level: 3 }, { id: 'war_axe', level: 3 }, { id: 'storm_chain', level: 3 }, { id: 'throwing_daggers', level: 3 });
  sim._syncBuild();
  // враги как можно плотнее вокруг игрока
  for (let i = 0; i < SIM.maxEnemies; i++) {
    const a = i * 2.399;
    const r = 30 + (i % 40) * 6;
    sim.spawnEnemy(i % 3 === 0 ? 'harpy' : i % 3 === 1 ? 'catgirl' : 'slime', Math.cos(a) * r, Math.sin(a) * r);
  }
  for (let i = 0; i < 60; i++) go({ x: 0.7, y: 0.2 }); // прогрев
  let worst = 0;
  const t0 = performance.now();
  const N = 300;
  for (let i = 0; i < N; i++) {
    if (sim.state === 'levelup') sim.skip();
    const s = performance.now();
    sim.step(DT, { x: 0.7, y: 0.2 });
    worst = Math.max(worst, performance.now() - s);
    // держим толпу: доспавниваем до лимита
    while (sim.canSpawn()) sim.spawnEnemy('harpy', sim.player.x + 250, sim.player.y + (sim.enemies.length % 50) * 4);
  }
  const avg = (performance.now() - t0) / N;
  assert.equal(sim.state, 'running');
  assert.ok(sim.enemies.length >= 300, 'crowd is still there');
  assert.ok(avg < 3, `avg step ${avg.toFixed(2)} ms`);
  assert.ok(worst < 30, `worst step ${worst.toFixed(2)} ms`);
});
