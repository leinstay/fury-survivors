// Сопротивление (процент, кап, миграция armor), ДоТы на врагах (src/behaviors/status.js), облако (cloud)
// и неуправляемый луч (beam).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import { createRng } from '../../src/core/rng.js';
import { computeStats, statReport } from '../../src/core/stats.js';
import { hashParts } from '../../src/core/lockstep.js';
import { normalizeItem, normalizeInventory, affixMax } from '../../src/core/items.js';
import { normalizeLoadout } from '../../src/core/loadout.js';
import { normalizeCodex } from '../../src/core/codex.js';
import { normalizeAchievements, achievementBonus } from '../../src/core/achievements.js';
import { applyStatus, hasDots, dotTicks, moveMul, applySlow, applyRoot, isRooted } from
  '../../src/behaviors/status.js';
import { STATUS, DOT } from '../../src/data/status.js';
import { STAT_CAPS } from '../../src/data/stats.js';
import { PASSIVES } from '../../src/data/passives.js';
import { WEAPONS, WEAPON_BEHAVIOR } from '../../src/data/weapons.js';
import { STAT_REF, LEGACY_AFFIX_STATS } from '../../src/data/items.js';
import { HEROES } from '../../src/data/heroes.js';
import { COMBAT } from '../../src/data/constants.js';

const DT = 1 / 60;
const idle = { x: 0, y: 0 };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

// Сим без директора и объектов, герой бессмертен, без критов; weapons — [[id, level]].
function setup(weapons = [], seed = 5) {
  const sim = createSim({ seed });
  sim.director = { update() {} };
  sim._updateChunks = () => {};
  sim.props = [];
  sim.player.weapons = weapons.map(([id, level]) => ({ id, level }));
  sim._syncBuild();
  const pl = sim.player;
  pl.stats.crit = 0;
  pl.maxHp = pl.hp = pl.stats.maxHp = 1e9;
  return sim;
}

function dummy(sim, dx, dy, type = 'slime') {
  const pl = sim.player;
  const e = sim.spawnEnemy(type, pl.x + dx, pl.y + dy);
  e.hp = e.maxHp = 1e9;
  e.speed = 0;
  e.resist = 1;
  return e;
}

function run(sim, seconds, input = idle, onStep = null) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    sim.step(DT, input);
    if (onStep) onStep(sim);
  }
}

// ---------- resistance ----------

test('resistance: a hit is reduced by a percentage, never below COMBAT.minDamage', () => {
  const sim = createSim({ seed: 1 });
  const pl = sim.player;
  pl.hp = 100;
  pl.stats.resistance = 0.3;
  pl.stats.dodge = 0;
  sim.hurtPlayer(10, pl);
  near(pl.hp, 93);
  pl.iframes = 0;
  pl.stats.resistance = STAT_CAPS.resistance;
  sim.hurtPlayer(1, pl);
  near(pl.hp, 93 - COMBAT.minDamage);
  // без сопротивления удар целиком
  pl.iframes = 0;
  pl.stats.resistance = 0;
  sim.hurtPlayer(10, pl);
  near(pl.hp, 82);
});

test('resistance: sources add up linearly and stop at the hard cap with (max)', () => {
  const base = HEROES.heroine.stats;
  const s = computeStats(base, [{ id: 'resistance', level: 1 }], {},
      { flat: { resistance: 0.05 }, inc: { resistance: 0.02 } });
  near(s.resistance, base.resistance + PASSIVES.resistance.levels[0] + 0.05 + 0.02);
  const big = computeStats(base, [{ id: 'resistance', level: 5 }], {}, { flat: { resistance: 0.5 } });
  assert.equal(big.resistance, STAT_CAPS.resistance);
  const rep = statReport(base, [{ id: 'resistance', level: 5 }], { flat: { resistance: 0.5 } });
  assert.ok(rep.resistance.capped);
  near(rep.resistance.raw, base.resistance + PASSIVES.resistance.levels[4] + 0.5);
  assert.ok(HEROES.heroine.stats.resistance > 0 && HEROES.mage.stats.resistance === 0);
  assert.ok(STAT_CAPS.resistance >= 0.6 && STAT_CAPS.resistance <= 0.75);
  // пассивка в долях, шаги убывают, L5 ниже капа
  const lv = PASSIVES.resistance.levels;
  for (let i = 1; i < lv.length; i++) {
    assert.ok(lv[i] - lv[i - 1] <= lv[i - 1] - (lv[i - 2] || 0) + 1e-9);
  }
  assert.ok(lv[lv.length - 1] < STAT_CAPS.resistance);
});

