// Луч-змейка (behaviors/weapons/beam.js): углы по секторам из RNG сима, рост тела до length, отскок на 90°
// с уроном × bounceDamageMul и длиной вдвое, один удар по врагу за отрезок, угасание после отскоков и по пути.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import { createRng } from '../../src/core/rng.js';
import { WEAPONS, WEAPON_BEHAVIOR } from '../../src/data/weapons.js';
import { FX } from '../../src/data/constants.js';

const DT = 1 / 60;
const idle = { x: 0, y: 0 };
const B = WEAPON_BEHAVIOR.beam;
const WO = FX.weaponOrigin;
const TAU = Math.PI * 2;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

// Сим без директора и объектов, герой бессмертен, без критов.
function setup(id = 'beam', level = 1, seed = 5) {
  const sim = createSim({ seed });
  sim.director = { update() {} };
  sim._updateChunks = () => {};
  sim.props = [];
  sim.player.weapons = [{ id, level }];
  sim._syncBuild();
  const pl = sim.player;
  pl.stats.crit = 0;
  pl.maxHp = pl.hp = pl.stats.maxHp = 1e9;
  return sim;
}

function dummy(sim, x, y) {
  const e = sim.spawnEnemy('slime', x, y);
  e.hp = e.maxHp = 1e9;
  e.speed = 0;
  return e;
}

// Один каст сейчас (без проверки цели), дальше оружие молчит. Возвращает лучи этого каста.
function castNow(sim) {
  const w = sim.player.weapons[0];
  w.beh.cast(w, sim);
  w.timer = 1e9;
  return sim.projectiles.filter((p) => p.wid === w.id && p.fx === 'snake');
}

const snakes = (sim) => sim.projectiles.filter((p) => p.fx === 'snake');

function polyLen(p) {
  let s = 0;
  for (let i = 2; i < p.pts.length; i += 2) {
    s += Math.hypot(p.pts[i] - p.pts[i - 2], p.pts[i + 1] - p.pts[i - 1]);
  }
  return s;
}

// Угол первого луча следующего каста (тот же RNG, что у сима).
function nextAngle(sim, amount = 1) {
  return (createRng(sim.rng.state).next() * TAU) / amount;
}

test('beam: amount rays per cast, one per sector from the sim RNG, from the weapon-origin circle', () => {
  const sim = setup('prism_ray', 1);
  const P = WEAPONS.prism_ray.levels[0];
  const r = createRng(sim.rng.state);
  const rays = castNow(sim);
  assert.equal(rays.length, P.amount);
  const pl = sim.player;
  rays.forEach((p, i) => {
    near(p.angle, ((i + r.next()) * TAU) / P.amount, 1e-12);
    near(Math.hypot(p.x - pl.x, p.y - pl.y), WO.radius, 1e-9);
    assert.equal(p.len, 0);
  });
  assert.ok(P.amount > WEAPONS.beam.levels[4].amount);
  const a = castNow(setup('beam', 1, 99))[0].angle;
  const b = castNow(setup('beam', 1, 5))[0].angle;
  assert.notEqual(a, b);
});

test('beam: body grows to length, then slithers with a fixed length; area stat does not scale it', () => {
  const sim = setup('beam', 1);
  const P = WEAPONS.beam.levels[0];
  const [p] = castNow(sim);
  const t1 = (P.length / P.speed) * 0.5;
  for (let i = 0; i < Math.round(t1 / DT); i++) sim.step(DT, idle);
  near(p.len, P.speed * Math.round(t1 / DT) * DT, 1e-6);
  assert.ok(p.len < P.length);
  for (let i = 0; i < Math.round((P.length / P.speed) / DT); i++) sim.step(DT, idle);
  near(p.len, P.length, 1e-6);
  near(polyLen(p), P.length, 1e-6);
  const tail = [p.pts[0], p.pts[1]];
  sim.step(DT, idle);
  near(polyLen(p), P.length, 1e-6);
  near(Math.hypot(p.pts[0] - tail[0], p.pts[1] - tail[1]), P.speed * DT, 1e-6); // хвост ползёт за головой
  // стат area на длину не влияет
  const w = sim.player.weapons[0];
  sim.player.stats.area = 2;
  sim._refreshWeapon(w);
  assert.equal(w.params.length, P.length);
  assert.equal(w.params.area, undefined);
});

