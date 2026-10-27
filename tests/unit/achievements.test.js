import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import {
  ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES, ACHIEVEMENTS_VERSION,
} from '../../src/data/achievements.js';
import { BAG, STASH, CURRENCIES, ITEM_TYPES } from '../../src/data/items.js';
import { HEROES } from '../../src/data/heroes.js';
import { ENEMIES } from '../../src/data/enemies.js';
import {
  emptyAchievements, normalizeAchievements, evaluateRun, evaluateMeta, achievedIds, rewardsFor,
  bumpCounters, markSeen, unseenIds, evolvedIds, achievementProgress, achievementParams,
} from '../../src/core/achievements.js';
import {
  createRunSummaryTracker, emptyRunSummary, normalizeRunSummary,
} from '../../src/core/run-summary.js';
import { bagSize, createBag, place, makeUnique, rollItem, emptyWallet } from '../../src/core/items.js';
import { createRng } from '../../src/core/rng.js';
import { COOP } from '../../src/data/coop.js';
import { t, hasKey } from '../../src/i18n/index.js';

const run = (over = {}) => ({
  ...emptyRunSummary(), time: 600, hero: 'heroine', xpPickedBefore120: 50, ...over,
});
const unlockedBy = (r, state = emptyAchievements()) => evaluateRun(state, r).unlocked;
const metaBy = (ctx, state = emptyAchievements()) => evaluateMeta(state, ctx).unlocked;

// ---------- данные и строки ----------

test('achievements: data is complete and consistent', () => {
  const ids = Object.keys(ACHIEVEMENTS);
  assert.equal(ids.length, 24);
  for (const id of ids) {
    const a = ACHIEVEMENTS[id];
    assert.ok(ACHIEVEMENT_CATEGORIES.includes(a.category), id);
    const keys = Object.keys(a.reward);
    assert.equal(keys.length, 1, id);
    const k = keys[0];
    if (k === 'bag') assert.ok(['col', 'row'].includes(a.reward.bag), id);
    else assert.ok(CURRENCIES.includes(k) && a.reward[k] > 0, id);
    assert.ok(hasKey(`ach.${id}.name`), id);
    assert.ok(hasKey(`ach.${id}.desc`), id);
    const desc = t(`ach.${id}.desc`, achievementParams(id));
    assert.ok(!/\{[a-z]+\}/.test(desc), `${id}: ${desc}`);
  }
  for (const c of ACHIEVEMENT_CATEGORIES) assert.ok(hasKey(`ach.cat.${c}`), c);
  // открытия сумки совпадают с BAG.unlocks
  const bagIds = ids.filter((id) => ACHIEVEMENTS[id].reward.bag).sort();
  assert.deepEqual(bagIds, Object.keys(BAG.unlocks).sort());
  for (const id of bagIds) {
    const u = BAG.unlocks[id];
    assert.equal(ACHIEVEMENTS[id].reward.bag, u.rows ? 'row' : 'col', id);
  }
  // боссы из условий существуют
  assert.ok(evolvedIds().length > 0);
});

// ---------- забег ----------

test('achievements: boss kills', () => {
  const k = (n) => Array.from({ length: n }, (_, i) => ({ id: `b${i}`, hp: 0.5 }));
  assert.deepEqual(unlockedBy(run()), []);
  assert.deepEqual(unlockedBy(run({ bossesKilled: k(1) })), ['first_trophy']);
  assert.deepEqual(unlockedBy(run({ bossesKilled: k(3) })).sort(), ['first_trophy', 'three_crowns']);
  assert.ok(unlockedBy(run({ reaperKilled: true })).includes('reaper_slayer'));
  const coop = unlockedBy(run({ coop: true, bossesKilled: k(3) }));
  assert.ok(coop.includes('side_by_side'));
  assert.ok(!unlockedBy(run({ coop: true, bossesKilled: k(2) })).includes('side_by_side'));
});

