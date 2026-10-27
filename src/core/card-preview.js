// Предпросмотр карточки улучшения: как изменится стат пассивки или параметры оружия, если её взять,
// и на какие оружия игрока пассивка влияет. Считается тем же путём, что sim (_syncBuild, _refreshWeapon):
// статы героя + пассивки + сумка и ачивки (pl.bonus) + уникалка + кости, затем капы.
// Без Phaser: проверяется в tests/unit/card-preview.test.js.
import { WEAPONS } from '../data/weapons.js';
import { PASSIVES } from '../data/passives.js';
import { STATS } from '../data/stats.js';
import { computeStats, critChance } from './stats.js';
import { loadoutExtra, applyUniqueRules } from './loadout.js';

// Статы, что меняют оружие (как в sim._refreshWeapon и уроне): стат с именем dmgType оружия — его урон;
// haste — кулдаун; area и duration — одноимённые поля уровня, если они есть; шанс и урон крита — все.
const ALL_WEAPONS = new Set(['haste', 'crit', 'critDmg', 'luck']);
const LEVEL_FIELD = new Set(['area', 'duration']);
const DMG_TYPES = new Set(Object.values(WEAPONS).map((w) => w.dmgType).filter(Boolean));

// Параметры уровня оружия в предпросмотре (в этом порядке), уже со статами владельца.
export const PREVIEW_PARAMS = ['damage', 'cooldown', 'amount', 'bounces', 'area', 'duration', 'pierce',
  'speed'];

/**
 * Меняет ли стат оружие с таким id.
 * @param {string} stat ключ STATS
 * @param {string} id оружие
 * @return {boolean}
 */
export function statAffectsWeapon(stat, id) {
  const def = WEAPONS[id];
  if (!def || !STATS[stat]) return false;
  if (DMG_TYPES.has(stat)) return def.dmgType === stat;
  if (ALL_WEAPONS.has(stat)) return true;
  if (LEVEL_FIELD.has(stat)) return def.levels.some((lv) => lv[stat] !== undefined);
  return false;
}

/**
 * Оружия из списка, на которые влияет стат (пустой список у защитных и прочих статов).
 * @param {string} stat
 * @param {!Array<string>} ids
 * @return {!Array<string>}
 */
export function weaponsForStat(stat, ids) {
  return ids.filter((id) => statAffectsWeapon(stat, id));
}

// Итоговые статы игрока с другим набором пассивок (как sim._syncBuild).
function statsWith(pl, passives) {
  const out = computeStats(pl.heroDef.stats, passives, {},
      loadoutExtra(pl.bonus, passives, pl.uq, pl.dynMore));
  return applyUniqueRules(out, pl.uq);
}

// Показываемое значение стата: у crit — итоговый шанс (crit × удача, кап).
function shown(st, stat) {
  return stat === 'crit' ? critChance(st) : st[stat];
}

/**
 * Пассивка: значение стата до и после взятия карточки и оружия игрока, на которые она влияет.
 * @param {!Object} pl игрок sim (heroDef, passives, weapons, bonus, uq, dynMore)
 * @param {{id: string, level: number}} card карточка пассивки
 * @return {?{stat: string, before: number, after: number, weapons: !Array<string>}}
 */
export function passivePreview(pl, card) {
  const def = PASSIVES[card.id];
  if (!def) return null;
  const next = pl.passives.filter((p) => p.id !== card.id)
      .concat([{ id: card.id, level: card.level }]);
  const ids = pl.weapons.map((w) => w.id);
  return {
    stat: def.stat,
    before: shown(statsWith(pl, pl.passives), def.stat),
    after: shown(statsWith(pl, next), def.stat),
    weapons: weaponsForStat(def.stat, ids),
  };
}

// Параметры уровня со статами владельца (как sim._refreshWeapon).
function weaponParams(def, level, st, uq) {
  const lv = def.levels[Math.min(level, def.levels.length) - 1];
  const p = { ...lv };
  p.damage = lv.damage * (st[def.dmgType] ?? 1);
  p.cooldown = lv.cooldown / st.haste;
  if (uq && uq.cooldownMore) p.cooldown *= 1 + uq.cooldownMore;
  if (lv.area !== undefined) p.area = lv.area * st.area;
  if (lv.duration !== undefined) p.duration = lv.duration * st.duration;
  return p;
}

/**
 * Оружие: параметры, что изменятся при взятии уровня (до и после, со статами игрока). У нового
 * оружия и эволюции — пустой список (сравнивать не с чем).
 * @param {!Object} pl игрок sim
 * @param {{id: string, level: number, isNew: boolean, from: (Array|undefined)}} card
 * @return {!Array<{key: string, before: number, after: number}>}
 */
export function weaponPreview(pl, card) {
  const def = WEAPONS[card.id];
  if (!def || card.isNew || card.from || card.level < 2) return [];
  const st = statsWith(pl, pl.passives);
  const a = weaponParams(def, card.level - 1, st, pl.uq);
  const b = weaponParams(def, card.level, st, pl.uq);
  const out = [];
  for (const key of PREVIEW_PARAMS) {
    if (a[key] === undefined && b[key] === undefined) continue;
    if (Math.abs((a[key] ?? 0) - (b[key] ?? 0)) < 1e-9) continue;
    out.push({ key, before: a[key] ?? 0, after: b[key] ?? 0 });
  }
  return out;
}

/**
 * Новое оружие или эволюция (сравнивать не с чем): параметры уровня карточки со статами игрока
 * в порядке PREVIEW_PARAMS.
 * @param {!Object} pl игрок sim
 * @param {{id: string, level: number}} card
 * @return {!Array<{key: string, value: number}>}
 */
export function weaponStats(pl, card) {
  const def = WEAPONS[card.id];
  if (!def) return [];
  const p = weaponParams(def, Math.max(1, card.level), statsWith(pl, pl.passives), pl.uq);
  return PREVIEW_PARAMS.filter((key) => p[key] !== undefined)
      .map((key) => ({ key, value: p[key] }));
}
