import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import { applyCard, skillChest, evolutionCard, findEvolution } from '../../src/core/upgrades.js';
import { createRng } from '../../src/core/rng.js';
import { WEAPONS } from '../../src/data/weapons.js';
import { PASSIVES } from '../../src/data/passives.js';
import { COMBAT } from '../../src/data/constants.js';
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
    const card = evolutionCard(findEvolution(p));
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

test('combo: skill chest without evolution gives passive and weapon upgrades, or heal', () => {
  const p = { weapons: [maxed('blade_arc')], passives: [{ id: 'resistance', level: 1 }] };
  const it = skillChest(p, createRng(2));
  assert.deepEqual(it.map((c) => [c.kind, c.level, c.prev]), [['passive', 2, 1]]);
  assert.equal(findEvolution(p), null);
  const q = { weapons: [maxed('blade_arc')], passives: [] };
  assert.deepEqual(skillChest(q, createRng(2)).map((c) => c.kind), ['heal']);
  const r = { weapons: [maxed('blade_arc'), { id: 'guardian_shields', level: 3 }], passives: [] };
  const ri = skillChest(r, createRng(2));
  assert.deepEqual(ri.map((c) => [c.kind, c.id, c.level, c.prev]), [['weapon', 'guardian_shields', 4, 3]]);
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
    assert.equal(sim.state, 'chest', 'chest shows what fell out');
    const ev = sim.events.find((e) => e.type === 'chest');
    assert.ok(ev, 'chest event');
    const it = ev.rolls[0].cards.find((c) => c.kind === 'weapon');
    sim.chooseChest();
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
  for (const it of sim.events.find((e) => e.type === 'chest').rolls[0].cards) {
    for (const k of ['kind', 'id', 'level', 'isNew', 'icon']) assert.ok(k in it, k);
  }
  for (const combo of COMBOS) {
    const it = evolutionCard(combo);
    assert.deepEqual(it.from, combo.from);
    assert.equal(it.isNew, true);
  }
});

test('chest: elite always drops a skill chest, boss drops none (item loot instead)', () => {
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
  assert.equal(sim.pickups.filter((p) => p.kind === 'chest').length, 0);
  assert.ok(sim.player.loot.length >= 1, 'boss gives item loot');
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
  // Стартовое оружие могло набить уровень: дальше проверяем в обычном ходе, а не на экране выбора.
  while (sim.state !== 'running') tick(sim);
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
  sim.player.weapons.push(maxed('guardian_shields')); // 6 щитов, 4.4 рад/с: проход каждые 0.24 с
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
  // за 4.3 с вращения щиты проходят цель ~18 раз; общий на оружие таймер 0.5 с пропускал бы два прохода из трёх
  assert.ok(hits >= 15 && hits <= 21, `hits ${hits}`);
});

// ---- ребаланс забега (docs/META.md 1): статы attack/magic, area, duration, xpGain, dodge, thorns, очередь карточек ----

test('stats: weapon damage uses the owner stat of its dmgType, area and duration scale level fields', () => {
  const sim = createSim({ seed: 81 });
  const pl = sim.player;
  pl.weapons = [{ id: 'blade_arc', level: 1 }, { id: 'firebomb', level: 1 }];
  pl.passives = [{ id: 'attack', level: 5 }, { id: 'area', level: 5 }, { id: 'duration', level: 5 }];
  sim._syncBuild();
  const [blade, bomb] = pl.weapons;
  const st = pl.stats;
  const b1 = WEAPONS.blade_arc.levels[0];
  const f1 = WEAPONS.firebomb.levels[0];
  assert.ok(Math.abs(blade.params.damage - b1.damage * st.attack) < 1e-9, 'attack weapon × attack');
  assert.ok(Math.abs(bomb.params.damage - f1.damage * st.magic) < 1e-9, 'magic weapon × magic');
  assert.ok(Math.abs(blade.params.area - b1.area * st.area) < 1e-9);
  assert.ok(Math.abs(bomb.params.duration - f1.duration * st.duration) < 1e-9);
  assert.equal(blade.params.duration, undefined, 'no duration field: nothing is added');
});

test('xpGain multiplies collected experience of the picker', () => {
  const sim = createSim({ seed: 82 });
  const pl = sim.player;
  pl.stats.xpGain = 1.5;
  const before = pl.xp;
  const pk = sim.dropPickup('xp_small', pl.x + 500, pl.y, 10);
  sim._collect(pk, pl);
  assert.ok(Math.abs(pl.xp - before - 15) < 1e-9);
});