test('achievements: removed last breath is dropped from old saves', () => {
  assert.equal(ACHIEVEMENTS.last_breath, undefined);
  assert.ok(!hasKey('ach.last_breath.name'));
  const old = { v: 1, done: { last_breath: 1700000000000, first_trophy: 5 },
    seen: { last_breath: 1, first_trophy: 1 } };
  let s;
  assert.doesNotThrow(() => { s = normalizeAchievements(old); });
  assert.deepEqual(s.done, { first_trophy: 5 });
  assert.deepEqual(s.seen, { first_trophy: 1 });
  assert.deepEqual(achievedIds(s), ['first_trophy']);
  assert.deepEqual(rewardsFor(['last_breath']), rewardsFor([]));
  // низкое HP при убийстве босса больше ничего не даёт сверх first_trophy
  assert.deepEqual(unlockedBy(run({ bossesKilled: [{ id: 'x', hp: 0.01 }] })), ['first_trophy']);
  assert.doesNotThrow(() => evaluateRun(old, run()));
});

test('achievements: both heroines over several runs', () => {
  let s = emptyAchievements();
  const heroes = Object.keys(HEROES);
  for (let i = 0; i < heroes.length; i++) {
    const res = evaluateRun(s, run({ won: true, hero: heroes[i], foodPicked: 1, rerolls: 1 }));
    s = res.state;
    assert.equal(res.unlocked.includes('both_heroines'), i === heroes.length - 1);
  }
  // смерть героем не считается
  const lost = evaluateRun(emptyAchievements(), run({ won: false, hero: heroes[0] })).state;
  assert.deepEqual(lost.heroesWon, {});
});

test('achievements: hunger, no safety, monogamy, ascetic, untouchable', () => {
  assert.ok(unlockedBy(run({ won: true, rerolls: 1 })).includes('hunger'));
  assert.ok(!unlockedBy(run({ won: true, foodPicked: 1 })).includes('hunger'));
  assert.ok(!unlockedBy(run({ won: false })).includes('hunger'));

  assert.ok(unlockedBy(run({ won: true, foodPicked: 1 })).includes('no_safety'));
  for (const k of ['rerolls', 'skips', 'banishes']) {
    assert.ok(!unlockedBy(run({ won: true, [k]: 1 })).includes('no_safety'), k);
  }

  assert.ok(unlockedBy(run({ weaponsAtDryadKill: 1, passivesAtDryadKill: 0 })).includes('monogamy'));
  assert.ok(!unlockedBy(run({ weaponsAtDryadKill: 2, passivesAtDryadKill: 0 })).includes('monogamy'));
  assert.ok(!unlockedBy(run({ weaponsAtDryadKill: 1, passivesAtDryadKill: 1 })).includes('monogamy'));
  assert.ok(!unlockedBy(run()).includes('monogamy')); // Дриада не убита (−1)

  const T = ACHIEVEMENTS.ascetic.seconds;
  assert.ok(unlockedBy(run({ time: T, xpPickedBefore120: 0 })).includes('ascetic'));
  assert.ok(!unlockedBy(run({ time: T - 1, xpPickedBefore120: 0 })).includes('ascetic'));
  assert.ok(!unlockedBy(run({ xpPickedBefore120: 1 })).includes('ascetic'));

  const U = ACHIEVEMENTS.untouchable.seconds;
  assert.ok(unlockedBy(run({ untouchableMax: U })).includes('untouchable'));
  assert.ok(!unlockedBy(run({ untouchableMax: U - 0.5 })).includes('untouchable'));
});

test('achievements: co-op medic and no one left behind', () => {
  // medic: один раз поднять напарника
  assert.equal(ACHIEVEMENTS.medic.target, 1);
  assert.equal(ACHIEVEMENTS.medic.nearSeconds, undefined);
  let s = emptyAchievements();
  s = evaluateRun(s, run({ coop: true, revives: 0 })).state;
  assert.equal(s.counters.medic, 0);
  assert.ok(!s.done.medic);
  assert.equal(achievementProgress(s, 'medic'), null, 'yes/no, no progress counter');
  const res = evaluateRun(s, run({ coop: true, revives: 1 }));
  assert.ok(res.unlocked.includes('medic'));
  // старое сохранение со счётчиком 3 из 5: уже хватает
  assert.ok(evaluateMeta({ v: 1, counters: { medic: 3 } }, {}).unlocked.includes('medic'));

  assert.ok(unlockedBy(run({ coop: true, won: true })).includes('no_one_left'));
  assert.ok(!unlockedBy(run({ coop: true, won: true, anyoneFell: true })).includes('no_one_left'));
  assert.ok(!unlockedBy(run({ coop: false, won: true })).includes('no_one_left'));
});

