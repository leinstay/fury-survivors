import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, xpForLevel } from '../../src/core/sim.js';
import { SIM, XP, LEVEL_UP, SLOTS } from '../../src/data/constants.js';
import { PICKUPS } from '../../src/data/pickups.js';
import { WEAPONS } from '../../src/data/weapons.js';
import { PASSIVES } from '../../src/data/passives.js';
import { createDirector } from '../../src/core/director.js';
import { ENEMY_BEHAVIORS } from '../../src/behaviors/index.js';
import { forest } from '../../src/data/stages/forest.js';
import * as roadsModule from '../../src/core/roads.js';
import { createRng } from '../../src/core/rng.js';

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
  assert.notEqual(JSON.stringify(a.enemies.map((e) => [e.x, e.y])),
      JSON.stringify(c.enemies.map((e) => [e.x, e.y])));
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
  const owned = [...sim.player.weapons, ...sim.player.passives]
      .some((x) => x.id === card.id && x.level === card.level);
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
  assert.equal(xpForLevel(2), 15);   // как в VS: 5, затем +10 за уровень
  assert.equal(xpForLevel(20), 5 + 10 * 19 + 600);
  assert.equal(xpForLevel(21), 5 + 10 * 19 + 13);
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

test('sim: final boss death starts overtime, death in overtime is a victory', () => {
  const sim = createSim({ seed: 14 });
  const boss = sim.spawnBoss('dryad_queen');
  assert.ok(boss && boss.boss);
  assert.ok(sim.events.some((e) => e.type === 'bossSpawn'));
  sim.damageEnemy(boss, 1e9, 'blade_arc', 0, 0, 0);
  assert.equal(sim.state, 'running');
  assert.ok(sim.won);
  assert.ok(sim.overtime >= 0);
  assert.ok(sim.events.some((e) => e.type === 'overtime'));
  // враги овертайма крепче обычных и крепнут дальше
  const t0 = sim.time;
  const a = sim.spawnEnemy('slime', 300, 300);
  sim.time = t0 + 60;
  const b = sim.spawnEnemy('slime', 300, 300);
  assert.ok(b.maxHp > a.maxHp * 1.5, `hp ${a.maxHp} -> ${b.maxHp}`);
  sim.hurtPlayer(1e9);
  assert.equal(sim.state, 'victory');
  assert.ok(sim.events.some((e) => e.type === 'victory'));
});

test('sim: the reaper arrives in overtime, is invulnerable and faster than the heroine', () => {
  const sim = createSim({ seed: 16 });
  const boss = sim.spawnBoss('dryad_queen');
  sim.damageEnemy(boss, 1e9, 'blade_arc', 0, 0, 0);
  sim.player.hp = 1e9;
  sim.time = sim.overtime + forest.overtime.reaperAt - forest.bossWarning - 0.5;
  let warned = false;
  for (let i = 0; i < 12 * 60 && !sim.enemies.some((e) => e.type === 'reaper'); i++) {
    if (sim.state === 'levelup') sim.skip();
    sim.step(DT, idle);
    if (sim.events.some((e) => e.type === 'bossWarning' && e.boss === 'reaper')) warned = true;
  }
  const reaper = sim.enemies.find((e) => e.type === 'reaper');
  assert.ok(reaper && reaper.boss, 'reaper spawned');
  assert.ok(warned, 'warning before the reaper');
  assert.ok(reaper.speed > sim.player.stats.speed);
  const hp = reaper.hp;
  sim.damageEnemy(reaper, 1e9, 'blade_arc', 0, 0, 0);
  assert.equal(reaper.hp, hp);
  assert.ok(!reaper.dead);
  assert.ok(!sim.events.some((e) => e.type === 'hit'));
});