test('resistance: old saves with armor migrate to resistance without crashing', () => {
  const max = affixMax('resistance', [2, 2], 2);
  const oldMax = max / LEGACY_AFFIX_STATS.armor.mul;
  const raw = {
    uid: 'old1', type: 'helm', shape: [2, 2], tier: 2, rarity: 'rare', enchant: 1,
    affixes: [
      { stat: 'armor', value: oldMax * 0.8, min: oldMax / 2, max: oldMax },
      { stat: 'maxHp', value: 0.01, min: -0.02, max: 0.04 },
      { stat: 'crit', value: 0.001, min: -0.002, max: 0.004 },
    ],
  };
  const it = normalizeItem(raw);
  assert.ok(it, 'old helm survives');
  assert.equal(it.implicit, 'resistance');
  assert.equal(it.affixes[0].stat, 'resistance');
  near(it.affixes[0].value, max * 0.8, 1e-3);
  near(it.affixes[0].max, max, 1e-3);
  near(LEGACY_AFFIX_STATS.armor.mul, STAT_REF.resistance / 9);
  // armor вторым аффиксом и у «armor» (тип предмета остался)
  const chest = normalizeItem({
    uid: 'old2', type: 'armor', shape: [2, 3], tier: 1, rarity: 'common',
    affixes: [{ stat: 'maxHp', value: 0.05, min: 0.03, max: 0.06 }, { stat: 'armor', value: -0.3, min: -1, max: 2 }],
  });
  assert.ok(chest);
  assert.equal(chest.type, 'armor');
  assert.equal(chest.affixes[1].stat, 'resistance');
  assert.ok(chest.affixes[1].value < 0);
  // стеш, сумка и лоадаут из старого сохранения
  const inv = normalizeInventory({ v: 1, stash: [raw, chest, { junk: true }],
    bag: { cols: 7, rows: 4, items: [{ item: { ...raw, uid: 'old3' }, x: 0, y: 0 }] } });
  assert.equal(inv.stash.length, 2);
  assert.equal(inv.bag.items.length, 1);
  assert.equal(inv.bag.items[0].item.affixes[0].stat, 'resistance');
  const lo = normalizeLoadout({ cols: 7, rows: 4, items: [{ item: raw, x: 0, y: 0 }], ach: ['no_one_left'] });
  const sim = createSim({ seed: 2, loadouts: [lo] });
  assert.ok(sim.player.stats.resistance > 0);
  assert.ok(!('armor' in sim.player.stats) || sim.player.stats.armor === undefined);
  // ачивка со старым бонусом armor теперь даёт resistance
  const ach = normalizeAchievements({ done: { no_one_left: 1 } });
  assert.ok(ach.done.no_one_left);
  const b = achievementBonus(['no_one_left']);
  assert.ok((b.flat.resistance || 0) > 0 && !(b.flat.armor));
  // кодекс: пассивка armor в увиденном и в летописи
  const cx = normalizeCodex({ v: 1, seen: { passive: { armor: 1 } },
    runs: [{ at: 1, passives: [['armor', 3]], weapons: [['blade_arc', 2]] }] });
  assert.equal(cx.seen.passive.resistance, 1);
  assert.ok(!cx.seen.passive.armor);
  if (cx.runs.length) assert.deepEqual(cx.runs[0].passives, [['resistance', 3]]);
});

// ---------- ДоТы ----------

test('dots: poison stacks, each stack ticks on its own timer, capped at maxStacks', () => {
  const sim = setup();
  const e = dummy(sim, 200, 0);
  const st = { type: 'poison', chance: 1 };
  const def = STATUS.poison;
  for (let i = 0; i < 3; i++) applyStatus(e, sim, st, 100, 'poison_cloud', sim.player);
  assert.equal(e.pzN, 3);
  const { n } = dotTicks(def, 100, def.share);
  run(sim, n * DOT.tick + 0.2);
  near(e.maxHp - e.hp, 3 * 100 * def.share, 1e-3);
  assert.ok(!hasDots(e), 'poison wore off');
  for (let i = 0; i < def.maxStacks + 5; i++) applyStatus(e, sim, st, 10, 'poison_cloud', sim.player);
  assert.equal(e.pzN, def.maxStacks);
  // стак с новым таймером: наложенный позже живёт дольше
  const s2 = setup();
  const e2 = dummy(s2, 200, 0);
  applyStatus(e2, s2, st, 100, 'poison_cloud', s2.player);
  run(s2, 1.0);
  applyStatus(e2, s2, st, 100, 'poison_cloud', s2.player);
  run(s2, def.duration - 0.6);
  assert.equal(e2.pzN, 1, 'the first stack expired, the second still ticks');
});