test('achievements: vacuum, meat grinder', () => {
  const v = ACHIEVEMENTS.vacuum.target;
  const m = ACHIEVEMENTS.meat_grinder.target;
  assert.ok(unlockedBy(run({ maxMagnetGems: v })).includes('vacuum'));
  assert.ok(!unlockedBy(run({ maxMagnetGems: v - 1 })).includes('vacuum'));
  assert.ok(unlockedBy(run({ maxKillsPerMinute: m })).includes('meat_grinder'));
  assert.ok(!unlockedBy(run({ maxKillsPerMinute: m - 1 })).includes('meat_grinder'));
});

test('achievements: evolutionist accumulates over runs and meta', () => {
  const all = evolvedIds();
  let s = emptyAchievements();
  s = evaluateRun(s, run({ evolutionsGot: all.slice(0, -1) })).state;
  assert.ok(!s.done.evolutionist);
  assert.deepEqual(achievementProgress(s, 'evolutionist'), { cur: all.length - 1, max: all.length });
  const res = evaluateMeta(s, { evolutions: [all[all.length - 1]] });
  assert.deepEqual(res.unlocked, ['evolutionist']);
  // не эволюции отбрасываются
  const junk = evaluateRun(emptyAchievements(), run({ evolutionsGot: ['blade_arc', 'nope', 7] }));
  assert.deepEqual(junk.state.evolutions, {});
});

// ---------- мета ----------

test('achievements: stash, bag and codex', () => {
  const rng = createRng(1);
  const items = (n) => Array.from({ length: n }, () => rollItem(rng, 1));
  assert.ok(metaBy({ stash: items(STASH.size) }).includes('hoarder'));
  assert.ok(!metaBy({ stash: items(STASH.size - 1) }).includes('hoarder'));

  // tetris: 1×1 в каждой открытой клетке
  let bag = createBag(2, 2);
  assert.ok(!metaBy({ bag }).includes('tetris')); // пустая сумка
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) bag = place(bag, rollItem(rng, 1, { type: 'ring' }), x, y);
  }
  assert.ok(metaBy({ bag }).includes('tetris'));

  // diversity: разные типы
  const types = Object.keys(ITEM_TYPES).filter((k) => ITEM_TYPES[k].weight > 0);
  let wide = createBag(BAG.w, BAG.h);
  let x = 0;
  let y = 0;
  for (const type of types) {
    const it = rollItem(rng, 1, { type, size: ITEM_TYPES[type].shapes[0].size });
    const next = place(wide, it, x, y);
    if (next) wide = next;
    x += it.shape[0];
    if (x >= BAG.w - 1) { x = 0; y += 3; }
  }
  const need = ACHIEVEMENTS.diversity.target;
  const got = new Set(wide.items.map((e) => e.item.type)).size;
  assert.equal(metaBy({ bag: wide }).includes('diversity'), got >= need);
  assert.ok(metaBy({ bag: { ...wide, items: wide.items.slice(0, need - 1) } }).every((id) => id !== 'diversity'));

  // collector: разные уникалки в стеше и сумке
  const u = ['glass_cannon', 'greed', 'turtle', 'berserk'].map((id, i) => makeUnique(id, 2, `u${i}`));
  assert.ok(!metaBy({ stash: u }).includes('collector'));
  const ubag = place(createBag(), makeUnique('dice', 2, 'u9'), 0, 0);
  assert.ok(metaBy({ stash: u, bag: ubag }).includes('collector'));
  assert.ok(!metaBy({ stash: [...u, makeUnique('greed', 2, 'u8')] }).includes('collector'));

  // naturalist: все враги увидены в кодексе
  const seen = {};
  for (const id of Object.keys(ENEMIES)) seen[id] = 1;
  assert.ok(metaBy({ codex: { seen: { enemy: seen } } }).includes('naturalist'));
  delete seen[Object.keys(ENEMIES)[0]];
  assert.ok(!metaBy({ codex: { seen: { enemy: seen } } }).includes('naturalist'));
});

