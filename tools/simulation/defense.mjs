// Защита на бумаге (docs/BALANCE_AUDIT.md, 12–13): сколько ударов переживает сборка при человеческой частоте ударов.
// Боты для защиты не нужны: у людей удары редкие (~1–4 в минуту, tools/telemetry/hits.mjs), поэтому считаем прямо.
// Всё из данных: защитные статы (maxHp, resistance, regen, dodge) и их пассивки, капы STAT_CAPS, нижний предел
// удара COMBAT.minDamage, защитные типы предметов (ITEM_TYPES с защитным implicit).
//   d(m)      — средний удар на минуте m: урон врагов по человеческой смеси источников ударов этой минуты
//               × рост этапа (forest.scaling.damagePerMinute)
//   e         — ожидаемый урон попытки удара: max(minDamage, d × (1 − resistance)) × (1 − dodge), как sim.hurtPlayer
//   buffer    — ударов с полного HP до смерти: maxHp / e
//   regen/min — ударов в минуту, которые реген закрывает сам: regen × 60 / e
//   window    — ударов, которые сборка переживает за окно W минут с полного HP: buffer + W × regen/min;
//               «лишних в минуту» = (window − window голого) / W
//   human     — сколько минут сборка живёт при человеческой частоте ударов h(m) без еды (∞ — реген покрывает)
// Линейность (владелец: каждый источник +N ударов, и вместе примерно сумма): для каждой пассивки — прирост окна
// по уровням на голом герое; аддитивность = прирост всех четырёх L5 вместе / сумма приростов по отдельности
// (1 — линейно, > 1 — множатся); полоса — окно по числу защитных уровней 0 → 20 и отношение последнего шага
// к первому (1 — прямая).
// Шипы (thorns) в защиту не входят: это урон, он виден в клире (targets.mjs).
// node tools/simulation/defense.mjs [--hero heroine] [--window 3] [--minute 10]
//   [--human docs/simulation-evidence/human-hits-2026-10-27.json] [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PASSIVES } from '../../src/data/passives.js';
import { HEROES } from '../../src/data/heroes.js';
import { ENEMIES } from '../../src/data/enemies.js';
import { BOSSES } from '../../src/data/bosses.js';
import { STATS, STAT_CAPS } from '../../src/data/stats.js';
import { ITEM_TYPES } from '../../src/data/items.js';
import { COMBAT } from '../../src/data/constants.js';
import { forest } from '../../src/data/stages/forest.js';
import { createRng, hashSeed } from '../../src/core/rng.js';
import { rollItem, createBag, place, itemSize } from '../../src/core/items.js';
import { loadoutStats } from '../../src/core/loadout.js';
import { rollBag } from './bags.mjs';

// Стат снижения удара: resistance (доля, кап STAT_CAPS.resistance).
export const MITIGATION = 'resistance';
export const DEF = ['maxHp', MITIGATION, 'regen', 'dodge'].filter((k) => STATS[k]);
// Защитные пассивки в порядке DEF (по кругу в полосе glass → защитный).
export const DEF_PASSIVES = DEF.map((stat) => Object.keys(PASSIVES)
  .find((id) => PASSIVES[id].stat === stat)).filter(Boolean);
const MIN_DAMAGE = COMBAT.minDamage;
const cap = (k, v) => (STAT_CAPS[k] !== undefined ? Math.min(v, STAT_CAPS[k]) : v);

let human = null;
export function loadHuman(file = 'docs/simulation-evidence/human-hits-2026-10-27.json') {
  human = JSON.parse(readFileSync(file, 'utf8'));
  return human;
}