test('beam: head hit turns 90°, damage drops, length halves; one hit per segment; ends after bounces', () => {
  const sim = setup('beam', 1);
  const P = WEAPONS.beam.levels[0];
  assert.equal(P.bounces, 1);
  const [p] = castNow(sim);
  const a = p.angle;
  const d0 = P.length + 30; // тело уже выросло, когда голова дошла
  const e1 = dummy(sim, p.x + p.vx * d0, p.y + p.vy * d0);
  const ux = p.vx;
  const uy = p.vy;
  let n = 0;
  while (e1.hp === e1.maxHp && n++ < 300) sim.step(DT, idle);
  const dmg1 = e1.maxHp - e1.hp;
  assert.ok(dmg1 > 0, 'first hit');
  // поворот на 90°
  near(ux * p.vx + uy * p.vy, 0, 1e-12);
  near(Math.abs(p.angle - a), Math.PI / 2, 1e-12);
  near(p.c, P.length / 2, 1e-9);
  near(p.dmg0, sim.player.weapons[0].params.damage * B.bounceDamageMul, 1e-9);
  assert.equal(p.bl, P.bounces - 1);
  assert.equal(p.pts.length, 6, 'corner in the polyline');
  // длина уходит к половине с хвоста; первый враг больше не задет, хотя голова начинала в нём
  for (let i = 0; i < 20; i++) sim.step(DT, idle);
  assert.equal(e1.maxHp - e1.hp, dmg1, 'one hit per segment');
  near(p.len, P.length / 2, 1e-6);
  near(polyLen(p), P.length / 2, 1e-6);
  // второй враг на новом курсе: урон × bounceDamageMul, отскоков нет — луч гаснет
  const e2 = dummy(sim, p.x + p.vx * 40, p.y + p.vy * 40);
  n = 0;
  while (e2.hp === e2.maxHp && n++ < 300) sim.step(DT, idle);
  const dmg2 = e2.maxHp - e2.hp;
  near(dmg2 / dmg1, B.bounceDamageMul, 1e-6);
  assert.ok(p.end, 'last hit ends the ray');
  const hx = p.x;
  const hy = p.y;
  sim.step(DT, idle);
  assert.equal(p.x, hx);
  assert.equal(p.y, hy);
  for (let i = 0; i < Math.ceil(B.fade / DT) + 1; i++) sim.step(DT, idle);
  assert.equal(snakes(sim).length, 0, 'gone after the fade');
});

test('beam: bounces grow with level up to 4, evolution keeps more', () => {
  const lv = WEAPONS.beam.levels;
  for (let i = 1; i < lv.length; i++) assert.ok(lv[i].bounces >= lv[i - 1].bounces);
  assert.equal(lv[4].bounces, 4);
  assert.ok(WEAPONS.prism_ray.levels[0].bounces >= lv[4].bounces);
});

test('beam: a prop on the path breaks and bounces the ray; a ray with nothing to hit expires', () => {
  const sim = setup('beam', 1);
  const pl = sim.player;
  const a = nextAngle(sim);
  const d = WO.radius + 50;
  let broke = false;
  sim.props = [{ uid: 1e6, x: pl.x + Math.cos(a) * d, y: pl.y + Math.sin(a) * d, radius: 6,
    hp: 1, dead: false, mark: 0, hitAt: new Float64Array(64) }];
  sim._damageProp = (o) => { o.dead = true; broke = true; };
  const [p] = castNow(sim);
  for (let i = 0; i < 60 && !broke; i++) sim.step(DT, idle);
  assert.ok(broke, 'prop on the ray path breaks');
  assert.equal(p.bl, WEAPONS.beam.levels[0].bounces - 1, 'and the ray bounced');
  // без целей луч гаснет, пройдя maxTravel
  const s2 = setup('beam', 1);
  const P = WEAPONS.beam.levels[0];
  const [q] = castNow(s2);
  for (let i = 0; i < Math.ceil((B.maxTravel / P.speed) / DT) + 1; i++) s2.step(DT, idle);
  assert.ok(q.end && q.dist <= B.maxTravel + 1e-9, 'stops at maxTravel');
  for (let i = 0; i < Math.ceil(B.fade / DT) + 1; i++) s2.step(DT, idle);
  assert.equal(snakes(s2).length, 0);
});

test('beam: never more than maxAlive snakes of one weapon on screen', () => {
  const sim = setup('beam', 5);
  castNow(sim);
  castNow(sim);
  castNow(sim);
  assert.equal(snakes(sim).length, B.maxAlive);
});

test('beam: rays aim at distinct nearest targets like lightning; no target in range — no cast', () => {
  const sim = setup('beam', 4); // 3 луча
  const pl = sim.player;
  const w = sim.player.weapons[0];
  w.timer = 0;
  w.beh.update(w, sim, DT);
  assert.equal(snakes(sim).length, 0, 'no target, no cast');
  assert.equal(w.timer, B.retry);
  const es = [dummy(sim, pl.x + 60, pl.y), dummy(sim, pl.x, pl.y + 80),
    dummy(sim, pl.x - 100, pl.y)];
  w.timer = 0;
  w.beh.update(w, sim, DT);
  const rays = snakes(sim);
  assert.equal(rays.length, 3);
  const want = es.map((e) => Math.atan2(e.y - pl.y, e.x - pl.x));
  for (const r of rays) assert.ok(want.some((a) => Math.abs(a - r.angle) < 1e-9), 'ray aims at a target');
  assert.equal(new Set(rays.map((r) => r.angle)).size, 3, 'each ray has its own target');
});