test('achievements: craft counters', () => {
  let s = emptyAchievements();
  s = bumpCounters(s, { disassembled: ACHIEVEMENTS.recycler.target - 1 });
  assert.ok(!evaluateMeta(s, {}).unlocked.includes('recycler'));
  s = bumpCounters(s, { disassembled: 1 });
  assert.ok(evaluateMeta(s, {}).unlocked.includes('recycler'));

  s = bumpCounters(emptyAchievements(), { rerolls: ACHIEVEMENTS.chaos_alchemist.target });
  assert.ok(evaluateMeta(s, {}).unlocked.includes('chaos_alchemist'));

  s = bumpCounters(emptyAchievements(), { broke: 1 });
  assert.ok(evaluateMeta(s, {}).unlocked.includes('broke_it'));

  // smith: заточка максимум, не сумма; или по предмету в стеше
  s = bumpCounters(emptyAchievements(), { enchantMax: 5 });
  s = bumpCounters(s, { enchantMax: 4 });
  assert.equal(s.counters.enchantMax, 5);
  assert.ok(!evaluateMeta(s, {}).unlocked.includes('smith'));
  const it = { ...rollItem(createRng(2), 1), enchant: ACHIEVEMENTS.smith.target };
  const res = evaluateMeta(emptyAchievements(), { stash: [it] });
  assert.ok(res.unlocked.includes('smith'));
  assert.equal(res.state.counters.enchantMax, ACHIEVEMENTS.smith.target);

  // абсолютные счётчики со стороны: повтор не удваивает
  const a = evaluateMeta(emptyAchievements(), { counters: { disassembled: 60 } }).state;
  const b = evaluateMeta(a, { counters: { disassembled: 60 } }).state;
  assert.equal(b.counters.disassembled, 60);
});

// ---------- награды, повтор, сохранения ----------

test('achievements: rewards once, idempotent, input not mutated', () => {
  const s0 = emptyAchievements();
  const frozen = JSON.stringify(s0);
  const r = run({ won: true, bossesKilled: [1, 2, 3].map((i) => ({ id: `b${i}`, hp: 0.5 })) });
  const a = evaluateRun(s0, r, 1234);
  assert.equal(JSON.stringify(s0), frozen);
  assert.ok(a.unlocked.includes('three_crowns'));
  assert.equal(a.state.done.three_crowns, 1234);
  assert.equal(a.rewards.bag.cols, 1);
  const exp = emptyWallet();
  for (const id of a.unlocked) {
    for (const c of CURRENCIES) exp[c] += ACHIEVEMENTS[id].reward[c] || 0;
  }
  assert.deepEqual(a.rewards.wallet, exp);
  const b = evaluateRun(a.state, r, 9999);
  assert.deepEqual(b.unlocked, []);
  assert.deepEqual(b.rewards, rewardsFor([]));
  assert.equal(b.state.done.three_crowns, 1234);
  // bagSize из items.js видит открытия
  assert.equal(bagSize(achievedIds(a.state)).cols, BAG.startCols + 1);
  const all = rewardsFor(Object.keys(ACHIEVEMENTS));
  assert.deepEqual(all.bag, { cols: 2, rows: 2 });
  // повтор мета-проверки
  const m1 = evaluateMeta(emptyAchievements(), { stash: [], bag: createBag() });
  const m2 = evaluateMeta(m1.state, { stash: [], bag: createBag() });
  assert.deepEqual(m2.unlocked, []);
});

test('achievements: seen markers', () => {
  const s = evaluateRun(emptyAchievements(), run({ bossesKilled: [{ id: 'x', hp: 1 }] })).state;
  assert.deepEqual(unseenIds(s), ['first_trophy']);
  const m = markSeen(s);
  assert.deepEqual(unseenIds(m), []);
  assert.deepEqual(unseenIds(s), ['first_trophy']); // вход не тронут
});

