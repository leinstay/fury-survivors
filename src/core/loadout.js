// Лоадаут (надетая сумка) в забеге: проверка, бонус к статам, эффекты уникалки, слепок для телеметрии.
// Лоадаут = сумка {cols, rows, items} + ach: [id] — полученные ачивки с постоянным бонусом
// (src/data/achievements.js, поле bonus). В коопе оба поля уходят напарнику через лобби вместе с сумкой.
// Чистая логика без Phaser и DOM. Сим (src/core/sim.js) и панели статов (инвентарь, пауза) считают
// статы одной функцией loadoutStats, поэтому в меню видно то же, что будет в забеге.
// Поля эффектов уникалок — UNIQUES в src/data/items.js.
import { UNIQUES, ITEM_STATS } from '../data/items.js';
import { PASSIVES } from '../data/passives.js';
import { normalizeInventory, bagBonus, createBag } from './items.js';
import { computeStats, statReport } from './stats.js';
import { achievementBonus, normalizeAchievementIds } from './achievements.js';

/**
 * Сумка из чего угодно (сохранение, сообщение напарника): normalizeInventory без стеша; что не влезло — пропадает.
 * @param {*} raw
 * @return {{cols: number, rows: number, items: !Array}}
 */
export function normalizeLoadout(raw) {
  if (!raw || typeof raw !== 'object') return { ...createBag(), ach: [] };
  const inv = normalizeInventory({ bag: raw, stash: [] });
  return { ...(inv ? inv.bag : createBag()), ach: normalizeAchievementIds(raw.ach) };
}

/**
 * Бонус лоадаута к статам: bagBonus сумки, плюс бонусы ачивок (ach) в inc и flat.
 * ach — отдельно та же часть ачивок (разбивка в панели статов).
 * @param {?Object} bag лоадаут
 * @return {!Object} поля bagBonus и ach: {inc, flat}
 */
export function loadoutBonus(bag) {
  const b = bagBonus(bag || createBag());
  const ach = achievementBonus(bag && bag.ach);
  const inc = { ...b.inc };
  const flat = { ...b.flat };
  for (const k of Object.keys(ach.inc)) inc[k] = (inc[k] || 0) + ach.inc[k];
  for (const k of Object.keys(ach.flat)) flat[k] = (flat[k] || 0) + ach.flat[k];
  return { ...b, inc, flat, ach };
}

/** Id надетой уникалки или null (в сумке не больше одной). */
export function loadoutUnique(bag) {
  for (const e of (bag && bag.items) || []) {
    if (e.item.unique && UNIQUES[e.item.unique]) return e.item.unique;
  }
  return null;
}

/**
 * Внешние источники статов для computeStats(..., extra): аффиксы сумки, more уникалки (доли bagBonus
 * переводятся в множители), монах (пассивки ×passiveMul), кости и последний шанс (dyn.more).
 * @param {!Object} bonus bagBonus(bag)
 * @param {!Array<{id: string, level: number}>} passives
 * @param {?Object} def эффект уникалки (UNIQUES[id]) или null
 * @param {?Object<string, number>=} dynMore множители, что меняются в забеге (кости, last_chance)
 * @return {{inc: !Object, flat: !Object, more: !Object}}
 */
export function loadoutExtra(bonus, passives, def, dynMore = null) {
  const inc = { ...bonus.inc };
  const more = {};
  for (const k of Object.keys(bonus.more)) more[k] = 1 + bonus.more[k];
  if (dynMore) for (const k of Object.keys(dynMore)) more[k] = (more[k] ?? 1) * dynMore[k];
  const mul = def && def.passiveMul ? def.passiveMul : 1;
  if (mul !== 1) {
    for (const p of passives) {
      const pd = PASSIVES[p.id];
      if (!pd || p.level < 1) continue;
      const v = pd.levels[Math.min(p.level, pd.levels.length) - 1] * (mul - 1);
      inc[pd.stat] = (inc[pd.stat] || 0) + v;
    }
  }
  return { inc, flat: bonus.flat, more };
}

/** Жёсткие правила уникалки поверх итоговых статов: maxHpSet, resistanceOff, regenOff. Меняет stats. */
export function applyUniqueRules(stats, def) {
  if (!def) return stats;
  if (def.maxHpSet) stats.maxHp = def.maxHpSet;
  if (def.resistanceOff) stats.resistance = 0;
  if (def.regenOff) stats.regen = 0;
  return stats;
}

/**
 * Итоговые статы героя с сумкой (как в симе на старте забега, без динамики).
 * @param {!Object<string, number>} base статы героя
 * @param {!Array} passives
 * @param {?Object} bag
 * @param {!Object=} out
 * @return {!Object<string, number>}
 */
export function loadoutStats(base, passives, bag, out = {}) {
  const b = loadoutBonus(bag);
  const id = loadoutUnique(bag);
  const def = id ? UNIQUES[id] : null;
  computeStats(base, passives, out, loadoutExtra(b, passives, def));
  return applyUniqueRules(out, def);
}

/**
 * Разбор статов для панели (statReport) с сумкой, ачивками (bag.ach) и правилами уникалки.
 * @return {!Object<string, {value: number, raw: number, cap: number, capped: boolean, parts: !Object}>}
 */
export function loadoutReport(base, passives, bag) {
  const b = loadoutBonus(bag);
  const id = loadoutUnique(bag);
  const def = id ? UNIQUES[id] : null;
  const rep = statReport(base, passives, loadoutExtra(b, passives, def), b.ach);
  const set = (k, v) => {
    if (rep[k]) rep[k] = { value: v, raw: v, cap: rep[k].cap, capped: false, parts: rep[k].parts };
  };
  if (def && def.maxHpSet) set('maxHp', def.maxHpSet);
  if (def && def.resistanceOff) set('resistance', 0);
  if (def && def.regenOff) set('regen', 0);
  return rep;
}

/** Статы для костей (dice): из них выбираются «вверх» и «вниз». */
export const DICE_STATS = ITEM_STATS;

/**
 * Слепок сумки для телеметрии: предметы без аффиксов, уникалка и суммы бонусов по статам.
 * @return {{items: !Array, unique: ?string, inc: !Object, flat: !Object, more: !Object,
 *     cols: number, rows: number}}
 */
export function bagSnapshot(bag) {
  const b = bag || createBag();
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  const sums = (o) => {
    const out = {};
    for (const k of Object.keys(o)) out[k] = r4(o[k]);
    return out;
  };
  const bonus = bagBonus(b);
  return {
    cols: b.cols, rows: b.rows,
    items: b.items.map((e) => ({
      type: e.item.type, shape: [e.item.shape[0], e.item.shape[1]], rarity: e.item.rarity,
      tier: e.item.tier, enchant: e.item.enchant || 0,
    })),
    unique: loadoutUnique(b),
    inc: sums(bonus.inc), flat: sums(bonus.flat), more: sums(bonus.more),
  };
}