test('dots: burning does not stack — the strongest stays, the timer refreshes', () => {
  const sim = setup();
  const e = dummy(sim, 200, 0);
  const st = { type: 'burning', chance: 1 };
  const def = STATUS.burning;
  applyStatus(e, sim, st, 100, 'firebomb', sim.player);
  const strong = e.burn.per;
  applyStatus(e, sim, st, 50, 'firebomb', sim.player);
  near(e.burn.per, strong);
  run(sim, def.duration - 0.6);
  applyStatus(e, sim, st, 50, 'firebomb', sim.player); // слабее, но таймер заново
  const { n } = dotTicks(def, 100, def.share);
  assert.equal(e.burn.left, n);
  applyStatus(e, sim, st, 300, 'meteor', sim.player);
  near(e.burn.per, (300 * def.share) / n);
  assert.equal(e.burn.wid, 'meteor');
  // кровотечение так же
  applyStatus(e, sim, { type: 'bleeding', chance: 1 }, 100, 'blade_arc', sim.player);
  applyStatus(e, sim, { type: 'bleeding', chance: 1 }, 10, 'blade_arc', sim.player);
  near(e.bleed.per, (100 * STATUS.bleeding.share) / dotTicks(STATUS.bleeding, 1, 1).n);
});

test('dots: ticks go to the source weapon stats (DPS, totals), not as hits; no crit, no thorns', () => {
  const sim = setup();
  const pl = sim.player;
  pl.stats.crit = 1; // тики не критуют
  const e = dummy(sim, 200, 0);
  applyStatus(e, sim, { type: 'poison', chance: 1 }, 60, 'poison_cloud', pl);
  const dots = [];
  run(sim, STATUS.poison.duration + 0.5, idle, (s) => {
    for (const ev of s.events) {
      if (ev.type === 'dot') dots.push(ev);
      assert.notEqual(ev.type, 'hit');
      assert.notEqual(ev.type, 'thorns');
    }
  });
  const total = 60 * STATUS.poison.share;
  near(sim.damageByWeapon.poison_cloud, total, 1e-6);
  near(pl.damageByWeapon.poison_cloud, total, 1e-6);
  assert.equal(pl.hitsByWeapon.poison_cloud || 0, 0);
  assert.ok(pl.dps > 0, 'DPS window sees the dot');
  assert.ok(dots.length >= 5 && dots.every((d) => d.status === 'poison' && d.weapon === 'poison_cloud'));
  near(e.maxHp - e.hp, total, 1e-6);
});

test('dots: tied to the enemy uid; invulnerable reaper takes no ticks; chance rolls the sim RNG', () => {
  const sim = setup();
  const e = dummy(sim, 200, 0);
  applyStatus(e, sim, { type: 'burning', chance: 1 }, 100, 'firebomb', sim.player);
  assert.ok(hasDots(e));
  e.uid += 1000; // объект из пула у нового врага
  assert.ok(!hasDots(e));
  assert.equal(applyStatus(e, sim, { type: 'burning', chance: 0 }, 100, 'firebomb', sim.player), false);
  const before = sim.rng.state;
  applyStatus(e, sim, { type: 'burning', chance: 1 }, 100, 'firebomb', sim.player);
  assert.equal(sim.rng.state, before, 'chance 1 draws nothing');
  applyStatus(e, sim, { type: 'burning', chance: 0.5 }, 100, 'firebomb', sim.player);
  assert.notEqual(sim.rng.state, before, 'chance < 1 draws once');
  const reaper = sim.spawnBoss('reaper');
  if (reaper && reaper.def.invulnerable) {
    reaper.dotUid = 0;
    applyStatus(reaper, sim, { type: 'poison', chance: 1 }, 100, 'poison_cloud', sim.player);
    const hp = reaper.hp;
    reaper.vuln = false;
    for (let i = 0; i < 60; i++) {
      sim.dotDamage(reaper, 10, 'poison_cloud', sim.player, 'poison');
    }
    assert.equal(reaper.hp, hp);
  }
});

