import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import { applyCard, chestItems, evolutionCard, findEvolution } from '../../src/core/upgrades.js';
import { createRng } from '../../src/core/rng.js';
import { WEAPONS } from '../../src/data/weapons.js';
import { COMBOS } from '../../src/data/combos.js';
import { BOSSES } from '../../src/data/bosses.js';
import { forest } from '../../src/data/stages/forest.js';

const DT = 1 / 60;
const idle = { x: 0, y: 0 };
const tick = (sim) => { if (sim.state === 'levelup') { sim.levelUp.skips = 1e9; sim.skip(); } sim.step(DT, idle); };
const run = (sim, s) => { for (let i = 0; i < s / DT; i++) tick(sim); };
const god = (sim) => { sim.player.stats.maxHp = 1e9; sim.player.maxHp = 1e9; sim.player.hp = 1e9; };
const maxed = (id) => ({ id, level: WEAPONS[id].maxLevel });
// Вторая часть эволюции — оружие на максимуме или пассивка (тогда она в passives и остаётся после слияния).
const isWeapon = (id) => !!WEAPONS[id];
const build = (weapons, passives, id) => {
  if (isWeapon(id)) weapons.push(maxed(id));
  else passives.push({ id, level: 1 });
};

test('combo: evolution takes the slot of the first part, second part is removed', () => {
  for (const combo of COMBOS) {
    const [a, b] = combo.from;
    // заполнители — оружие, которое не входит в эту пару и не на максимуме
    const fill = ['war_axe', 'firebomb', 'storm_chain', 'holy_ground'].filter((id) => id !== a && id !== b).slice(0, 2);
    const p = {
      weapons: [{ id: fill[0], level: 1 }, maxed(a), { id: fill[1], level: 2 }],
      passives: [],
    };
    build(p.weapons, p.passives, b);
    const card = chestItems(p, createRng(1))[0];
    assert.equal(card.id, combo.result);
    applyCard(p, card);
    assert.deepEqual(p.weapons.map((w) => w.id), [fill[0], combo.result, fill[1]]);
    if (!isWeapon(b)) assert.deepEqual(p.passives.map((x) => x.id), [b]);
    if (!isWeapon(b)) continue;
    // части в обратном порядке: результат всё равно на месте первой из from
    const q = { weapons: [maxed(b), { id: fill[0], level: 1 }, maxed(a)], passives: [] };
    applyCard(q, evolutionCard(combo));
    assert.deepEqual(q.weapons.map((w) => w.id), [fill[0], combo.result]);
  }
});

test('combo: chest without evolution gives upgrade, passive upgrade or heal', () => {
  const p = { weapons: [maxed('blade_arc')], passives: [{ id: 'armor', level: 1 }] };
  const it = chestItems(p, createRng(2))[0];
  assert.equal(it.kind, 'passive');
  assert.equal(it.level, 2);
  assert.equal(findEvolution(p), null);
  const q = { weapons: [maxed('blade_arc')], passives: [] };
  assert.equal(chestItems(q, createRng(2))[0].kind, 'heal');
  const r = { weapons: [maxed('blade_arc'), { id: 'guardian_shields', level: 3 }], passives: [] };
  const ri = chestItems(r, createRng(2))[0];
  assert.deepEqual([ri.kind, ri.id, ri.level], ['weapon', 'guardian_shields', 4]);
});

for (const combo of COMBOS) {
  test(`combo: ${combo.result} works in sim (damage is dealt and recorded)`, () => {
    const sim = createSim({ seed: 31 });
    god(sim);
    sim.player.weapons.length = 0;
    sim.player.weapons.push(maxed(combo.from[0]));
    build(sim.player.weapons, sim.player.passives, combo.from[1]);
    sim._syncBuild();
    sim.dropPickup('chest', sim.player.x, sim.player.y);
    sim.step(DT, idle);
    assert.equal(sim.state, 'chest', 'chest waits for the choice');
    sim.chooseChest(0);
    const ev = sim.events.find((e) => e.type === 'chest' && e.applied);
    assert.ok(ev, 'chest event');
    const it = ev.items[0];
    assert.equal(it.id, combo.result);
    assert.equal(it.evolved, true);
    assert.deepEqual(it.from, combo.from);
    assert.deepEqual(sim.player.weapons.map((w) => w.id), [combo.result]);
    for (let i = 0; i < 14; i++) sim.spawnEnemy('slime', 80 * Math.cos(i * 0.45), 80 * Math.sin(i * 0.45));
    run(sim, 6);
    assert.ok((sim.damageByWeapon[combo.result] || 0) > 0, 'damageByWeapon');
  });
}

test('chest: every item has kind, id, level, isNew; evolution has both parts in from', () => {
  const sim = createSim({ seed: 32 });
  sim.dropPickup('chest', sim.player.x, sim.player.y);
  sim.step(DT, idle);
  for (const it of sim.events.find((e) => e.type === 'chest').items) {
    for (const k of ['kind', 'id', 'level', 'isNew', 'icon']) assert.ok(k in it, k);
  }
  for (const combo of COMBOS) {
    const it = evolutionCard(combo);
    assert.deepEqual(it.from, combo.from);
    assert.equal(it.isNew, true);
  }
});

test('chest: elite always drops a chest, boss drops one too', () => {
  for (const type of ['harpy', 'slime', 'catgirl', 'ghost', 'foxgirl', 'succubus']) {
    for (let seed = 1; seed <= 3; seed++) {
      const sim = createSim({ seed });
      const e = sim.spawnEnemy(type, 500, 500, true);
      assert.ok(e.elite);
      sim.damageEnemy(e, 1e9, 'blade_arc', 0, 0, 0);
      assert.equal(sim.pickups.filter((p) => p.kind === 'chest').length, 1, type);
    }
  }
  const sim = createSim({ seed: 4 });
  const boss = sim.spawnBoss('dryad_queen');
  sim.damageEnemy(boss, 1e9, 'blade_arc', 0, 0, 0);
  assert.equal(sim.pickups.filter((p) => p.kind === 'chest').length, 1);
});