test('achievements: normalize junk', () => {
  for (const junk of [null, undefined, 5, 'x', [], {}]) {
    assert.deepEqual(normalizeAchievements(junk), emptyAchievements());
  }
  assert.equal(normalizeAchievements({ v: ACHIEVEMENTS_VERSION + 1 }), null);
  const s = normalizeAchievements({
    v: 1,
    done: { first_trophy: 1700000000000, medic: true, nope: 1, hunger: 0, ascetic: -5, smith: 'x' },
    counters: { medic: 3.7, disassembled: -2, rerolls: NaN, broke: '9', evil: 100, enchantMax: 1e9 },
    heroesWon: { heroine: 1, ghost: 1 },
    evolutions: { crimson_arc: 1, blade_arc: 1 },
    seen: { first_trophy: 1, hunger: 1, nope: 1 },
  });
  assert.deepEqual(s.done, { first_trophy: 1700000000000, medic: 1, ascetic: 1, smith: 1 });
  assert.equal(s.counters.medic, 3);
  assert.equal(s.counters.disassembled, 0);
  assert.equal(s.counters.rerolls, 0);
  assert.equal(s.counters.broke, 0);
  assert.equal(s.counters.evil, undefined);
  assert.deepEqual(s.heroesWon, { heroine: 1 });
  assert.deepEqual(s.evolutions, { crimson_arc: 1 });
  assert.deepEqual(s.seen, { first_trophy: 1 });
  // битое состояние на входе evaluate не роняет
  assert.doesNotThrow(() => evaluateRun('junk', 'junk'));
  assert.doesNotThrow(() => evaluateMeta(null, null));
  const n = normalizeRunSummary({ won: 'yes', bossesKilled: [null, { id: 'a', hp: 9 }, 3], rerolls: -1 });
  assert.equal(n.won, false);
  assert.deepEqual(n.bossesKilled, [{ id: 'a', hp: 1 }]);
  assert.equal(n.rerolls, 0);
  assert.equal(n.weaponsAtDryadKill, -1);
});

// ---------- трекер ----------

// Минимальный sim для трекера: только то, что он читает.
function fakeSim(over = {}) {
  const pl = (id, x = 0) => ({
    id, x, y: 0, hp: 100, maxHp: 100, dead: false, hero: 'heroine',
    weapons: [{ id: 'blade_arc', level: 1 }], passives: [],
    levelUp: { rerolls: 2, skips: 2, banishes: 2 },
  });
  return {
    time: 0, state: 'running', stage: 'forest', difficulty: 'normal', deadN: 0,
    enemies: [], pickups: [], players: [pl(0), pl(1, 10)], ...over,
  };
}

