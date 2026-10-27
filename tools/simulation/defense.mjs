// Защита на бумаге (docs/BALANCE_AUDIT.md, 12): сколько ударов переживает сборка при человеческой частоте ударов.
// Боты для защиты не нужны: у людей удары редкие (~1–4 в минуту, tools/telemetry/hits.mjs), поэтому считаем прямо.
//   d(m)      — средний удар на минуте m: урон врагов по человеческой смеси источников ударов этой минуты
//               × рост этапа (forest.scaling.damagePerMinute); броня вычитается из каждого удара, уклонение
//               убирает долю ударов: e = max(armorMinDamage, d − armor) × (1 − dodge) на попытку
//   buffer    — ударов с полного HP до смерти: maxHp / e
//   regen/min — ударов в минуту, которые реген закрывает сам: regen × 60 / e
//   window    — ударов, которые сборка переживает за окно W минут с полного HP: buffer + W × regen/min;
//               «лишних в минуту» = (window − window голого) / W
//   human     — сколько минут сборка живёт при человеческой частоте ударов h(m) без еды (∞ — реген покрывает)
// Шипы (thorns) в защиту не входят: это урон, он виден в клире (targets.mjs).
// node tools/simulation/defense.mjs [--hero heroine] [--window 3] [--human docs/simulation-evidence/human-hits-2026-10-27.json]
import { readFileSync } from 'node:fs';
import { PASSIVES } from '../../src/data/passives.js';
import { HEROES } from '../../src/data/heroes.js';
import { ENEMIES } from '../../src/data/enemies.js';
import { BOSSES } from '../../src/data/bosses.js';
import { COMBAT } from '../../src/data/constants.js';
import { forest } from '../../src/data/stages/forest.js';
import { createRng, hashSeed } from '../../src/core/rng.js';
import { rollItem, createBag, place, itemSize } from '../../src/core/items.js';
import { loadoutStats } from '../../src/core/loadout.js';
import { rollBag } from './bags.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const W = Number(opt('window', 3));
const heroId = opt('hero', 'all');
const humanFile = opt('human', 'docs/simulation-evidence/human-hits-2026-10-27.json');
const human = JSON.parse(readFileSync(humanFile, 'utf8'));
const MINUTES = [3, 6, 10, 14];
const DEF = ['maxHp', 'armor', 'regen', 'dodge'];

// Человеческая частота и смесь источников по минутам: соло, normal и cursed вместе.
// Минута сглажена с соседними (m−1..m+1): у людей 10–20 документов на минуту.
function humanMinute(m) {
  const rows = ['solo/normal', 'solo/cursed'].flatMap((k) => [m - 1, m, m + 1]
    .map((x) => human[k]?.minutes[x])).filter(Boolean);
  const n = rows.reduce((s, r) => s + r.n, 0);
  const rate = n ? rows.reduce((s, r) => s + (r.hitsMean || 0) * r.n, 0) / n : 1.5;
  const src = {};
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.src || {})) src[k] = (src[k] || 0) + v;
  }
  return { rate, src };
}
export function hitDamage(m) {
  const { src } = humanMinute(m);
  const scale = 1 + forest.scaling.damagePerMinute * (m + 0.5);
  let sum = 0;
  let n = 0;
  for (const [k, c] of Object.entries(src)) {
    const def = ENEMIES[k] || BOSSES[k];
    if (!def) continue;
    // суккуба бьёт и касанием, и снарядом: среднее
    const d = def.params?.projDamage ? (def.damage + def.params.projDamage) / 2 : def.damage;
    sum += d * c; n += c;
  }
  return (n ? sum / n : 10) * scale;
}

// Сумки на бумаге: средние статы по 40 сидам. random — как у ботов (bags.mjs, T2 без отбора),
// tank — только защитные типы, из 3 предметов берётся лучший по защите.
const DEF_TYPES = ['helm', 'armor', 'belt', 'shield', 'boots'];
function defenseScore(item) {
  return item.affixes.reduce((s, a) =>
    s + (DEF.includes(a.stat) && a.max ? a.value / a.max : 0), 0);
}
function tankBag(seed, tier = 2, pick = 3) {
  const rng = createRng(hashSeed(seed, 991, tier));
  let bag = createBag(9, 5);
  for (let i = 0; i < 300; i++) {
    let best = null;
    for (let k = 0; k < pick; k++) {
      const item = rollItem(rng, tier, { type: DEF_TYPES[rng.int(DEF_TYPES.length)] });
      const next = fit(bag, item);
      if (next && (!best || defenseScore(item) > best.v)) best = { next, v: defenseScore(item) };
    }
    if (best) bag = best.next;
  }
  return bag;
}
function fit(bag, item) {
  for (const rot of [false, true]) {
    const [w, h] = itemSize(item, rot);
    for (let y = 0; y + h <= bag.rows; y++) {
      for (let x = 0; x + w <= bag.cols; x++) {
        const next = place(bag, item, x, y, rot);
        if (next) return next;
      }
    }
  }
  return null;
}
function averageStats(hero, passives, bags) {
  const acc = {};
  for (const bag of bags) {
    const st = loadoutStats(hero.stats, passives, bag);
    for (const k of DEF) acc[k] = (acc[k] || 0) + st[k] / bags.length;
  }
  return acc;
}

