// Новые оружия META 1.4: механики behavior (луч, огоньки, замедление, мины, метеор, копьё, яд) и их данные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import { WEAPONS, WEAPON_BEHAVIOR } from '../../src/data/weapons.js';
import { COMBOS } from '../../src/data/combos.js';
import { SPRITES } from '../../assets/sprites/manifest.js';
import { en } from '../../src/i18n/en.js';
import { WEAPON_BEHAVIORS } from '../../src/behaviors/index.js';
import { applySlow, moveMul } from '../../src/behaviors/status.js';

const DT = 1 / 60;
const idle = { x: 0, y: 0 };
const NEW = ['spear', 'hammer', 'crossbow', 'mines', 'frost_orb', 'poison_cloud', 'beam', 'wisp', 'meteor'];

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

// Шаг с подсчётом попаданий оружия id: { hits, at[] (время каждого удара) }.
function runHits(sim, seconds, id, input = idle) {
  const at = [];
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    sim.step(DT, input);
    for (const e of sim.events) if (e.type === 'hit' && e.weapon === id) at.push(sim.time);
  }
  return at;
}

function dummy(sim, type, dx, dy) {
  const pl = sim.player;
  const e = sim.spawnEnemy(type, pl.x + dx, pl.y + dy);
  e.hp = e.maxHp = 1e9;
  return e;
}

test('new weapons: data, i18n, sprites and one evolution each', () => {
  for (const id of NEW) {
    const w = WEAPONS[id];
    assert.ok(w && !w.evolved, id);
    assert.equal(w.levels.length, 5, `${id}: 5 levels`);
    assert.ok(en[`weapon.${id}.name`] && en[`weapon.${id}.desc`], `${id}: i18n`);
    const c = COMBOS.find((x) => x.from[0] === id);
    assert.ok(c, `${id}: evolution`);
    assert.ok(en[`weapon.${c.result}.name`] && en[`weapon.${c.result}.desc`], `${c.result}: i18n`);
    assert.ok(SPRITES[WEAPONS[c.result].icon], `${c.result}: icon`);
  }
  for (const [id, w] of Object.entries(WEAPONS)) {
    if (w.shot) assert.ok(SPRITES[w.shot], `${id}: shot sprite`);
    for (const lv of w.levels) {
      if (w.behavior === 'beam') {
        assert.ok(lv.length > 0 && lv.speed > 0 && lv.amount >= 1 && lv.bounces >= 1, `${id}: beam level`);
        assert.ok(lv.area === undefined && lv.width === undefined, `${id}: beam has no area stat`);
      }
      if (w.behavior === 'summon') assert.ok(w.shot && lv.amount >= 1 && lv.speed > 0 && lv.duration > 0, `${id}: summon level`);
      if (lv.mine) assert.ok(lv.trigger > 0 && lv.spread > 0 && lv.duration > 0 && !lv.fireDamage, `${id}: mine level`);
      if (lv.slow !== undefined) assert.ok(lv.slow > 0 && lv.slow < 1 && lv.slowTime > 0, `${id}: slow`);
      if (lv.fall !== undefined) assert.ok(lv.delay > 0, `${id}: meteor delay`);
    }
  }
  assert.ok(WEAPON_BEHAVIORS.beam && WEAPON_BEHAVIORS.summon);
});

test('beam: deterministic (same seed, same hits), not tied to the movement direction', () => {
  const a = setup('beam', 3, 9);
  const b = setup('beam', 3, 9);
  for (const s of [a, b]) for (let i = 0; i < 6; i++) dummy(s, 'catgirl', 60 * Math.cos(i), 60 * Math.sin(i));
  const ha = runHits(a, 4, 'beam', { x: 0, y: 1 });
  const hb = runHits(b, 4, 'beam', { x: 0, y: 1 });
  assert.deepEqual(ha, hb);
  assert.ok(ha.length > 0);
  // луч летит в цель, а не по ходу героя
  const c = setup('beam', 1, 9);
  const e = dummy(c, 'catgirl', -70, 0);
  e.speed = 0;
  runHits(c, 0.4, 'beam');
  const ray = c.projectiles.find((p) => p.wid === 'beam' && p.fx === 'snake');
  assert.ok(Math.cos(ray.angle - Math.atan2(e.y - c.player.y, e.x - c.player.x)) > 0.95);
});