test('dots: weapons apply their status in a fight; bleeding only from melee; lockstep hash sees dots', () => {
  for (const [id, type] of [['blade_arc', 'bleeding'], ['firebomb', 'burning'], ['meteor', 'burning'],
    ['poison_cloud', 'poison']]) {
    const sim = setup([[id, 3]], 7);
    for (let i = 0; i < 10; i++) dummy(sim, 30 + 6 * i, (i % 3 - 1) * 10);
    let seen = false;
    run(sim, 8, idle, (s) => { if (s.events.some((ev) => ev.type === 'dot' && ev.status === type)) seen = true; });
    assert.ok(seen, `${id} applies ${type}`);
  }
  for (const [id, w] of Object.entries(WEAPONS)) {
    for (const s of [w.status, ...w.levels.map((l) => l.status)]) {
      if (!s) continue;
      assert.ok(STATUS[s.type], `${id}: status type`);
      assert.ok(s.chance > 0 && s.chance <= 1, `${id}: chance`);
      if (STATUS[s.type].melee) assert.ok(['melee_arc', 'slash'].includes(w.behavior), `${id}: bleeding is melee only`);
    }
  }
  for (const def of Object.values(STATUS)) {
    if (def.stacking === 'slow') { assert.equal(def.share, 0, 'chill deals no damage'); continue; }
    assert.ok(def.share >= 0.2 && def.share <= 0.4, 'dots stay weak (20–40% of the hit)');
    assert.ok(def.duration >= 2 && def.duration <= 4);
  }
  // детерминизм: два одинаковых сима с ДоТами дают одинаковый хеш, ДоТы в нём есть
  const mk = () => {
    const s = setup([['firebomb', 5], ['poison_cloud', 5]], 11);
    for (let i = 0; i < 8; i++) dummy(s, 30 * Math.cos(i), 30 * Math.sin(i));
    run(s, 5);
    return s;
  };
  const a = mk();
  const b = mk();
  const pa = Object.fromEntries(hashParts(a));
  assert.deepEqual(hashParts(a), hashParts(b));
  assert.ok(pa.dots !== 0, 'dots part is set');
  const e = a.enemies.find((x) => !x.dead && hasDots(x));
  assert.ok(e);
  e.pzN = 0; e.burn.left = 0; e.bleed.left = 0;
  assert.notEqual(Object.fromEntries(hashParts(a)).dots, pa.dots, 'hash changes with dot state');
});

// ---------- облако ----------

test('cloud: one cloud per cooldown at the hero, stays put, vanishes after duration', () => {
  const sim = setup([['poison_cloud', 1]]);
  const P = WEAPONS.poison_cloud.levels[0];
  const fires = [];
  run(sim, P.cooldown * 2 + 0.5, idle, (s) => {
    for (const ev of s.events) if (ev.type === 'weaponFire' && ev.weapon === 'poison_cloud') fires.push(s.time);
  });
  assert.equal(fires.length, 3);
  near(fires[0], WEAPON_BEHAVIOR.cloud.first, DT + 1e-9);
  near(fires[1] - fires[0], P.cooldown, DT + 1e-9);
  // облако на месте, когда герой ушёл
  const s2 = setup([['poison_cloud', 1]]);
  run(s2, WEAPON_BEHAVIOR.cloud.first + DT);
  const c = s2.projectiles.find((p) => p.wid === 'poison_cloud');
  assert.ok(c);
  const [cx, cy] = [c.x, c.y];
  run(s2, 1, { x: 1, y: 0 });
  assert.ok(s2.player.x - cx > 50, 'hero walked away');
  assert.equal(c.x, cx);
  assert.equal(c.y, cy);
  const uid = c.uid;
  run(s2, P.duration);
  assert.ok(!s2.projectiles.some((p) => p.uid === uid), 'cloud gone after duration');
});

test('cloud: amount N drops N clouds staggered, each on its own cooldown; poisons foes inside', () => {
  const lv = WEAPONS.poison_cloud.levels.findIndex((l) => l.amount >= 2);
  assert.ok(lv >= 0, 'a level with two clouds');
  const P = WEAPONS.poison_cloud.levels[lv];
  const sim = setup([['poison_cloud', lv + 1]]);
  const e = dummy(sim, 5, 0);
  const fires = [];
  let poisoned = false;
  run(sim, P.cooldown * 2 + 0.2, idle, (s) => {
    for (const ev of s.events) if (ev.type === 'weaponFire' && ev.weapon === 'poison_cloud') fires.push(s.time);
    if (e.pzN > 0) poisoned = true;
  });
  assert.equal(fires.length, 2 * P.amount);
  near(fires[1] - fires[0], P.cooldown / P.amount, DT + 1e-9);
  near(fires[2] - fires[0], P.cooldown, DT + 1e-9);
  near(fires[3] - fires[1], P.cooldown, DT + 1e-9);
  assert.ok(poisoned);
  assert.equal(e.kx, 0);
  const evo = WEAPONS.miasma.levels[0];
  assert.ok(evo.amount >= 2 && WEAPONS.miasma.behavior === 'cloud');
  // слабее святой земли того же уровня (урон в секунду без яда)
  WEAPONS.poison_cloud.levels.forEach((l, i) => {
    const h = WEAPONS.holy_ground.levels[i];
    assert.ok(l.damage / l.tick < h.damage / h.cooldown, `L${i + 1}`);
  });
});