test('dodge avoids contact and shots (event dodge), not telegraphed slams', () => {
  const sim = createSim({ seed: 83 });
  const pl = sim.player;
  const hp = pl.hp;
  pl.stats.dodge = 1;
  sim.hurtPlayer(10, pl, 'slime');
  assert.equal(pl.hp, hp);
  assert.ok(sim.events.some((e) => e.type === 'dodge' && e.player === 0));
  pl.iframes = 0;
  sim.hurtPlayer(10, pl, 'dryad_queen', false);
  assert.ok(pl.hp < hp, 'slam is not dodgeable');
  // без стата rng не тянется: ход сима как раньше
  const a = createSim({ seed: 84 });
  const state = a.rng.state;
  a.hurtPlayer(5);
  assert.equal(a.rng.state, state);
});

test('thorns hit every non-boss enemy on screen for a share of its max HP, with an internal cooldown', () => {
  const sim = createSim({ seed: 85 });
  sim.director = { update() {} };
  const pl = sim.player;
  god(sim);
  pl.stats.thorns = 0.1;
  pl.stats.attack = 1.5; // атака на шипы не влияет
  pl.stats.crit = 1;     // и крита у шипов нет
  const near = sim.spawnEnemy('slime', pl.x + 100, pl.y);
  const big = sim.spawnEnemy('lamia', pl.x - 100, pl.y);
  const far = sim.spawnEnemy('slime', pl.x + 2000, pl.y);
  const boss = sim.spawnBoss('kitsune_empress');
  boss.x = pl.x + 50; boss.y = pl.y;
  for (const e of [near, far]) e.hp = e.maxHp = 1e6;
  big.hp = big.maxHp = 5e6;
  const bossHp = boss.hp;
  sim.hurtPlayer(5, pl, 'slime');
  assert.equal(near.hp, 1e6 - 1e5);
  assert.equal(big.hp, 5e6 - 5e5, 'scales with max HP');
  assert.equal(far.hp, 1e6, 'off screen');
  assert.equal(boss.hp, bossHp, 'bosses are immune');
  assert.ok(sim.damageByWeapon.thorns > 0);
  pl.iframes = 0;
  sim.hurtPlayer(5, pl, 'slime');
  assert.equal(near.hp, 1e6 - 1e5, 'cooldown');
  sim.time += COMBAT.thornsCooldown;
  pl.iframes = 0;
  sim.hurtPlayer(5, pl, 'slime');
  assert.equal(near.hp, 1e6 - 2e5);
});

const levelUp = (sim) => {
  if (sim.state === 'resume') sim.state = 'running'; // пауза после выбора не нужна тесту
  sim.player.xp = sim.player.xpNext;
  sim._checkLevel();
};

test('level-up cards alternate: weapons, passives, weapons; reroll and banish keep the kind', () => {
  const sim = createSim({ seed: 86 });
  const kinds = [];
  for (let i = 0; i < 4; i++) {
    levelUp(sim);
    assert.equal(sim.state, 'levelup');
    const cards = sim.levelUp.cards;
    assert.ok(cards.every((c) => c.kind === cards[0].kind), 'one kind per set');
    kinds.push(cards[0].kind);
    if (i === 1) {
      sim.reroll();
      assert.ok(sim.levelUp.cards.every((c) => c.kind === 'passive'), 'reroll keeps passives');
      sim.banish(0);
      assert.ok(sim.levelUp.cards.every((c) => c.kind === 'passive'), 'banish replacement keeps passives');
    }
    sim.chooseCard(0);
  }
  assert.deepEqual(kinds, ['weapon', 'passive', 'weapon', 'passive']);
});

test('co-op: shared turn order gives A-weapon, B-weapon, A-passive, B-passive', () => {
  const sim = createSim({ seed: 87, players: 2 });
  const seen = [];
  for (let i = 0; i < 4; i++) {
    levelUp(sim);
    const who = sim.picker;
    seen.push(`${who}:${sim.players[who].levelUp.cards[0].kind}`);
    sim.chooseCard(0, who);
  }
  assert.deepEqual(seen, ['0:weapon', '1:weapon', '0:passive', '1:passive']);
});

test('gated passives are not offered before the team level', () => {
  const sim = createSim({ seed: 88 });
  sim.player.levelUp.picks = 1; // очередь пассивок
  for (let i = 0; i < 20; i++) {
    levelUp(sim);
    for (const c of sim.levelUp.cards) {
      const min = PASSIVES[c.id] && PASSIVES[c.id].minLevel;
      if (min) assert.ok(sim.player.level >= min, `${c.id} offered at level ${sim.player.level}`);
    }
    sim.skip();
    sim.levelUp.skips = 1e9;
    sim.levelUp.picks = 1;
  }
});