test('sim: overtime keeps spawning and can be finished early', () => {
  const sim = createSim({ seed: 15 });
  const boss = sim.spawnBoss('dryad_queen');
  sim.damageEnemy(boss, 1e9, 'blade_arc', 0, 0, 0);
  sim.player.hp = 1e9;
  for (let i = 0; i < 600; i++) { if (sim.state === 'levelup') sim.skip(); sim.step(1 / 60); }
  assert.ok(sim.enemies.length > 20, `enemies ${sim.enemies.length}`);
  sim.finishOvertime();
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
  assert.equal(sim.state, 'chest');
  assert.deepEqual(sim.chest.cards.map((c) => c.id), ['aegis_storm']);
  sim.chooseChest(0);
  assert.deepEqual(sim.player.weapons.map((w) => w.id), ['aegis_storm']);
  assert.ok(sim.events.some((e) => e.type === 'chest' && e.applied && e.items[0].id === 'aegis_storm'));
  run(sim, 5);
  assert.ok(sim.projectiles.some((p) => p.sprite === 'proj_crescent'), 'evolved shields orbit');
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

test('sim: chest with several ready evolutions waits for the choice', () => {
  const sim = createSim({ seed: 21 });
  const pl = sim.player;
  pl.weapons = [{ id: 'blade_arc', level: 7 }, { id: 'war_axe', level: 7 }];
  pl.passives = [{ id: 'attack', level: 1 }];
  sim._syncBuild();
  sim.dropPickup('chest', pl.x, pl.y);
  sim.step(1 / 60, { x: 0, y: 0 });
  assert.equal(sim.state, 'chest');
  assert.equal(sim.chest.cards.length, 2);
  assert.ok(sim.events.some((e) => e.type === 'chest' && e.choice));
  const want = sim.chest.cards[1].id;
  sim.chooseChest(1);
  assert.equal(sim.state, 'running');
  assert.ok(sim.player.weapons.some((w) => w.id === want));
  assert.equal(sim.chest.cards.length, 0);
});

test('sim: skipping the evolution gives an ordinary chest item instead', () => {
  const sim = createSim({ seed: 22 });
  const pl = sim.player;
  pl.weapons = [{ id: 'blade_arc', level: 7 }, { id: 'war_axe', level: 3 }];
  pl.passives = [{ id: 'attack', level: 1 }];
  sim._syncBuild();
  sim.dropPickup('chest', pl.x, pl.y);
  sim.step(DT, idle);
  assert.equal(sim.state, 'chest');
  const items = sim.skipChest();
  assert.equal(sim.state, 'running');
  assert.equal(items.length, 1);
  assert.ok(!items[0].evolved);
  assert.deepEqual(pl.weapons.map((w) => w.id), ['blade_arc', 'war_axe']);
  assert.equal(pl.weapons[1].level, 4); // единственное оружие не на максимуме
  assert.ok(sim.events.some((e) => e.type === 'chest' && e.applied));
});

test('director: wall and flyby cross the screen on a straight course and vanish, horde rings the elite chest', () => {
  const sim = createSim({ seed: 31 });
  sim.player.hp = 1e9;
  const dir = createDirector({ timeline: [
    { at: 0, type: 'wall', enemy: 'slime', count: 10 },
    { at: 0, type: 'flyby', enemy: 'harpy', count: 8 },
  ], duration: 100 }, sim.rng);
  dir.update(sim, 0);
  const wall = sim.enemies.filter((e) => e.type === 'slime');
  const fly = sim.enemies.filter((e) => e.type === 'harpy');
  assert.equal(wall.length, 10);
  assert.equal(fly.length, 8);
  assert.ok(wall.every((e) => e.transient && e.beh === ENEMY_BEHAVIORS.drift));
  // шеренга: все на одном расстоянии от игрока вдоль курса, растянуты поперёк
  const a = wall[0].a;
  const along = wall.map((e) => e.x * Math.cos(a) + e.y * Math.sin(a));
  const across = wall.map((e) => -e.x * Math.sin(a) + e.y * Math.cos(a));
  assert.ok(Math.max(...along) - Math.min(...along) < 1);
  assert.ok(Math.max(...across) - Math.min(...across) > 300);
  // идут прямо, не к игроку: через 2 с курс тот же, а дистанция до игрока меняется монотонно
  const d0 = Math.hypot(wall[0].x, wall[0].y);
  for (let i = 0; i < 120; i++) sim._updateEnemies(1 / 60);
  assert.ok(Math.hypot(wall[0].x, wall[0].y) < d0);
  // через 40 с все ушли за край и исчезли, игрок на месте
  for (let i = 0; i < 40 * 60; i++) { sim._updateEnemies(1 / 60); sim._sweepEnemies(); }
  assert.equal(sim.enemies.filter((e) => e.transient).length, 0);

  // орда: убийство элиты окружает сундук врагами её типа
  const elite = sim.spawnEnemy('catgirl', 200, 200, true);
  sim.damageEnemy(elite, 1e9, 'blade_arc', 0, 0, 0);
  const horde = sim.enemies.filter((e) => e.type === 'catgirl' && !e.dead);
  assert.equal(horde.length, forest.chestHorde.count);
  assert.ok(horde.every((e) =>
    Math.abs(Math.hypot(e.x - 200, e.y - 200) - forest.chestHorde.radius) < 1));
  assert.ok(sim.events.some((e) => e.type === 'horde'));
});

test('difficulty: cursed spawns more and gives more xp', () => {
  const count = (difficulty) => {
    const sim = createSim({ seed: 41, difficulty });
    sim.player.hp = 1e9;
    let spawned = 0;
    let maxUid = 0;
    for (let i = 0; i < 60 * 60; i++) {
      if (sim.state === 'levelup') { sim.levelUp.skips = 1e9; sim.skip(); }
      sim.step(DT, idle);
      for (const e of sim.enemies) if (e.uid > maxUid) { maxUid = e.uid; spawned++; }
    }
    return { spawned, xp: sim.spawnEnemy('slime', 0, 0).xp };
  };
  const n = count('normal');
  const c = count('cursed');
  assert.ok(c.spawned > n.spawned * 1.3, `normal ${n.spawned}, cursed ${c.spawned}`);
  assert.equal(c.xp, n.xp * 1.25);
  assert.equal(createSim({ seed: 1, difficulty: 'nope' }).difficulty, 'normal');
});

test('roads: continuous lanes, props keep off the road, road props sit on it', () => {
  const { createRoads } = roadsModule;
  const cfg = forest.roads;
  const roads = createRoads(cfg, 123);
  // полоса непрерывна: расстояние до оси меняется плавно вдоль мира, и какая-то дорога всегда ближе spacing
  let prev = roads.distance(0, 0);
  let maxJump = 0;
  for (let x = 1; x < 4000; x++) {
    const d = roads.distance(x, 0);
    maxJump = Math.max(maxJump, Math.abs(d - prev));
    prev = d;
    assert.ok(d < cfg.spacing, `distance ${d}`);
  }
  // плавно вдоль мира; скачок возможен только на конце отрезка ветки, и он лежит на магистрали
  assert.ok(maxJump < 2 || maxJump > 10, `max jump ${maxJump}`);
  // точка на дороге из чанка лежит на оси
  const rnd = createRng(5);
  let found = 0;
  for (let cx = -6; cx <= 6 && found < 3; cx++) {
    for (let cy = -6; cy <= 6 && found < 3; cy++) {
      const cs = SIM.chunkSize;
      const p = roads.pointInChunk(cx * cs, cy * cs, cs, () => rnd.next());
      if (!p) continue;
      found++;
      assert.ok(roads.distance(p.x, p.y) < 1.5, 'point on the axis');
      assert.ok(roads.crossesChunk(cx * SIM.chunkSize, cy * SIM.chunkSize, SIM.chunkSize));
    }
  }
  assert.ok(found > 0, 'some chunk has a road');
  // sim: обычные объекты не на дороге, фонари у обочины, объект place 'road' на оси
  const sim = createSim({ seed: 9 });
  for (const o of sim.props) {
    const d = sim.roads.distance(o.x, o.y);
    if (o.sprite === 'lantern') assert.ok(d > cfg.width / 2, `lantern on road ${d}`);
  }
  const cart = sim.placeProp({ sprite: 'x', place: 'road' }, 0, 0, () => rnd.next());
  const cartIn = roads.pointInChunk(0, 0, SIM.chunkSize, () => 0.5);
  if (cartIn) assert.ok(cart === null || sim.roads.distance(cart.x, cart.y) < 1.5);
  const ground = sim.placeProp({ sprite: 'x', big: true }, 0, 0, () => rnd.next());
  if (ground) assert.ok(sim.roads.distance(ground.x, ground.y) > cfg.width / 2 + 28);
});

test('luck multiplies the crit chance', () => {
  const sim = createSim({ seed: 61 });
  const base = sim.critChance();
  sim.player.passives = [{ id: 'luck', level: 5 }];
  sim._syncBuild();
  assert.ok(Math.abs(sim.critChance() - base * 1.5) < 1e-9, `${base} -> ${sim.critChance()}`);
  sim.player.passives.push({ id: 'crit', level: 5 });
  sim._syncBuild();
  assert.ok(Math.abs(sim.critChance() - (base + 0.25) * 1.5) < 1e-9);
  // статистика: при шансе 100% каждый удар крит
  sim.player.stats.crit = 1;
  const e = sim.spawnEnemy('slime', 0, 0); e.hp = e.maxHp = 1e9;
  let crits = 0;
  for (let i = 0; i < 50; i++) { sim.damageEnemy(e, 1, 'blade_arc', 0, 0, 0); if (sim.events.at(-1).crit) crits++; }
  assert.equal(crits, 50);
});

test('level up with everything maxed heals automatically without the card screen', () => {
  const sim = createSim({ seed: 71 });
  const pl = sim.player;
  pl.weapons = Object.keys(WEAPONS).filter((id) => !WEAPONS[id].evolved).slice(0, SLOTS.weapons)
      .map((id) => ({ id, level: WEAPONS[id].maxLevel }));
  pl.passives = Object.keys(PASSIVES).slice(0, SLOTS.passives)
      .map((id) => ({ id, level: PASSIVES[id].levels.length }));
  sim._syncBuild();
  pl.hp = 10;
  const lvl = pl.level;
  pl.xp = xpForLevel(lvl) + xpForLevel(lvl + 1); // сразу два уровня
  sim._checkLevel();
  assert.equal(sim.state, 'running');
  assert.equal(sim.pendingLevels, 0);
  assert.equal(pl.level, lvl + 2);
  assert.ok(pl.hp > 10, 'healed');
  assert.equal(sim.events.filter((e) => e.type === 'autoHeal').length, pl.level - lvl);
});