test('summon: wisps follow the hero and shoot the nearest enemy', () => {
  const sim = setup('wisp', 2);
  const wisps = () => sim.projectiles.filter((p) => p.wid === 'wisp' && p.sprite === 'proj_wisp');
  runHits(sim, 0.1, 'wisp');
  assert.equal(wisps().length, WEAPONS.wisp.levels[1].amount);
  // герой уходит вправо, огоньки догоняют
  runHits(sim, 3, 'wisp', { x: 1, y: 0 });
  runHits(sim, 1, 'wisp');
  const pl = sim.player;
  for (const p of wisps()) assert.ok(Math.hypot(p.x - pl.x, p.y - pl.y) < WEAPON_BEHAVIOR.summon.orbitR * 2, 'wisp near the hero');
  const e = dummy(sim, 'slime', 120, 0);
  e.speed = 0;
  const at = runHits(sim, 3, 'wisp');
  assert.ok(at.length > 0, 'wisp shots hit');
  assert.ok(e.hp < e.maxHp);
});

test('slow: frost orb slows touched enemies for the chill duration, deterministic, tied to the enemy uid', () => {
  const sim = setup('frost_orb', 1);
  const P = WEAPONS.frost_orb.levels[0];
  // враг рядом и стоит: ледяной шар долетит и заденет
  const e = dummy(sim, 'slime', 60, 0);
  e.speed = 0;
  let slowed = false;
  for (let i = 0; i < 6 / DT && !slowed; i++) { sim.step(DT, idle); slowed = moveMul(e, sim) < 1; }
  assert.ok(slowed, 'enemy got slowed');
  assert.ok(Math.abs(moveMul(e, sim) - P.status.slow) < 1e-9);
  // замедление гаснет: шар убран, через slowTime враг идёт как обычно
  for (const p of sim.projectiles) if (p.wid === 'frost_orb') p.life = 0;
  sim.player.weapons[0].cooldown = 1e9;
  for (let i = 0; i < (P.status.duration + 0.1) / DT; i++) sim.step(DT, idle);
  assert.equal(moveMul(e, sim), 1);

  // замедленный враг идёт медленнее
  const s2 = setup('blade_arc', 1);
  s2.player.weapons = [];
  const a = dummy(s2, 'catgirl', 200, 0);
  const b = dummy(s2, 'catgirl', -200, 0);
  applySlow(a, s2, 0.5, 10);
  s2.step(DT, idle);
  const da = 200 - Math.abs(a.x - s2.player.x);
  const db = 200 - Math.abs(b.x - s2.player.x);
  assert.ok(Math.abs(da / db - 0.5) < 0.05, `slowed step ${da} vs ${db}`);
  // боссы поддаются слабее
  const boss = dummy(s2, 'lamia', 0, 300);
  boss.boss = true;
  applySlow(boss, s2, 0.5, 10);
  assert.equal(moveMul(boss, s2), 1, 'bosses are immune to slow');
  // объект врага из пула с новым uid не наследует замедление
  a.uid += 1000;
  assert.equal(moveMul(a, s2), 1);
});

test('mines: lie until an enemy comes close, then explode', () => {
  const sim = setup('mines', 1);
  const P = WEAPONS.mines.levels[0];
  // далёкий неподвижный враг нужен, чтобы оружие начало ставить мины
  const far = dummy(sim, 'slime', 290, 0);
  far.speed = 0;
  runHits(sim, 1.5, 'mines');
  const mines = sim.projectiles.filter((p) => p.wid === 'mines' && p.c === 1);
  assert.ok(mines.length >= 1, 'a mine lies on the ground');
  assert.equal(far.hp, far.maxHp, 'no damage without contact');
  const m = mines[0];
  const uid = m.uid;
  const e = dummy(sim, 'slime', 0, 0);
  e.x = m.x + P.trigger + e.size + 30; e.y = m.y;
  e.speed = 0;
  runHits(sim, 0.3, 'mines');
  assert.equal(e.hp, e.maxHp, 'outside the trigger radius nothing happens');
  e.x = m.x + P.trigger * 0.5;
  const at = runHits(sim, 0.5, 'mines');
  assert.ok(at.length > 0 && e.hp < e.maxHp, 'mine exploded on contact');
  assert.ok(!sim.projectiles.some((p) => p.uid === uid), 'the mine is gone');
});

test('mines: a mine always lands and ignores contact during the arming time', () => {
  const sim = setup('mines', 1);
  const P = WEAPONS.mines.levels[0];
  const far = dummy(sim, 'slime', 290, 0);
  far.speed = 0;
  // враг стоит там, куда ляжет мина: пока она летит, его не задевает
  let mine = null;
  while (!mine) {
    runHits(sim, 0.05, 'mines');
    mine = sim.projectiles.find((p) => p.wid === 'mines' && p.c === 1) || null;
  }
  const e = dummy(sim, 'slime', 0, 0);
  e.x = mine.x; e.y = mine.y; e.speed = 0;
  const arm = WEAPON_BEHAVIOR.area_drop.mineArm;
  runHits(sim, arm * 0.6, 'mines');
  assert.equal(e.hp, e.maxHp, 'no explosion before the mine is armed');
  assert.ok(sim.projectiles.some((p) => p.uid === mine.uid), 'the mine still lies there');
  const at = runHits(sim, arm, 'mines');
  assert.ok(at.length > 0 && e.hp < e.maxHp, 'armed mine explodes on contact');
  assert.ok(P.area > 60, 'random placement is paid with a bigger blast');
});

