// Постоянные бонусы ачивок: данные, сложение со статами (соло и кооп), разбивка statReport по источникам,
// проверка посреди забега (evaluateLive) и честный счёт medic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../../src/core/sim.js';
import { hashSim } from '../../src/core/lockstep.js';
import { createRng } from '../../src/core/rng.js';
import { createBag, place, rollItem } from '../../src/core/items.js';
import { statReport, computeStats } from '../../src/core/stats.js';
import {
  loadoutStats, loadoutReport, normalizeLoadout, loadoutBonus,
} from '../../src/core/loadout.js';
import {
  achievementBonus, normalizeAchievementIds, evaluateLive, evaluateRun, emptyAchievements,
} from '../../src/core/achievements.js';
import { createRunSummaryTracker, emptyRunSummary } from '../../src/core/run-summary.js';
import { ACHIEVEMENTS } from '../../src/data/achievements.js';
import { STATS, STAT_CAPS } from '../../src/data/stats.js';
import { PASSIVES } from '../../src/data/passives.js';
import { HEROES } from '../../src/data/heroes.js';
import { COOP } from '../../src/data/coop.js';
import { hasKey } from '../../src/i18n/index.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const ALL = Object.keys(ACHIEVEMENTS);
const base = HEROES.heroine.stats;

test('achievement bonus: every achievement has a small permanent stat bonus, no amount', () => {
  for (const id of ALL) {
    const b = ACHIEVEMENTS[id].bonus;
    assert.ok(b && Object.keys(b).length > 0, `${id} has a bonus`);
    for (const k of Object.keys(b)) {
      assert.ok(STATS[k], `${id}: known stat ${k}`);
      assert.notEqual(k, 'amount');
      assert.ok(typeof b[k] === 'number' && b[k] > 0, `${id}.${k} positive`);
    }
  }
  assert.ok(hasKey('ach.bonus.part'));
  // все вместе — не больше трёх пассивок 2-го уровня (по доле от первого уровня пассивки на свой стат)
  const sum = achievementBonus(ALL);
  const firstLevel = {};
  for (const p of Object.values(PASSIVES)) firstLevel[p.stat] = p.levels[0];
  let levels = 0;
  for (const part of [sum.inc, sum.flat]) {
    for (const k of Object.keys(part)) levels += part[k] / firstLevel[k];
  }
  // attack и magic у героя работает один, считаем только больший
  levels -= Math.min(sum.inc.attack || 0, sum.inc.magic || 0) / firstLevel.attack;
  assert.ok(levels <= 9, `achievement bonuses ≈ ${levels.toFixed(1)} passive levels`);
});

test('achievement bonus: percent stats go to increased, flat stats add; unknown ids dropped', () => {
  const b = achievementBonus(['first_trophy', 'untouchable', 'nope', 'first_trophy']);
  near(b.inc.attack, ACHIEVEMENTS.first_trophy.bonus.attack);
  near(b.inc.magic, ACHIEVEMENTS.first_trophy.bonus.magic);
  near(b.flat.dodge, ACHIEVEMENTS.untouchable.bonus.dodge);
  assert.equal(b.inc.dodge, undefined);
  assert.deepEqual(achievementBonus(null), { inc: {}, flat: {} });
  // порядок и дубли: порядок ACHIEVEMENTS, без мусора
  assert.deepEqual(normalizeAchievementIds(['vacuum', 'first_trophy', 'x', 3, 'vacuum']),
      ['first_trophy', 'vacuum']);
  const lo = normalizeLoadout({ ...createBag(), ach: ['vacuum', 'bad'] });
  assert.deepEqual(lo.ach, ['vacuum']);
  assert.deepEqual(normalizeLoadout(null).ach, []);
});

