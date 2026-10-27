// Blade Arc / Crimson Arc (behavior slash): росчерк через самую плотную группу врагов.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import { WEAPONS } from '../../src/data/weapons.js';
import { STATUS } from '../../src/data/status.js';
import { hashSim } from '../../src/core/lockstep.js';

const DT = 1 / 60;
const idle = { x: 0, y: 0 };

// Сим с одним оружием, без директора и объектов, без критов; герой бессмертен.
function setup(id = 'blade_arc', level = 1, seed = 5) {
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

// Неподвижный враг-манекен с огромным HP.
function dummy(sim, dx, dy) {
  const pl = sim.player;
  const e = sim.spawnEnemy('slime', pl.x + dx, pl.y + dy);
  e.hp = e.maxHp = 1e9;
  e.beh = { update() {} };
  return e;
}

// Шагает сим; возвращает uid врагов -> число ударов оружия id и uid снарядов-слэшей.
function run(sim, seconds, id) {
  const hits = new Map();
  const slashes = new Set();
  const orig = sim.damageEnemy.bind(sim);
  sim.damageEnemy = (e, dmg, wid, ...rest) => {
    if (wid === id) hits.set(e.uid, (hits.get(e.uid) || 0) + 1);
    return orig(e, dmg, wid, ...rest);
  };
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    sim.step(DT, idle);
    for (const p of sim.projectiles) if (p.fx === 'slash' && p.wid === id) slashes.add(p.uid);
  }
  return { hits, slashes };
}

test('slash: blade arc and crimson arc use slash, bleeding stays on blades', () => {
  for (const id of ['blade_arc', 'crimson_arc']) {
    const w = WEAPONS[id];
    assert.equal(w.behavior, 'slash');
    assert.ok(STATUS[w.status.type].melee, `${id}: bleeding`);
    for (const lv of w.levels) assert.ok(lv.area > 0 && lv.width > 0 && lv.sweep > 0, `${id}: length, width, sweep`);
  }
  const L = WEAPONS.blade_arc.levels;
  for (let i = 1; i < L.length; i++) {
    assert.ok(L[i].area >= L[i - 1].area && L[i].width >= L[i - 1].width, 'size grows');
    assert.ok(L[i].sweep <= L[i - 1].sweep && L[i].cooldown <= L[i - 1].cooldown, 'speed grows');
  }
  assert.ok(L[2].amount > L[1].amount && L[4].amount > L[3].amount, 'amount on L3 and L5');
  const c = WEAPONS.crimson_arc.levels[0];
  assert.ok(c.area > L[4].area && c.amount > L[4].amount && c.sweep < L[4].sweep, 'crimson is bigger and faster');
  assert.ok(WEAPONS.crimson_arc.status.chance > WEAPONS.blade_arc.status.chance, 'crimson bleeds more');
});

test('slash: cuts through the crowd, a lone foe off the line is not hit', () => {
  const sim = setup('blade_arc', 1);
  // плотная группа справа, вытянутая по горизонтали, и одиночка далеко сверху-слева
  const crowd = [];
  for (let i = 0; i < 8; i++) crowd.push(dummy(sim, 70 + i * 6, (i % 2) * 4 - 2));
  const lone = dummy(sim, -60, -100);
  const { hits, slashes } = run(sim, 0.9, 'blade_arc');
  assert.equal(slashes.size, 1, 'one slash at L1');
  const hit = crowd.filter((e) => hits.get(e.uid) === 1).length;
  assert.equal(hit, crowd.length, 'every foe of the group is hit exactly once');
  assert.ok(!hits.has(lone.uid), 'lone foe off the line is not hit');
});

test('slash: amount gives several slashes over other groups, a single group gets crossed', () => {
  const sim = setup('blade_arc', 5);
  const a = [];
  const b = [];
  for (let i = 0; i < 6; i++) a.push(dummy(sim, 80 + i * 5, 0));
  for (let i = 0; i < 4; i++) b.push(dummy(sim, -90, 40 + i * 6));
  const { hits, slashes } = run(sim, 1.0, 'blade_arc');
  assert.equal(slashes.size, WEAPONS.blade_arc.levels[4].amount, 'amount slashes per volley');
  assert.ok(a.every((e) => hits.has(e.uid)), 'densest group is cut');
  assert.ok(b.every((e) => hits.has(e.uid)), 'second group is cut too');

  const one = setup('blade_arc', 3);
  const g = [];
  for (let i = 0; i < 5; i++) g.push(dummy(one, 70 + i * 6, 0));
  const r = run(one, 0.85, 'blade_arc');
  assert.equal(r.slashes.size, 2);
  // крест: первый слэш вдоль группы задевает всех, второй поперёк — середину ещё раз
  assert.ok(g.every((e) => r.hits.get(e.uid) >= 1), 'the group is cut');
  assert.equal(r.hits.get(g[2].uid), 2, 'cross: the middle of the same group is cut twice');
});

// Ближайшая к герою точка отрезка слэша p.
function gap(p, pl) {
  const ux = Math.cos(p.angle);
  const uy = Math.sin(p.angle);
  let k = (pl.x - p.x) * ux + (pl.y - p.y) * uy;
  k = Math.max(0, Math.min(p.radius, k));
  return Math.hypot(pl.x - p.x - ux * k, pl.y - p.y - uy * k);
}

test('slash: no foes — a cross slash ahead of the hero, never from the hero', () => {
  const sim = setup('blade_arc', 1);
  let seen = 0;
  for (let i = 0; i < 60; i++) {
    sim.step(DT, { x: 1, y: 0 });
    for (const p of sim.projectiles) {
      if (p.fx !== 'slash') continue;
      seen++;
      assert.ok(Math.abs(Math.cos(p.angle)) < 1e-6, 'across movement');
      assert.ok(p.x > sim.player.x, 'ahead of the hero');
    }
  }
  assert.ok(seen > 0);
});

test('slash: never starts at or passes through the hero, even with foes all around', () => {
  const sim = setup('blade_arc', 5);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 14 + (i % 3) * 10;
    dummy(sim, Math.cos(a) * r, Math.sin(a) * r);
  }
  for (let i = 0; i < 6; i++) dummy(sim, 20 + i * 8, 2); // поток прямо на героя
  const pl = sim.player;
  const minD = WEAPONS.blade_arc.levels[4].width / 2 + pl.radius;
  const seen = new Set();
  for (let i = 0; i < 120; i++) {
    sim.step(DT, idle);
    for (const p of sim.projectiles) {
      if (p.fx !== 'slash' || seen.has(p.uid)) continue;
      seen.add(p.uid);
      assert.ok(gap(p, pl) >= minD - 1e-6, `slash ${gap(p, pl).toFixed(1)} px from the hero`);
    }
  }
  assert.ok(seen.size >= 3);
});

test('slash: two sims with the same seed stay identical', () => {
  const make = () => {
    const sim = setup('crimson_arc', 1, 42);
    for (let i = 0; i < 30; i++) {
      const e = sim.spawnEnemy('slime', sim.player.x + ((i * 37) % 160) - 80, sim.player.y + ((i * 53) % 120) - 60);
      e.hp = e.maxHp = 400;
    }
    return sim;
  };
  const s1 = make();
  const s2 = make();
  for (let i = 0; i < 240; i++) {
    const inp = { x: Math.sin(i / 20), y: Math.cos(i / 30) };
    s1.step(DT, inp);
    s2.step(DT, inp);
  }
  assert.equal(hashSim(s1), hashSim(s2));
  assert.equal(s1.enemies.filter((e) => !e.dead).length, s2.enemies.filter((e) => !e.dead).length);
});