// ---------- луч ----------

test('beam: random angles from the sim RNG, one per sector, amount beams per cast', () => {
  const sim = setup([['prism_ray', 1]]);
  const w = sim.player.weapons[0];
  const P = WEAPONS.prism_ray.levels[0];
  const r = createRng(sim.rng.state);
  w.timer = 0;
  w.beh.update(w, sim, DT);
  assert.equal(w.beams.length, P.amount);
  const tau = Math.PI * 2;
  for (let i = 0; i < P.amount; i++) {
    near(w.beams[i].a, ((i + r.next()) * tau) / P.amount, 1e-12);
  }
  assert.ok(WEAPONS.prism_ray.levels[0].amount > WEAPONS.beam.levels[4].amount);
  // другой сид — другие углы
  const s2 = setup([['beam', 1]], 99);
  const s3 = setup([['beam', 1]], 5);
  run(s2, 0.4);
  run(s3, 0.4);
  assert.notEqual(s2.player.weapons[0].beams[0]?.a, s3.player.weapons[0].beams[0]?.a);
});

test('beam: stays where it was cast when the hero moves, ticks every tick for duration', () => {
  const sim = setup([['beam', 1]]);
  const w = sim.player.weapons[0];
  const P = WEAPONS.beam.levels[0];
  w.timer = 0;
  w.beh.update(w, sim, DT);
  const b = w.beams[0];
  const e = dummy(sim, Math.cos(b.a) * 60, Math.sin(b.a) * 60);
  const segs = sim.projectiles.filter((p) => p.wid === 'beam').map((p) => [p.x, p.y]);
  assert.ok(segs.length > 0);
  const hits = [];
  // герой уходит поперёк луча
  run(sim, P.duration + 0.1, { x: -Math.sin(b.a), y: Math.cos(b.a) }, (s) => {
    for (const ev of s.events) if (ev.type === 'hit' && ev.weapon === 'beam') hits.push(s.time);
    const now = s.projectiles.filter((p) => p.wid === 'beam' && p.life > 0);
    if (now.length === segs.length) {
      now.forEach((p, i) => { near(p.x, segs[i][0]); near(p.y, segs[i][1]); });
    }
  });
  assert.ok(Math.hypot(sim.player.x - b.x, sim.player.y - b.y) > 40, 'hero moved away');
  const want = Math.round(P.duration / P.tick);
  assert.ok(Math.abs(hits.length - want) <= 1, `hits ${hits.length} vs ${want}`);
  assert.ok(e.hp < e.maxHp);
  // объект на линии луча ломается
  const s2 = setup([['beam', 1]]);
  const w2 = s2.player.weapons[0];
  w2.timer = 0;
  const r = createRng(s2.rng.state);
  const a = r.next() * Math.PI * 2;
  const pl2 = s2.player;
  s2.props = [{ uid: 1e6, x: pl2.x + Math.cos(a) * 50, y: pl2.y + Math.sin(a) * 50, radius: 6,
    hp: 1, dead: false, mark: 0, hitAt: new Float64Array(64) }];
  let broke = false;
  s2._damageProp = (o) => { o.dead = true; broke = true; };
  w2.beh.update(w2, s2, DT);
  assert.ok(broke, 'prop on the beam line breaks');
  // урон высокий: за тик больше, чем у святой земли и облака
  assert.ok(P.damage > WEAPONS.holy_ground.levels[0].damage * 2);
});