test('achievement bonus: stats add up with passives and the bag, caps stay shared', () => {
  const ach = ['first_trophy', 'both_heroines', 'hoarder', 'recycler', 'vacuum', 'untouchable'];
  const bag = { ...createBag(), ach };
  const passives = [{ id: 'attack', level: 2 }, { id: 'pickup', level: 5 }];
  const st = loadoutStats(base, passives, bag);
  const a = achievementBonus(ach);
  near(st.attack, base.attack * (1 + PASSIVES.attack.levels[1] + a.inc.attack));
  near(st.dodge, base.dodge + a.flat.dodge);
  // pickup: 1 + 1.25 + 0.15 = 2.4 < кап 3; с ещё большим бонусом упрётся в кап
  const pickup = base.pickup * (1 + PASSIVES.pickup.levels[4] + a.inc.pickup);
  near(st.pickup, Math.min(STAT_CAPS.pickup, pickup));
  const capped = computeStats(base, passives, {}, { inc: { pickup: 1 } });
  assert.equal(capped.pickup, STAT_CAPS.pickup);
});

test('statReport: parts split the total into passives, items and achievements', () => {
  const rng = createRng(5);
  let bag = createBag();
  bag = place(bag, rollItem(rng, 3, { type: 'gloves', rarity: 'epic' }), 0, 0);
  const ach = ['first_trophy', 'no_one_left'];
  const lo = { ...bag, ach };
  const passives = [{ id: 'attack', level: 3 }, { id: 'resistance', level: 1 }];
  const rep = loadoutReport(base, passives, lo);
  const items = loadoutBonus(bag); // без ачивок
  const a = achievementBonus(ach);
  for (const k of Object.keys(STATS)) {
    const p = rep[k].parts;
    assert.ok(p, `${k} has parts`);
    const want = (items.inc[k] || 0) + (items.flat[k] || 0);
    near(p.items, want, 1e-9);
    near(p.ach, (a.inc[k] || 0) + (a.flat[k] || 0));
    const pass = passives.filter((q) => PASSIVES[q.id].stat === k)
        .reduce((s, q) => s + PASSIVES[q.id].levels[q.level - 1], 0);
    near(p.passives, pass);
    assert.equal(p.more, 1);
  }
  // итог процентного стата = база × (1 + сумма вкладов)
  const at = rep.attack;
  near(at.value, base.attack * (1 + at.parts.passives + at.parts.items + at.parts.ach));
  // плоский — база + сумма вкладов
  const rs = rep.resistance;
  const sum = rs.parts.passives + rs.parts.items + rs.parts.ach;
  near(rs.value, Math.min(rs.cap, base.resistance + sum));
  // без extra разбивка: только пассивки
  const plain = statReport(base, passives);
  assert.equal(plain.attack.parts.items, 0);
  assert.equal(plain.attack.parts.ach, 0);
  // кап: (max) остаётся
  const capped = statReport(base, [{ id: 'pickup', level: 5 }], { inc: { pickup: 2 } }, { inc: { pickup: 0.1 } });
  assert.equal(capped.pickup.capped, true);
  near(capped.pickup.parts.ach, 0.1);
  near(capped.pickup.parts.items, 1.9);
});

