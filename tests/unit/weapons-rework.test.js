// Переделанные оружия: молот (slam, трещины), копьё (impale, пригвождение), ледяной шар (ice_orb) и их эволюции.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import { WEAPONS, WEAPON_BEHAVIOR } from '../../src/data/weapons.js';
import { moveMul } from '../../src/behaviors/status.js';

const DT = 1 / 60;
const idle = { x: 0, y: 0 };

// Сим с одним оружием, без директора, объектов и критов; герой бессмертен.
function setup(id, level = 1, seed = 5) {
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

function dummy(sim, dx, dy, { still = true, heavy = true } = {}) {
  const pl = sim.player;
  const e = sim.spawnEnemy('slime', pl.x + dx, pl.y + dy);
  e.hp = e.maxHp = 1e9;
  if (still) e.speed = 0;
  if (heavy) e.resist = 1;
  return e;
}

function run(sim, seconds, input = idle, each = null) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    sim.step(DT, input);
    if (each) each(sim);
  }
}

// Шагать до первого выстрела оружия id; вернуть, был ли он.
function untilFire(sim, id, max = 3) {
  for (let i = 0; i < max / DT; i++) {
    sim.step(DT, idle);
    if (sim.events.some((ev) => ev.type === 'weaponFire' && ev.weapon === id)) return true;
  }
  return false;
}

const cracks = (sim) => sim.projectiles.filter((p) => p.fx === 'crack');
const own = (sim, id) => sim.projectiles.filter((p) => p.wid === id);

// Состояние для сравнения двух симов: враги и снаряды.
function snapshot(sim) {
  const r = (v) => Math.round(v * 1000);
  return JSON.stringify({
    t: r(sim.time),
    en: sim.enemies.filter((e) => !e.dead)
        .map((e) => [e.uid, r(e.x), r(e.y), r(e.hp), r(moveMul(e, sim))]),
    pr: sim.projectiles.map((p) => [p.uid, p.wid, p.fx, r(p.x), r(p.y), r(p.life), r(p.alpha)]),
  });
}

test('weapon rework: behaviors and data', () => {
  assert.equal(WEAPONS.hammer.behavior, 'slam');
  assert.equal(WEAPONS.titan_maul.behavior, 'slam');
  assert.equal(WEAPONS.spear.behavior, 'impale');
  assert.equal(WEAPONS.dragon_lance.behavior, 'impale');
  assert.equal(WEAPONS.frost_orb.behavior, 'ice_orb');
  assert.equal(WEAPONS.blizzard.behavior, 'ice_orb');
  for (const id of ['spear', 'dragon_lance']) {
    for (const lv of WEAPONS[id].levels) {
      assert.equal(lv.amount, 1, `${id}: one spear`);
      assert.ok(lv.pin > 0 && lv.pierce >= 1 && !lv.pierceAll, `${id}: pierce N and pin`);
    }
  }
  for (const id of ['hammer', 'titan_maul']) {
    for (const lv of WEAPONS[id].levels) {
      assert.ok(lv.area > 0 && lv.duration > 0 && lv.slow < 1, id);
    }
  }
  for (const id of ['frost_orb', 'blizzard']) {
    for (const lv of WEAPONS[id].levels) {
      const st = lv.status;
      assert.ok(lv.area > 0 && lv.tick > 0 && lv.speed > 0, id);
      assert.ok(st && st.type === 'chill' && st.chance === 1 && st.slow < 1 && st.duration > 0, `${id}: chill`);
      assert.equal(lv.slow, undefined, `${id}: no direct slow`);
    }
  }
  // пробивание растёт по уровням
  const pierce = WEAPONS.spear.levels.map((l) => l.pierce);
  assert.ok(pierce.every((v, i) => i === 0 || v >= pierce[i - 1]) && pierce[4] > pierce[0]);
});

test('hammer: ground slam hits all around (also behind), knocks away, leaves a crack', () => {
  const sim = setup('hammer', 1);
  const P = WEAPONS.hammer.levels[0];
  const front = dummy(sim, 40, 0, { heavy: false });
  const back = dummy(sim, -12, 0, { heavy: false });
  const far = dummy(sim, -P.area * 2, 0);
  assert.ok(untilFire(sim, 'hammer'));
  run(sim, 0.1);
  assert.ok(front.hp < front.maxHp, 'front foe hit');
  assert.ok(back.hp < back.maxHp, 'foe behind the hero hit too: a slam is a circle, not a cone');
  assert.equal(far.hp, far.maxHp, 'out of reach');
  assert.ok(front.kx > 0, 'knocked away from the slam centre');
  const c = cracks(sim);
  assert.equal(c.length, 1, 'one crack per slam');
  assert.ok(Math.abs(c[0].radius - P.area * WEAPON_BEHAVIOR.slam.crack) < 1e-9);
});