// Защитные уровни по кругу max_hp → armor → regen → dodge: k уровней всего.
function defensiveLevels(k) {
  const ids = ['max_hp', 'armor', 'regen', 'dodge'];
  const lv = { max_hp: 0, armor: 0, regen: 0, dodge: 0 };
  for (let i = 0; i < k; i++) lv[ids[i % ids.length]] = Math.min(5, lv[ids[i % ids.length]] + 1);
  return Object.entries(lv).filter(([, v]) => v > 0).map(([id, level]) => ({ id, level }));
}

export function paper(st, m) {
  const d = hitDamage(m);
  const e = Math.max(COMBAT.armorMinDamage, d - st.armor) * (1 - Math.min(st.dodge, 0.6));
  const buffer = st.maxHp / e;
  const regenHits = st.regen * 60 / e;
  const h = humanMinute(m).rate;
  const drain = h * e - st.regen * 60;
  return { d, e, buffer, regenHits, window: buffer + W * regenHits,
    humanMinutes: drain > 0 ? st.maxHp / drain : Infinity };
}

const r1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '∞');
const heroes = heroId === 'all' ? Object.keys(HEROES) : [heroId];
const randomBags = Array.from({ length: 40 }, (_, i) =>
  rollBag(1000 + i * 31, { tier: 2, cells: 45 }));
const tankBags = Array.from({ length: 40 }, (_, i) => tankBag(2000 + i * 37));
const empty = [null];
console.log('Человеческая частота ударов (соло) и средний удар: ' + MINUTES.map((m) =>
  `${m}:00 ${humanMinute(m).rate.toFixed(1)}/мин × ${hitDamage(m).toFixed(1)}`).join(', '));
for (const hid of heroes) {
  const hero = HEROES[hid];
  const naked = averageStats(hero, [], empty);
  const builds = [
    ['голый', [], empty],
    ['средний: 10 уровней защиты', defensiveLevels(10), empty],
    ['полный: 20 уровней (4 пассивки L5)', defensiveLevels(20), empty],
    ['голый + случайная сумка T2', [], randomBags],
    ['голый + защитная сумка T2', [], tankBags],
    ['полный + защитная сумка T2', defensiveLevels(20), tankBags],
  ];
  console.log(`\n${hid} (HP ${hero.stats.maxHp}, реген ${hero.stats.regen}), окно ${W} мин`);
  console.log('сборка'.padEnd(36) + 'HP    броня  реген  уклон  | ' +
    MINUTES.map((m) => `${m}:00 запас/реген/лишн/мин жизни`.padEnd(30)).join(''));
  for (const [name, passives, bags] of builds) {
    const st = averageStats(hero, passives, bags);
    const cells = MINUTES.map((m) => {
      const p = paper(st, m);
      const p0 = paper(naked, m);
      return `${r1(p.buffer)}/${r1(p.regenHits)}/+${r1((p.window - p0.window) / W)}/${r1(p.humanMinutes)}`.padEnd(30);
    });
    console.log(name.padEnd(36) + `${st.maxHp.toFixed(0).padEnd(6)}${st.armor.toFixed(2).padEnd(7)}` +
      `${st.regen.toFixed(2).padEnd(7)}${st.dodge.toFixed(3).padEnd(7)}| ` + cells.join(''));
  }
  // Цена одного уровня каждой защитной пассивки и одного предмета: лишних ударов за окно на 10:00.
  const per = {};
  for (const id of ['max_hp', 'armor', 'regen', 'dodge']) {
    per[id] = PASSIVES[id].levels.map((_, i) => {
      const a = paper(averageStats(hero, i ? [{ id, level: i }] : [], empty), 10).window;
      const b = paper(averageStats(hero, [{ id, level: i + 1 }], empty), 10).window;
      return +(b - a).toFixed(2);
    });
  }
  console.log('лишних ударов за окно на 10:00 по уровням пассивки:', JSON.stringify(per));
  const bagGain = paper(averageStats(hero, [], tankBags), 10).window - paper(naked, 10).window;
  console.log(`защитная сумка T2 = +${bagGain.toFixed(1)} ударов за окно на 10:00 ` +
    `(≈ ${(bagGain / ((per.max_hp[0] + per.armor[0] + per.regen[0] + per.dodge[0]) / 4)).toFixed(1)} уровней пассивок)`);
  console.log('линейная полоса (уровней защиты → ударов за окно на 10:00):',
    [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20].map((k) =>
      `${k}:${paper(averageStats(hero, defensiveLevels(k), empty), 10).window.toFixed(1)}`).join(' '));
}
