// Операции инвентаря для экранов (сумка ↔ стеш, пресеты, сортировка, лут после забега).
// Чистая логика без Phaser и DOM; предметы, сумка и крафт — src/core/items.js. Все функции не меняют вход
// и возвращают новый инвентарь (или null / {ok: false}, если операция невозможна).
import { RARITIES, ITEM_TYPES, STASH, BAG } from '../data/items.js';
import {
  place, remove, canPlace, stashAdd, stashRemove, stashFull, addCurrency, createBag,
} from './items.js';

const RARITY_RANK = Object.fromEntries(RARITIES.map((r, i) => [r, i]));
const TYPE_RANK = Object.fromEntries(Object.keys(ITEM_TYPES).map((k, i) => [k, i]));

/** Где лежит предмет: {where: 'bag'|'stash', item, entry?} или null. */
export function findItem(inv, uid) {
  const e = inv.bag.items.find((x) => x.item.uid === uid);
  if (e) return { where: 'bag', item: e.item, entry: e };
  const it = inv.stash.find((x) => x.uid === uid);
  return it ? { where: 'stash', item: it } : null;
}

// Уникалка впервые у игрока: отметка для кодекса.
function withSeen(inv, item) {
  if (!item || !item.unique || (inv.seen && inv.seen[item.unique])) return inv;
  return { ...inv, seen: { ...(inv.seen || {}), [item.unique]: 1 } };
}

/**
 * Надеть или переложить предмет в сумку в (x, y). Из стеша он убирается.
 * @return {?Object} инвентарь или null (не влезает, пересечение, вторая уникалка)
 */
export function equip(inv, uid, x, y, rot = false) {
  const f = findItem(inv, uid);
  if (!f) return null;
  const bag = place(inv.bag, f.item, x, y, rot);
  if (!bag) return null;
  return { ...inv, bag, stash: f.where === 'stash' ? stashRemove(inv.stash, uid) : inv.stash };
}

/** Можно ли положить предмет uid в (x, y) с поворотом rot. */
export function canEquip(inv, uid, x, y, rot = false) {
  const f = findItem(inv, uid);
  return !!f && canPlace(inv.bag, f.item, x, y, rot);
}

/**
 * Снять предмет из сумки в стеш (стеш полон — нельзя).
 * @return {?Object} инвентарь или null
 */
export function unequip(inv, uid) {
  const f = findItem(inv, uid);
  if (!f || f.where !== 'bag') return null;
  if (stashFull(inv.stash)) return null;
  return { ...inv, bag: remove(inv.bag, uid), stash: [...inv.stash, f.item] };
}

/** Заменить предмет (результат крафта) там же, где лежал старый (uid мог смениться при merge). */
export function replaceItem(inv, oldUid, item) {
  const f = findItem(inv, oldUid);
  if (!f) return inv;
  if (f.where === 'stash') {
    return withSeen({ ...inv, stash: inv.stash.map((x) => (x.uid === oldUid ? item : x)) }, item);
  }
  const e = f.entry;
  const bag = { ...inv.bag, items: inv.bag.items.map((x) => (x.item.uid === oldUid ?
    { item, x: e.x, y: e.y, rot: e.rot } : x)) };
  return withSeen({ ...inv, bag }, item);
}

/** Убрать предмет откуда угодно (сломан крафтом, поглощён соединением). */
export function dropItem(inv, uid) {
  return { ...inv, bag: remove(inv.bag, uid), stash: stashRemove(inv.stash, uid) };
}

/** Сохранить раскладку сумки в пресет i. */
export function savePreset(inv, i) {
  if (!(i >= 0 && i < BAG.presets)) return inv;
  const presets = (inv.presets || new Array(BAG.presets).fill(null)).slice();
  presets[i] = inv.bag.items.map((e) => ({ uid: e.item.uid, x: e.x, y: e.y, rot: !!e.rot }));
  return { ...inv, presets };
}

/**
 * Надеть пресет i: всё из сумки в стеш, затем предметы пресета (что есть в стеше) на свои места.
 * Недостающие (разобраны, сломаны) пропускаются: missing — сколько.
 * @return {{ok: boolean, inv: !Object, missing: number, reason: ?string}}
 */
export function loadPreset(inv, i) {
  const pr = inv.presets && inv.presets[i];
  if (!pr) return { ok: false, inv, missing: 0, reason: 'empty' };
  let stash = [...inv.stash, ...inv.bag.items.map((e) => e.item)];
  let bag = createBag(inv.bag.cols, inv.bag.rows);
  let missing = 0;
  for (const p of pr) {
    const it = stash.find((x) => x.uid === p.uid);
    const next = it && place(bag, it, p.x, p.y, p.rot);
    if (!next) { missing++; continue; }
    bag = next;
    stash = stashRemove(stash, p.uid);
  }
  if (stash.length > STASH.size) return { ok: false, inv, missing: 0, reason: 'full' };
  return { ok: true, inv: { ...inv, bag, stash }, missing, reason: null };
}

/**
 * Стеш по порядку: 'rarity' (от редких к обычным, затем тип, тир) или 'type' (тип, затем редкость, тир).
 * @return {!Array} новый массив
 */
export function sortStash(stash, by = 'rarity') {
  const r = (it) => -(RARITY_RANK[it.rarity] ?? 0);
  const ty = (it) => TYPE_RANK[it.type] ?? 99;
  const keys = by === 'type' ? [ty, r, (it) => -it.tier] : [r, ty, (it) => -it.tier];
  return stash.slice().sort((a, b) => {
    for (const k of keys) {
      const d = k(a) - k(b);
      if (d) return d;
    }
    return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
  });
}

/**
 * Взять предмет лута в стеш. Полный стеш: вытесняется evictUid (previewEvict) и разбирается в кристаллы.
 * @return {{ok: boolean, inv: !Object, evicted: ?Object, crystals: number, reason: ?string}}
 */
export function takeLoot(inv, item, evictUid = null) {
  const r = stashAdd(inv.stash, item, evictUid);
  if (!r.ok) return { ok: false, inv, evicted: null, crystals: 0, reason: r.reason };
  let next = { ...inv, stash: r.stash };
  if (r.crystals) next = { ...next, wallet: addCurrency(next.wallet, { crystals: r.crystals }) };
  return {
    ok: true, inv: withSeen(next, item), evicted: r.evicted, crystals: r.crystals, reason: null,
  };
}

/** Есть ли предмет с таким uid (лут из забега с тем же seed мог совпасть с уже взятым). */
export function hasUid(inv, uid) {
  return !!findItem(inv, uid);
}
