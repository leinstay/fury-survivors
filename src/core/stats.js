// Итоговые статы = базовые статы героя + пассивки + внешние источники (extra: шмот, уникалки).
// percent: база × (1 + Σ increased) × Π more; flat: (база + Σ) × Π more; затем капы (src/data/stats.js).
import { PASSIVES } from '../data/passives.js';
import { STATS, STAT_CAPS, STAT_CAPS_REL } from '../data/stats.js';

const NONE = {};

// База стата, если у героя её нет: множитель 1 у процентных, 0 у плоских.
function baseOf(base, k) {
  const v = base[k];
  if (v !== undefined) return v;
  return STATS[k] === 'percent' ? 1 : 0;
}

/**
 * Значения без капов. inc — сумма increased (у flat-статов прибавка), more — произведение more.
 * @param {!Object<string, number>} base
 * @param {!Array<{id: string, level: number}>} passives
 * @param {?Object=} extra { inc, flat, more }: {stat: число}
 * @param {!Object<string, number>=} out
 * @return {!Object<string, number>}
 */
function rawStats(base, passives, extra, out) {
  const inc = {};
  const more = {};
  for (const k in STATS) { inc[k] = 0; more[k] = 1; }
  const ps = passiveSums(passives);
  for (const k in ps) inc[k] = (inc[k] || 0) + ps[k];
  if (extra) {
    const ei = extra.inc || NONE;
    const ef = extra.flat || NONE;
    const em = extra.more || NONE;
    for (const k in ei) inc[k] = (inc[k] || 0) + ei[k];
    for (const k in ef) inc[k] = (inc[k] || 0) + ef[k];
    for (const k in em) more[k] = (more[k] ?? 1) * em[k];
  }
  for (const k in base) out[k] = base[k];
  for (const k in STATS) {
    const b = baseOf(base, k);
    const m = more[k];
    out[k] = STATS[k] === 'percent' ? b * (1 + inc[k]) * m : (b + inc[k]) * m;
  }
  return out;
}

// Кап стата k при базе героя base; Infinity — без капа. crit капается как итоговый шанс (critChance).
function capOf(base, k) {
  if (STAT_CAPS_REL[k] !== undefined) return baseOf(base, k) * STAT_CAPS_REL[k];
  if (k === 'crit' || STAT_CAPS[k] === undefined) return Infinity;
  return STAT_CAPS[k];
}

/**
 * @param {!Object<string, number>} base базовые статы героя
 * @param {!Array<{id: string, level: number}>} passives
 * @param {!Object<string, number>=} out объект для записи (переиспользуется)
 * @param {?{inc: (Object<string, number>|undefined), flat: (Object<string, number>|undefined),
 *     more: (Object<string, number>|undefined)}=} extra внешние источники (шмот): increased, плоские, more
 * @return {!Object<string, number>} out
 */
export function computeStats(base, passives, out = {}, extra = null) {
  rawStats(base, passives, extra, out);
  for (const k in STATS) {
    const cap = capOf(base, k);
    if (out[k] > cap) out[k] = cap;
  }
  return out;
}

/**
 * Итоговый шанс крита: crit × luck, затем кап STAT_CAPS.crit.
 * @param {!Object<string, number>} st итоговые статы
 * @return {number}
 */
export function critChance(st) {
  const c = (st.crit || 0) * (st.luck ?? 1);
  return c < STAT_CAPS.crit ? c : STAT_CAPS.crit;
}

// Сумма пассивок по статам (increased у процентных, прибавка у плоских).
function passiveSums(passives) {
  const out = {};
  for (let i = 0; i < passives.length; i++) {
    const p = passives[i];
    const def = PASSIVES[p.id];
    if (!def || p.level < 1) continue;
    out[def.stat] = (out[def.stat] || 0) + def.levels[Math.min(p.level, def.levels.length) - 1];
  }
  return out;
}

/**
 * Разбор статов для панели: итог, значение без капа, упор в кап и вклад источников.
 * У crit — итоговый шанс (crit × luck), вклады — в сам стат crit.
 * parts: passives — сумма пассивок, items — сумма внешних источников без ачивок (сумка, уникалка),
 * ach — сумма ачивок, more — произведение more (уникалки, кости). У процентных вклады — доли increased
 * (0.1 = +10%), у плоских — прибавка в единицах стата.
 * @param {!Object<string, number>} base
 * @param {!Array<{id: string, level: number}>} passives
 * @param {?Object=} extra как в computeStats (ачивки уже внутри)
 * @param {?{inc: (Object<string, number>|undefined), flat: (Object<string, number>|undefined)}=} ach
 *     часть extra от ачивок (для разбивки; в итог второй раз не прибавляется)
 * @return {!Object<string, {value: number, raw: number, cap: number, capped: boolean,
 *     parts: {passives: number, items: number, ach: number, more: number}}>}
 */
export function statReport(base, passives, extra = null, ach = null) {
  const raw = rawStats(base, passives, extra, {});
  const ps = passiveSums(passives);
  const ei = (extra && extra.inc) || NONE;
  const ef = (extra && extra.flat) || NONE;
  const em = (extra && extra.more) || NONE;
  const ai = (ach && ach.inc) || NONE;
  const af = (ach && ach.flat) || NONE;
  const out = {};
  for (const k in STATS) {
    let r = raw[k];
    let cap = capOf(base, k);
    if (k === 'crit') {
      r = raw.crit * Math.min(raw.luck, capOf(base, 'luck'));
      cap = STAT_CAPS.crit;
    }
    const a = (ai[k] || 0) + (af[k] || 0);
    const parts = {
      passives: ps[k] || 0,
      items: (ei[k] || 0) + (ef[k] || 0) - a,
      ach: a,
      more: em[k] ?? 1,
    };
    out[k] = { value: r > cap ? cap : r, raw: r, cap, capped: r >= cap, parts };
  }
  return out;
}