test('hammer: the crack slows foes inside, fades out and is gone after duration', () => {
  const sim = setup('hammer', 1);
  const P = WEAPONS.hammer.levels[0];
  sim.player.weapons[0].cooldown = 0;
  assert.ok(untilFire(sim, 'hammer'));
  run(sim, 0.05);
  sim.player.weapons[0].cooldown = 1e9; // один удар
  const [c] = cracks(sim);
  assert.ok(c);
  const uid = c.uid;
  // враг входит в трещину после удара: урона нет, есть замедление
  const e = dummy(sim, 0, 0);
  e.x = c.x; e.y = c.y;
  const out = dummy(sim, 0, 0);
  out.x = c.x + c.radius + 60; out.y = c.y;
  run(sim, 0.1);
  assert.ok(Math.abs(moveMul(e, sim) - P.slow) < 1e-9, 'slowed inside the crack');
  assert.equal(moveMul(out, sim), 1, 'not slowed outside');
  assert.equal(e.hp, e.maxHp, 'the crack itself deals no damage');
  // гаснет: прозрачность падает к концу
  const alphas = [];
  run(sim, P.duration * 0.9, idle, (s) => {
    const p = s.projectiles.find((x) => x.uid === uid);
    if (p) alphas.push(p.alpha);
  });
  assert.ok(alphas[0] === 1 && alphas[alphas.length - 1] < 0.5, 'fades out');
  run(sim, P.duration * 0.2);
  assert.ok(!sim.projectiles.some((p) => p.uid === uid), 'gone after duration');
  // вышел из трещины: замедление держится slowTime и проходит
  run(sim, P.slowTime + 0.1);
  assert.equal(moveMul(e, sim), 1);
});

test('titan maul: a series of slams around the hero, each with its own crack, all in melee reach', () => {
  const sim = setup('titan_maul', 1);
  const P = WEAPONS.titan_maul.levels[0];
  dummy(sim, 300, 0);
  assert.ok(untilFire(sim, 'titan_maul'));
  sim.player.weapons[0].cooldown = 1e9;
  run(sim, P.amount * WEAPON_BEHAVIOR.slam.gap + 0.2);
  const c = cracks(sim);
  assert.equal(c.length, P.amount);
  const S = WEAPON_BEHAVIOR.slam;
  const angles = c.map((p) => Math.atan2(p.y - sim.player.y, p.x - sim.player.x));
  for (const p of c) {
    const d = Math.hypot(p.x - sim.player.x, p.y - sim.player.y);
    assert.ok(Math.abs(d - P.area * S.offset) < 1e-6, `slam centre stays next to the hero: ${d}`);
  }
  for (let i = 1; i < angles.length; i++) {
    let da = Math.abs(angles[i] - angles[i - 1]) % (Math.PI * 2);
    da = Math.min(da, Math.PI * 2 - da);
    assert.ok(Math.abs(da - (Math.PI * 2) / P.amount) < 1e-6, 'next slam turns around the hero');
  }
});

test('spear: pins hit foes in place for pin seconds, then sticks in the ground', () => {
  const sim = setup('spear', 1);
  const P = WEAPONS.spear.levels[0];
  // в ряд 2 + pierce целей: первые 1 + pierce задеты, последняя нет
  // (pierce из данных, docs/BALANCE_AUDIT.md 13)
  const line = Array.from({ length: P.pierce + 2 },
      (_, i) => dummy(sim, 50 + i * 12, 0, { still: false }));
  const a = line[0];
  const c = line[line.length - 1];
  let pinnedAt = -1;
  run(sim, 1, idle, (s) => {
    if (pinnedAt < 0 && moveMul(a, s) === 0) pinnedAt = s.time;
  });
  sim.player.weapons[0].cooldown = 1e9;
  assert.ok(pinnedAt > 0, 'first foe pinned');
  assert.ok(line.slice(0, -1).every((e) => e.hp < e.maxHp), 'first 1 + pierce foes hit');
  assert.equal(c.hp, c.maxHp, 'the third foe is past the pierce limit');
  assert.equal(moveMul(c, sim), 1, 'and is not pinned');
  // пригвождённый не двигается
  const x0 = a.x;
  if (moveMul(a, sim) === 0) {
    sim.step(DT, idle);
    assert.equal(a.x, x0, 'pinned foe stands still');
  }
  // копьё торчит в земле, потом исчезает
  assert.ok(own(sim, 'spear').some((p) => p.c === 1), 'spear stuck in the ground');
  run(sim, Math.max(P.pin, WEAPON_BEHAVIOR.impale.stuck) + 0.2);
  assert.equal(moveMul(a, sim), 1, 'pin wears off');
  assert.equal(own(sim, 'spear').length, 0, 'stuck spear gone');
});