test('props: break from weapons, push propBreak, drop by table', () => {
  const sim = createSim({ seed: 33 });
  const prop = sim.props[0];
  sim.player.x = prop.x - 15; sim.player.y = prop.y;
  god(sim);
  let ev = null;
  for (let i = 0; i < 1200 && !ev; i++) {
    sim.step(DT, idle);
    ev = sim.events.find((e) => e.type === 'propBreak');
  }
  assert.ok(ev, 'propBreak event');
  assert.deepEqual(Object.keys(ev).sort(), ['sprite', 'type', 'x', 'y']);
  assert.ok(['barrel', 'lantern'].includes(ev.sprite));
  const s2 = createSim({ seed: 34 });
  const o = s2.props[0];
  o.drop = { coin: 1 };
  const before = s2.pickups.length;
  s2._damageProp(o);
  assert.ok(o.dead);
  assert.equal(s2.pickups.length, before + 1);
  assert.equal(s2.pickups[s2.pickups.length - 1].type, 'coin');
  const o2 = s2.props.find((p) => !p.dead);
  o2.drop = {};
  const n = s2.pickups.length;
  s2._damageProp(o2);
  assert.equal(s2.pickups.length, n);
});

test('boss: bossWarning comes once, 10 s before the first boss', () => {
  assert.equal(forest.bossWarning, 10);
  const at = forest.timeline.find((e) => e.type === 'boss').at;
  const sim = createSim({ seed: 35 });
  god(sim);
  sim.time = at - forest.bossWarning - 3;
  const warns = [];
  const spawnAt = [];
  for (let i = 0; i < 16 * 60; i++) {
    tick(sim);
    for (const e of sim.events) {
      if (e.type === 'bossWarning') warns.push([sim.time, e]);
      if (e.type === 'bossSpawn') spawnAt.push(sim.time);
    }
  }
  assert.equal(warns.length, 1);
  assert.ok(Math.abs(warns[0][0] - (at - forest.bossWarning)) < 0.1, `warning at ${warns[0][0]}`);
  assert.equal(warns[0][1].boss, forest.timeline.find((e) => e.type === 'boss').boss);
  assert.equal(spawnAt.length, 1);
  assert.ok(spawnAt[0] - warns[0][0] > 9.8);
});

test('boss: hp/maxHp readable, pose, rage at 50% hp, win on death', () => {
  const sim = createSim({ seed: 36 });
  god(sim);
  const boss = sim.spawnBoss('dryad_queen');
  assert.equal(sim.boss, boss);
  assert.equal(boss.hp, boss.maxHp);
  assert.ok(boss.maxHp > 0);
  assert.equal(boss.pose, 'idle');
  const def = BOSSES.dryad_queen;
  assert.ok(def.rage.hpFraction === 0.5 && def.rage.cooldownMul < 1);
  assert.equal(boss.rage, false);
  const poses = new Set();
  for (let i = 0; i < 20 * 60; i++) { tick(sim); poses.add(boss.pose); }
  assert.ok(poses.has('windup') && poses.has('cast'), [...poses].join());
  boss.hp = boss.maxHp * 0.49;
  sim.step(DT, idle);
  assert.equal(boss.rage, true);
  assert.ok(sim.events.some((e) => e.type === 'bossRage'));
  sim.damageEnemy(boss, 1e9, 'blade_arc', 0, 0, 0);
  assert.ok(sim.won);
});

test('boss: rage shortens the attack interval', () => {
  const sim = createSim({ seed: 37 });
  god(sim);
  const boss = sim.spawnBoss('dryad_queen');
  boss.hp = boss.maxHp * 0.4;
  sim.step(DT, idle);
  const dash = BOSSES.dryad_queen.attacks[0];
  boss.cd[0] = 0;
  sim.step(DT, idle);
  assert.ok(Math.abs(boss.cd[0] - dash.cooldown * BOSSES.dryad_queen.rage.cooldownMul) < 0.1);
});

test('orbit: each shield rehits a target on its own timer', () => {
  const sim = createSim({ seed: 51 });
  god(sim);
  sim.player.weapons.length = 0;
  sim.player.weapons.push({ id: 'guardian_shields', level: 7 }); // 4 щита, 4 рад/с: проход каждые 0.39 с
  sim._syncBuild();
  const w = sim.player.weapons[0];
  const P = w.params;
  // враг стоит на кольце щитов: каждый шаг возвращаем его на место
  const e = sim.spawnEnemy('slime', sim.player.x + P.area, sim.player.y);
  e.speed = 0; e.resist = 1; e.hp = e.maxHp = 1e9;
  let hits = 0;
  for (let i = 0; i < 4.5 * 60; i++) {
    e.x = sim.player.x + P.area; e.y = sim.player.y;
    sim.step(DT, idle);
    // только удары по этой цели: гарпии директора тоже добегают до кольца
    for (const ev of sim.events) {
      if (ev.type === 'hit' && ev.weapon === 'guardian_shields' && Math.abs(ev.x - e.x) < 1 && Math.abs(ev.y - e.y) < 1) hits++;
    }
  }
  // за 4 с вращения щиты проходят цель ~10 раз; общий на оружие таймер 0.5 с пропускал бы каждый второй проход
  assert.ok(hits >= 9 && hits <= 12, `hits ${hits}`);
});