test('mines: an untouched mine blows up when its time runs out', () => {
  const sim = setup('mines', 1);
  const P = WEAPONS.mines.levels[0];
  const far = dummy(sim, 'slime', 290, 0);
  far.speed = 0;
  runHits(sim, 1.2, 'mines');
  const m = sim.projectiles.find((p) => p.wid === 'mines' && p.c === 1);
  assert.ok(m, 'a mine lies on the ground');
  const uid = m.uid;
  far.dead = true; // никого рядом: мина ждёт до конца duration
  let boom = false;
  for (let i = 0; i < (P.duration + 0.5) / DT && !boom; i++) {
    sim.step(DT, idle);
    boom = !sim.projectiles.some((p) => p.uid === uid) &&
      sim.projectiles.some((p) => p.wid === 'mines' && p.fx === 'boom');
  }
  assert.ok(boom, 'blast after duration');
});

test('meteor: warning circle first, damage only after the long delay', () => {
  const sim = setup('meteor', 1);
  const P = WEAPONS.meteor.levels[0];
  const e = dummy(sim, 'slime', 100, 0);
  e.speed = 0;
  let fired = -1;
  const at = [];
  for (let i = 0; i < 3 / DT; i++) {
    sim.step(DT, idle);
    for (const ev of sim.events) {
      if (ev.type === 'weaponFire' && ev.weapon === 'meteor' && fired < 0) fired = sim.time;
      if (ev.type === 'hit' && ev.weapon === 'meteor') at.push(sim.time);
    }
    if (fired >= 0 && at.length === 0 && sim.time - fired < P.delay - 2 * DT) {
      assert.ok(sim.projectiles.some((p) => p.wid === 'meteor' && p.fx === 'aura'), 'warning circle on the ground');
    }
  }
  assert.ok(fired >= 0 && at.length > 0, 'meteor hit');
  assert.ok(at[0] - fired >= P.delay - 2 * DT, `hit ${at[0] - fired}s after the cast`);
});

test('spear: one spear hits only the first 1 + pierce enemies on the line', () => {
  const sim = setup('spear', 1);
  const P = WEAPONS.spear.levels[0];
  const line = [];
  for (let i = 0; i < 10; i++) {
    const e = dummy(sim, 'slime', 40 + i * 18, 0);
    e.speed = 0;
    e.resist = 1;
    line.push(e);
  }
  // ровно один бросок: после первого выстрела оружие больше не стреляет
  let fired = false;
  for (let i = 0; i < 2 / DT && !fired; i++) {
    sim.step(DT, idle);
    fired = sim.events.some((ev) => ev.type === 'weaponFire' && ev.weapon === 'spear');
  }
  assert.ok(fired);
  sim.player.weapons[0].cooldown = 1e9;
  runHits(sim, 1.5, 'spear');
  const hit = line.filter((e) => e.hp < e.maxHp).length;
  assert.equal(hit, P.pierce + 1, `hit ${hit}`);
});

test('poison cloud: ticks without knockback', () => {
  const sim = setup('poison_cloud', 1);
  const e = dummy(sim, 'catgirl', 20, 0);
  e.speed = 0;
  const at = runHits(sim, 2.5, 'poison_cloud');
  assert.ok(at.length >= 4, `ticks ${at.length}`);
  assert.equal(e.kx, 0);
  assert.equal(e.ky, 0);
});

test('meteor: a starfall volley never overlaps', () => {
  const AD = WEAPON_BEHAVIOR.area_drop;
  const sim = setup('starfall', 1);
  const P = WEAPONS.starfall.levels[0];
  for (let i = 0; i < 6; i++) dummy(sim, 'slime', 60 + (i % 2) * 4, (i - 3) * 3);
  let marks = [];
  for (let n = 0; n < 600 && marks.length < P.amount; n++) {
    sim.step(1 / 60, { dx: 0, dy: 0 });
    marks = sim.projectiles.filter((p) => p.wid === 'starfall' && p.fx === 'aura');
  }
  assert.ok(marks.length >= 2, 'a volley fell');
  for (let a = 0; a < marks.length; a++) {
    for (let b = a + 1; b < marks.length; b++) {
      const d = Math.hypot(marks[a].x - marks[b].x, marks[a].y - marks[b].y);
      assert.ok(d >= AD.meteorGap * P.area - 1e-6, `circles apart: ${d}`);
    }
  }
});