test('dragon lance: the stuck spear bursts and pins foes around it', () => {
  const sim = setup('dragon_lance', 1);
  const P = WEAPONS.dragon_lance.levels[0];
  const target = dummy(sim, 60, 0);
  // рядом с концом полёта, но не на линии копья: его заденет только взрыв
  const reach = P.speed * P.duration;
  const side = dummy(sim, reach, P.burst * 0.6);
  let burst = false;
  run(sim, 2, idle, (s) => {
    if (s.projectiles.some((p) => p.wid === 'dragon_lance' && p.fx === 'boom')) burst = true;
  });
  assert.ok(target.hp < target.maxHp);
  assert.ok(burst, 'burst on landing');
  assert.ok(side.hp < side.maxHp, 'burst damage');
});

test('frost orb: one big slow orb passes through every foe, hits on ticks and chills them', () => {
  const sim = setup('frost_orb', 1);
  const P = WEAPONS.frost_orb.levels[0];
  const line = [];
  for (let i = 0; i < 6; i++) line.push(dummy(sim, 40 + i * 25, 0));
  assert.ok(untilFire(sim, 'frost_orb'));
  sim.player.weapons[0].cooldown = 1e9;
  const orbs = own(sim, 'frost_orb');
  assert.equal(orbs.length, 1);
  assert.equal(orbs[0].radius, P.area);
  let maxSlow = 1;
  run(sim, P.duration, idle, (s) => {
    maxSlow = Math.min(maxSlow, ...line.map((e) => moveMul(e, s)));
  });
  assert.ok(line.every((e) => e.hp < e.maxHp), 'pierces everything on its way');
  assert.ok(Math.abs(maxSlow - P.status.slow) < 1e-9, 'chilled');
  // медленный: прошёл не дальше speed × duration
  run(sim, 0.1);
  assert.equal(own(sim, 'frost_orb').length, 0, 'gone after duration');
  run(sim, P.status.duration + 0.1);
  assert.ok(line.every((e) => moveMul(e, sim) === 1), 'chill wears off');
});

test('blizzard: orbs spiral out in every direction', () => {
  const sim = setup('blizzard', 1);
  const P = WEAPONS.blizzard.levels[0];
  dummy(sim, 100, 0);
  assert.ok(untilFire(sim, 'blizzard'));
  const orbs = own(sim, 'blizzard');
  assert.equal(orbs.length, P.amount);
  const a0 = orbs.map((p) => p.a);
  run(sim, 0.5);
  orbs.forEach((p, i) => assert.ok(p.a > a0[i], 'course turns (spiral)'));
  const pl = sim.player;
  const quarter = (p) => Math.round(Math.atan2(p.y - pl.y, p.x - pl.x) / (Math.PI / 2));
  const quad = new Set(orbs.map(quarter));
  assert.ok(quad.size >= 3, 'spread around the hero');
});

test('rework weapons are deterministic: same seed, same state', () => {
  for (const [id, lv] of [['hammer', 5], ['titan_maul', 1], ['spear', 5], ['dragon_lance', 1],
    ['frost_orb', 5], ['blizzard', 1]]) {
    const sims = [setup(id, lv, 11), setup(id, lv, 11)];
    for (const s of sims) {
      for (let i = 0; i < 14; i++) {
        dummy(s, 110 * Math.cos(i * 0.9), 110 * Math.sin(i * 0.9), { still: false, heavy: false });
      }
    }
    for (let k = 0; k < 4; k++) {
      for (const s of sims) run(s, 1, { x: k & 1 ? 1 : -1, y: 0 });
      assert.equal(snapshot(sims[0]), snapshot(sims[1]), `${id}: diverged at ${k + 1} s`);
    }
    assert.ok((sims[0].damageByWeapon[id] || 0) > 0, `${id}: dealt damage`);
  }
});