test('thorns: old saves (v1, flat damage) are rescaled to shares of enemy max HP', () => {
  const max = affixMax('thorns', [2, 2], 2);
  const raw = { uid: 'th1', type: 'shield', shape: [2, 2], tier: 2, rarity: 'common',
    affixes: [{ stat: 'thorns', value: max * 0.9 * (20 / 0.15), min: 0, max: max * (20 / 0.15) },
      { stat: 'maxHp', value: 0.01, min: -0.02, max: 0.04 }] };
  const old = normalizeInventory({ v: 1, stash: [raw] });
  near(old.stash[0].affixes[0].value, max * 0.9, 1e-3);
  const now = normalizeInventory({ v: 2, stash: [{ ...raw, affixes: [{ stat: 'thorns', value: max * 0.9,
    min: max / 2, max }, raw.affixes[1]] }] });
  near(now.stash[0].affixes[0].value, max * 0.9, 1e-3);
  assert.ok(STAT_CAPS.thorns > 0 && STAT_CAPS.thorns <= 0.5);
  assert.ok(PASSIVES.thorns.levels.every((v) => v > 0 && v < STAT_CAPS.thorns));
});

test('chill: a status with zero damage that slows (through applySlow), bosses are immune', () => {
  const sim = setup();
  const e = dummy(sim, 200, 0);
  const before = e.hp;
  assert.ok(applyStatus(e, sim, { type: 'chill', chance: 1, slow: 0.5, duration: 1.2 }, 0, 'frost_orb',
      sim.player));
  near(moveMul(e, sim), 0.5);
  assert.ok(!hasDots(e), 'no damage ticks');
  run(sim, 1.0);
  near(moveMul(e, sim), 0.5);
  assert.equal(e.hp, before);
  run(sim, 0.3);
  assert.equal(moveMul(e, sim), 1);
  // по умолчанию числа из STATUS.chill
  applyStatus(e, sim, { type: 'chill' }, 10, 'frost_orb', sim.player);
  near(moveMul(e, sim), STATUS.chill.slow);
  const boss = sim.spawnBoss('kitsune_empress');
  applyStatus(boss, sim, { type: 'chill', slow: 0.5 }, 10, 'frost_orb', sim.player);
  near(moveMul(boss, sim), 1);
});

test('targets: lightning picks a crate next to a mob as fairly as the mob, and breaks it', () => {
  let broke = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const sim = setup([['storm_chain', 1]], seed);
    const pl = sim.player;
    const mob = dummy(sim, 60, 0);
    mob.hp = mob.maxHp = 1e9;
    const crate = { uid: 1e7 + seed, sprite: 'x', x: pl.x - 55, y: pl.y, angle: 0, breakable: true, hp: 1,
      radius: 6, drop: {}, dead: false, mark: 0, hitAt: new Float64Array(64) };
    sim.props = [crate];
    let hit = false;
    sim._damageProp = (o) => { o.dead = true; hit = true; };
    run(sim, 3);
    if (hit) broke++;
    assert.ok(mob.hp < mob.maxHp, 'the mob is hit too (the chain jumps on)');
  }
  assert.equal(broke, 6, 'the crate is closer, so the bolt takes it every time');
  // самонаводящиеся берут объект из того же списка
  const sim = setup([['crossbow', 1]]);
  const far = dummy(sim, 200, 0);
  const crate = { uid: 9e6, x: sim.player.x - 40, y: sim.player.y, breakable: true, hp: 1,
    radius: 6,
    dead: false, mark: 0, hitAt: new Float64Array(64) };
  sim.props = [crate];
  assert.equal(sim.nearestTarget(sim.player.x, sim.player.y, 300), crate);
  crate.x = sim.player.x - 300;
  assert.equal(sim.nearestTarget(sim.player.x, sim.player.y, 400), far);
});

test('root: own timer, moveMul 0 while rooted, independent of slow; bosses are immune', () => {
  const sim = setup();
  const e = dummy(sim, 200, 0);
  applySlow(e, sim, 0.5, 3);
  applyRoot(e, sim, 1);
  assert.ok(isRooted(e, sim));
  assert.equal(moveMul(e, sim), 0);
  applyRoot(e, sim, 0.2); // короче — не укорачивает
  run(sim, 1.05);
  assert.ok(!isRooted(e, sim));
  near(moveMul(e, sim), 0.5, 1e-9); // замедление идёт своим сроком
  run(sim, 2.1);
  assert.equal(moveMul(e, sim), 1);
  applyRoot(e, sim, 1);
  e.uid += 1000;
  assert.ok(!isRooted(e, sim), 'tied to uid');
  const boss = sim.spawnBoss('kitsune_empress');
  applyRoot(boss, sim, 1);
  assert.ok(!isRooted(boss, sim));
  assert.equal(moveMul(boss, sim), 1);
});