// Человеческая частота и смесь источников по минутам: соло, normal и cursed вместе.
// Минута сглажена с соседними (m−1..m+1): у людей 10–20 документов на минуту.
function humanMinute(m) {
  if (!human) loadHuman();
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

/** Ожидаемый урон одной попытки удара d по сборке st (как sim.hurtPlayer, без i-frames). */
export function mitigate(st, d) {
  const hit = d * (1 - cap('resistance', st.resistance || 0));
  return Math.max(MIN_DAMAGE, hit) * (1 - cap('dodge', st.dodge || 0));
}

// Сумки на бумаге: средние статы по 40 сидам. random — как у ботов (bags.mjs, T2 без отбора),
// tank — только защитные типы (implicit с защитным статом), из 3 предметов берётся лучший по защите.
const DEF_TYPES = Object.keys(ITEM_TYPES).filter((t) => ITEM_TYPES[t].weight > 0 &&
  (ITEM_TYPES[t].implicit || []).some((s) => DEF.includes(s)));
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
export function averageStats(hero, passives, bags) {
  const acc = {};
  for (const bag of bags) {
    const st = loadoutStats(hero.stats, passives, bag);
    for (const k of DEF) acc[k] = (acc[k] || 0) + st[k] / bags.length;
  }
  return acc;
}

// Защитные уровни по кругу DEF_PASSIVES: k уровней всего.
export function defensiveLevels(k) {
  const lv = Object.fromEntries(DEF_PASSIVES.map((id) => [id, 0]));
  for (let i = 0; i < k; i++) {
    const id = DEF_PASSIVES[i % DEF_PASSIVES.length];
    lv[id] = Math.min(PASSIVES[id].levels.length, lv[id] + 1);
  }
  return Object.entries(lv).filter(([, v]) => v > 0).map(([id, level]) => ({ id, level }));
}

export function paper(st, m, W = 3) {
  const d = hitDamage(m);
  const e = mitigate(st, d);
  const buffer = st.maxHp / e;
  const regenHits = st.regen * 60 / e;
  const h = humanMinute(m).rate;
  const drain = h * e - st.regen * 60;
  return { d, e, buffer, regenHits, window: buffer + W * regenHits,
    humanMinutes: drain > 0 ? st.maxHp / drain : Infinity };
}

/** Линейность защиты на минуте m: приросты по уровням, аддитивность, полоса 0 → 20 уровней. */
export function linearity(hero, m, W = 3) {
  const empty = [null];
  const win = (passives) => paper(averageStats(hero, passives, empty), m, W).window;
  const w0 = win([]);
  const per = {};
  const alone = {};
  for (const id of DEF_PASSIVES) {
    const n = PASSIVES[id].levels.length;
    per[id] = Array.from({ length: n }, (_, i) =>
      +(win([{ id, level: i + 1 }]) - (i ? win([{ id, level: i }]) : w0)).toFixed(2));
    alone[id] = win([{ id, level: n }]) - w0;
  }
  const all = win(DEF_PASSIVES.map((id) => ({ id, level: PASSIVES[id].levels.length }))) - w0;
  const sum = Object.values(alone).reduce((a, b) => a + b, 0);
  const total = DEF_PASSIVES.reduce((s, id) => s + PASSIVES[id].levels.length, 0);
  const band = Array.from({ length: total / 2 + 1 }, (_, i) =>
    [i * 2, win(defensiveLevels(i * 2))]);
  const steps = band.slice(1).map(([, v], i) => v - band[i][1]);
  return { naked: w0, per, alone, all, sum, additivity: all / sum, band,
    convexity: steps[steps.length - 1] / steps[0] };
}

function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
  const W = Number(opt('window', 3));
  const M = Number(opt('minute', 10));
  const heroId = opt('hero', 'all');
  loadHuman(opt('human', 'docs/simulation-evidence/human-hits-2026-10-27.json'));
  const MINUTES = [3, 6, 10, 14];
  const r1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '∞');
  const heroes = heroId === 'all' ? Object.keys(HEROES) : [heroId];
  const randomBags = Array.from({ length: 40 }, (_, i) =>
    rollBag(1000 + i * 31, { tier: 2, cells: 45 }));
  const tankBags = Array.from({ length: 40 }, (_, i) => tankBag(2000 + i * 37));
  const empty = [null];
  const full = DEF_PASSIVES.reduce((s, id) => s + PASSIVES[id].levels.length, 0);
  const json = {};
  console.log(`Снижение удара: ${MITIGATION}${STAT_CAPS[MITIGATION] !== undefined ?
    ` (кап ${STAT_CAPS[MITIGATION]})` : ''}, уклон (кап ${STAT_CAPS.dodge}), удар не ниже ${MIN_DAMAGE}; ` +
    `защитные пассивки ${DEF_PASSIVES.join(', ')}; защитные предметы ${DEF_TYPES.join(', ')}`);
  console.log('Человеческая частота ударов (соло) и средний удар: ' + MINUTES.map((m) =>
    `${m}:00 ${humanMinute(m).rate.toFixed(1)}/мин × ${hitDamage(m).toFixed(1)}`).join(', '));
  for (const hid of heroes) {
    const hero = HEROES[hid];
    const naked = averageStats(hero, [], empty);
    const builds = [
      ['голый', [], empty],
      [`средний: ${full / 2} уровней защиты`, defensiveLevels(full / 2), empty],
      [`полный: ${full} уровней (пассивки L5)`, defensiveLevels(full), empty],
      ['голый + случайная сумка T2', [], randomBags],
      ['голый + защитная сумка T2', [], tankBags],
      ['полный + защитная сумка T2', defensiveLevels(full), tankBags],
    ];
    console.log(`\n${hid} (HP ${hero.stats.maxHp}, реген ${hero.stats.regen}), окно ${W} мин`);
    console.log('сборка'.padEnd(36) + `HP    ${MITIGATION.slice(0, 6).padEnd(7)}реген  уклон  | ` +
      MINUTES.map((m) => `${m}:00 запас/реген/лишн/мин жизни`.padEnd(30)).join(''));
    for (const [name, passives, bags] of builds) {
      const st = averageStats(hero, passives, bags);
      const cells = MINUTES.map((m) => {
        const p = paper(st, m, W);
        const p0 = paper(naked, m, W);
        return `${r1(p.buffer)}/${r1(p.regenHits)}/+${r1((p.window - p0.window) / W)}/` +
          `${r1(p.humanMinutes)}`.padEnd(30);
      });
      console.log(name.padEnd(36) + `${st.maxHp.toFixed(0).padEnd(6)}` +
        `${st[MITIGATION].toFixed(2).padEnd(7)}${st.regen.toFixed(2).padEnd(7)}` +
        `${st.dodge.toFixed(3).padEnd(7)}| ` + cells.join(''));
    }
    const lin = linearity(hero, M, W);
    json[hid] = lin;
    console.log(`лишних ударов за окно на ${M}:00 по уровням пассивки:`, JSON.stringify(lin.per));
    const perLevel = DEF_PASSIVES.reduce((s, id) => s + lin.per[id][0], 0) / DEF_PASSIVES.length;
    const bagGain = paper(averageStats(hero, [], tankBags), M, W).window - lin.naked;
    console.log(`защитная сумка T2 = +${bagGain.toFixed(1)} ударов за окно на ${M}:00 ` +
      `(≈ ${(bagGain / perLevel).toFixed(1)} первых уровней пассивок)`);
    console.log(`аддитивность: все L5 вместе +${lin.all.toFixed(1)} против суммы по отдельности ` +
      `+${lin.sum.toFixed(1)} (${lin.additivity.toFixed(2)}×; 1 — линейно)`);
    console.log(`полоса (уровней защиты → ударов за окно на ${M}:00): ` +
      lin.band.map(([k, v]) => `${k}:${v.toFixed(1)}`).join(' ') +
      `; последний шаг / первый ${lin.convexity.toFixed(2)} (1 — прямая)`);
  }
  const out = opt('json', '');
  if (out) writeFileSync(out, JSON.stringify(json, null, 1));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