test('run summary: tracker collects the fields from events and frames', () => {
  const sim = fakeSim();
  const tr = createRunSummaryTracker({ local: 0, coop: true });
  tr.observe(sim);
  // толпа без урона
  sim.enemies = Array.from({ length: ACHIEVEMENTS.untouchable.enemies }, () => ({ dead: false }));
  for (let i = 1; i <= 10; i++) { sim.time = i; tr.observe(sim); }
  tr.onEvents([{ type: 'playerHurt', player: 0, amount: 5 }], sim);
  sim.time = 13; tr.observe(sim);
  tr.onEvents([{ type: 'playerHurt', player: 1, amount: 5 }], sim); // чужой удар серию не рвёт
  sim.time = 14; tr.observe(sim);
  // опыт до порога, еда, магнит
  sim.pickups = Array.from({ length: 7 }, () => ({ kind: 'xp', gone: false }));
  tr.onEvents([
    { type: 'pickup', kind: 'xp', player: 0 }, { type: 'pickup', kind: 'xp', player: 1 },
    { type: 'pickup', kind: 'heal', player: 0 }, { type: 'pickup', kind: 'magnet', player: 0 },
  ], sim);
  // reroll и banish
  sim.players[0].levelUp = { rerolls: 1, skips: 2, banishes: 0 };
  sim.time = 15; tr.observe(sim);
  // напарник падает, свой герой стоит рядом, потом встаёт
  tr.onEvents([{ type: 'playerDown', player: 1, x: 10, y: 0 }], sim);
  sim.players[1].dead = true;
  sim.time = 16; tr.observe(sim);
  sim.players[1].dead = false;
  sim.players[0].x = COOP.allyRadius * 5; // ушёл, но помогал
  tr.onEvents([{ type: 'revive', player: 1, x: 10, y: 0 }], sim);
  // боссы: Дриада при одном оружии, второй — на низком HP
  sim.players[0].hp = 3;
  tr.onEvents([
    { type: 'kill', enemy: 'dryad_queen', boss: true, by: 1 },
    { type: 'kill', enemy: 'bat', boss: false, by: 0 },
    { type: 'kill', enemy: 'bat', boss: false, by: 1 },
  ], sim);
  sim.players[0].weapons.push({ id: 'crimson_arc', level: 1 });
  sim.time = 20;
  const s = tr.finish(sim, { status: 'victory' });
  assert.equal(s.won, true);
  assert.equal(s.coop, true);
  assert.equal(s.hero, 'heroine');
  assert.equal(s.time, 20);
  assert.equal(s.untouchableMax, 10);
  assert.equal(s.xpPickedBefore120, 1);
  assert.equal(s.foodPicked, 1);
  assert.equal(s.maxMagnetGems, 7);
  assert.equal(s.rerolls, 1);
  assert.equal(s.skips, 0);
  assert.equal(s.banishes, 2);
  assert.equal(s.anyoneFell, true);
  assert.equal(s.revives, 1);
  assert.deepEqual(s.bossesKilled, [{ id: 'dryad_queen', hp: 0.03 }]);
  assert.equal(s.weaponsAtDryadKill, 1);
  assert.equal(s.passivesAtDryadKill, 0);
  assert.equal(s.maxKillsPerMinute, 1);
  assert.deepEqual(s.evolutionsGot, ['crimson_arc']);
  assert.equal(tr.finish(sim, { status: 'victory' }), null);
  const res = evaluateRun(emptyAchievements(), s);
  assert.ok(res.unlocked.includes('monogamy'));
  assert.ok(!res.unlocked.includes('hunger'));
});

test('run summary: kills per minute is a sliding window', () => {
  const sim = fakeSim();
  const tr = createRunSummaryTracker();
  const kill = { type: 'kill', enemy: 'bat', boss: false, by: 0 };
  const W = ACHIEVEMENTS.meat_grinder.seconds;
  for (let sec = 0; sec < W * 3; sec++) {
    sim.time = sec + 0.5;
    tr.onEvents(sec < W * 2 ? [kill, kill] : [kill, kill, kill, kill, kill], sim);
  }
  const s = tr.finish(sim);
  assert.equal(s.maxKillsPerMinute, W * 5);
});

test('run summary: real solo and co-op sims run through the tracker', () => {
  for (const players of [1, 2]) {
    const sim = createSim({ seed: 11, stage: 'forest', players });
    const tr = createRunSummaryTracker({ local: 0, coop: players > 1 });
    const DT = 1 / 60;
    for (let i = 0; i < 60 / DT && sim.state !== 'gameover' && sim.state !== 'victory'; i++) {
      const input = players > 1 ?
        { players: [{ x: 0.6, y: 0.3 }, { x: -0.6, y: 0.3 }] } : { x: 0.6, y: 0.3 };
      sim.step(DT, input);
      tr.onEvents(sim.events, sim);
      tr.observe(sim);
      if (sim.state === 'levelup') sim.chooseCard(0, sim.picker);
      else if (sim.state === 'chest') sim.chooseChest(0);
      else if (sim.state === 'reveal') sim.endReveal();
    }
    const s = tr.finish(sim, { status: 'quit' });
    assert.equal(s.coop, players > 1);
    assert.ok(s.time > 0);
    assert.ok(s.maxKillsPerMinute > 0, 'kills seen');
    assert.ok(s.xpPickedBefore120 > 0, 'xp seen');
    assert.deepEqual(normalizeRunSummary(s), s);
    assert.doesNotThrow(() => evaluateRun(emptyAchievements(), s));
  }
});