test('achievement bonus: the sim applies each player own bonuses, coop hash stays equal', () => {
  const a = { ...createBag(), ach: ['first_trophy', 'three_crowns'] };
  const b = { ...createBag(), ach: ['untouchable'] };
  const solo = createSim({ seed: 2, loadouts: [a] });
  near(solo.player.stats.attack, base.attack * (1 + 0.02 + 0));
  near(solo.player.maxHp, base.maxHp * (1 + ACHIEVEMENTS.three_crowns.bonus.maxHp));
  const mk = () => createSim({ seed: 4, players: 2, heroes: ['heroine', 'mage'], loadouts: [a, b] });
  const s1 = mk();
  const s2 = mk();
  const [p0, p1] = s1.players;
  near(p0.stats.attack, base.attack * (1 + ACHIEVEMENTS.first_trophy.bonus.attack));
  near(p1.stats.dodge, HEROES.mage.stats.dodge + ACHIEVEMENTS.untouchable.bonus.dodge);
  near(p1.stats.attack, HEROES.mage.stats.attack);
  for (let i = 0; i < 600; i++) {
    for (const s of [s1, s2]) {
      if (s.state === 'levelup') s.chooseCard(0, s.picker);
      else if (s.state === 'chest') s.chooseChest(0);
      s.step(1 / 60, { players: [{ x: 1, y: 0 }, { x: 0, y: 1 }] });
    }
  }
  assert.equal(hashSim(s1), hashSim(s2));
  // другие ачивки у напарника — другой хеш (рассинхрон виден сразу)
  const s3 = createSim({ seed: 4, players: 2, heroes: ['heroine', 'mage'], loadouts: [a, createBag()] });
  const s4 = createSim({ seed: 4, players: 2, heroes: ['heroine', 'mage'], loadouts: [a, b] });
  assert.notEqual(hashSim(s3), hashSim(s4));
});

test('evaluateLive: unlocks mid-run conditions at once, leaves wins and counters to the end', () => {
  const run = { ...emptyRunSummary(), time: 300, hero: 'heroine', xpPickedBefore120: 3,
    bossesKilled: [{ id: 'dryad_queen', hp: 0.5 }], revives: ACHIEVEMENTS.medic.target, coop: true,
    maxMagnetGems: ACHIEVEMENTS.vacuum.target, foodPicked: 0 };
  const res = evaluateLive(emptyAchievements(), run, 7);
  assert.ok(res.unlocked.includes('first_trophy'));
  assert.ok(res.unlocked.includes('medic'));
  assert.ok(res.unlocked.includes('vacuum'));
  assert.ok(!res.unlocked.includes('hunger'), 'win-only stays for the end');
  assert.equal(res.state.done.first_trophy, 7);
  assert.equal(res.state.counters.medic, 0, 'medic counter is added once, at the end');
  assert.ok(res.rewards.wallet.crystals > 0);
  // в конце забега те же ачивки не выдаются второй раз, счётчик medic прибавляется
  const end = evaluateRun(res.state, { ...run, won: true });
  assert.ok(!end.unlocked.includes('first_trophy'));
  assert.ok(end.unlocked.includes('hunger'));
  assert.equal(end.state.counters.medic, ACHIEVEMENTS.medic.target);
});

test('run summary: medic counts a revive only if the hero stood by the coffin', () => {
  const pl = (id, x) => ({ id, x, y: 0, hp: 100, maxHp: 100, dead: false, hero: 'heroine',
    weapons: [], passives: [], levelUp: { rerolls: 2, skips: 2, banishes: 2 } });
  const sim = { time: 0, state: 'running', deadN: 0, enemies: [], pickups: [],
    players: [pl(0, 0), pl(1, 10)] };
  const tr = createRunSummaryTracker({ local: 0, coop: true });
  tr.observe(sim);
  sim.players[1].dead = true;
  // далеко от гроба всё время: гроб встал сам, не считается
  sim.players[0].x = COOP.allyRadius * 4;
  sim.time = 0.5; tr.observe(sim);
  sim.time = 5; tr.observe(sim);
  tr.onEvents([{ type: 'revive', player: 1, x: 10, y: 0 }], sim);
  assert.equal(tr.snapshot(sim).revives, 0);
  // второй раз подошёл к гробу хоть на кадр: считается
  sim.players[0].x = 0;
  sim.time = 5 + 1 / 60; tr.observe(sim);
  sim.players[0].x = COOP.allyRadius * 4;
  sim.time = 6; tr.observe(sim);
  tr.onEvents([{ type: 'revive', player: 1, x: 10, y: 0 }], sim);
  const snap = tr.snapshot(sim);
  assert.equal(snap.revives, 1);
  assert.equal(snap.won, false);
  assert.equal(snap.time, sim.time);
});
