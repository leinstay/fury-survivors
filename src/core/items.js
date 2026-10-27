// Предметы: ролл, имена, сумка, стеш, крафт, валюты, проверка сохранений.
// Чистая логика без Phaser и DOM. Случайность только из переданного rng (src/core/rng.js),
// поэтому ролл в симе детерминирован. Все операции не меняют входные объекты и возвращают новые.
import {
  ITEM_STATS, ITEM_FLAT_STATS, STAT_REF, ITEM_POWER, TIERS, RARITIES, RARITY_AFFIXES,
  ITEM_TYPES, AFFIX_WEIGHTS, CHEST_TABLES, CHEST_SIZE, BOSS_DROPS, UNIQUES, BAG, STASH,
  CURRENCIES, DISASSEMBLE, CRAFT, NAME_WORDS, INVENTORY_VERSION, LEGACY_AFFIX_STATS,
  LEGACY_AFFIX_SCALE,
} from '../data/items.js';

const FLAT = new Set(ITEM_FLAT_STATS);
const UID_RE = /^[a-z0-9]{1,24}$/;

const round = (x) => Math.round(x * ITEM_POWER.round) / ITEM_POWER.round;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Выбор по весам: entries = [[ключ, вес], ...]. Нулевые веса не выпадают.
function weighted(rng, entries) {
  let total = 0;
  for (const [, w] of entries) total += Math.max(0, w);
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (const [k, w] of entries) {
    if (w <= 0) continue;
    r -= w;
    if (r < 0) return k;
  }
  for (let i = entries.length - 1; i >= 0; i--) if (entries[i][1] > 0) return entries[i][0];
  return null;
}

/**
 * Новый uid из rng (детерминирован в симе).
 * @param {{int: function(number): number}} rng
 * @return {string}
 */
export function newUid(rng) {
  const a = rng.int(0x7fffffff).toString(36).padStart(6, '0');
  const b = rng.int(0x7fffffff).toString(36).padStart(6, '0');
  return a + b;
}

/** Плоский ли стат (иначе процентный, increased). */
export function isFlatStat(stat) {
  return FLAT.has(stat);
}

/** Бюджет формы: клетки^1.25. */
export function shapeBudget(size) {
  return (size[0] * size[1]) ** ITEM_POWER.shapeExp;
}

/** Максимум аффикса без заточки: ref × scale × бюджет × тир. */
export function affixMax(stat, size, tier) {
  return STAT_REF[stat] * ITEM_POWER.scale * shapeBudget(size) * (ITEM_POWER.tierMul[tier] || 1);
}

/**
 * Разброс аффикса: обязательный [max/2 … max], остальные [−max/2 … max].
 * @return {{min: number, max: number}}
 */
export function affixRange(stat, size, tier, implicit) {
  const max = affixMax(stat, size, tier);
  return { min: round(implicit ? max / 2 : -max / 2), max: round(max) };
}

/** Множитель заточки: 1 + 5% за плюс. */
export function enchantMul(item) {
  return 1 + ITEM_POWER.enchantStep * (item.enchant || 0);
}

function rollAffix(rng, stat, size, tier, implicit) {
  const { min, max } = affixRange(stat, size, tier, implicit);
  let value;
  if (implicit) value = rng.range(max / 2, max);
  else if (rng.next() < ITEM_POWER.negativeChance) value = rng.range(min, 0);
  else value = rng.range(0, max);
  return { stat, value: round(value), min, max };
}

// Пул обязательного аффикса типа (null в данных = любой стат).
function implicitPool(type) {
  return ITEM_TYPES[type].implicit || ITEM_STATS;
}

function pickStat(rng, pool, used) {
  return weighted(rng, pool.filter((s) => !used.has(s)).map((s) => [s, AFFIX_WEIGHTS[s] || 0]));
}

// Аффиксы предмета: обязательный первым, остальные без повторов по весам.
function rollAffixes(rng, type, size, tier, count) {
  const used = new Set();
  const implicit = pickStat(rng, implicitPool(type), used);
  used.add(implicit);
  const out = [rollAffix(rng, implicit, size, tier, true)];
  while (out.length < count) {
    const stat = pickStat(rng, ITEM_STATS, used);
    if (!stat) break;
    used.add(stat);
    out.push(rollAffix(rng, stat, size, tier, false));
  }
  return out;
}

/** Типы, которые выпадают обычными предметами (вес > 0). */
export function rollableTypes() {
  return Object.keys(ITEM_TYPES).filter((t) => ITEM_TYPES[t].weight > 0);
}

/**
 * Обычный предмет.
 * @param {!Object} rng
 * @param {number} tier 1..4
 * @param {{rarity: (string|undefined), type: (string|undefined),
 *     size: (!Array<number>|undefined), uid: (string|undefined)}=} opts
 * @return {!Object} предмет
 */
export function rollItem(rng, tier, opts = {}) {
  const uid = opts.uid || newUid(rng);
  let rarity = opts.rarity;
  if (!RARITY_AFFIXES[rarity]) {
    const tbl = CHEST_TABLES[tier];
    rarity = weighted(rng, Object.keys(RARITY_AFFIXES).map((r) => [r, tbl[r]])) || 'common';
  }
  const type = ITEM_TYPES[opts.type] && ITEM_TYPES[opts.type].weight > 0 ? opts.type :
    weighted(rng, rollableTypes().map((t) => [t, ITEM_TYPES[t].weight]));
  const shapes = ITEM_TYPES[type].shapes;
  let size = opts.size && shapes.find((s) => s.size[0] === opts.size[0] &&
      s.size[1] === opts.size[1]);
  size = size ? size.size : weighted(rng, shapes.map((s) => [s.size, s.weight]));
  const affixes = rollAffixes(rng, type, size, tier, RARITY_AFFIXES[rarity]);
  return {
    uid, type, shape: [size[0], size[1]], tier, rarity,
    implicit: affixes[0].stat, affixes, enchant: 0, unique: null, locked: false,
  };
}

/** Уникалки, доступные в сундуке тира. */
export function uniquesForTier(tier) {
  return Object.keys(UNIQUES).filter((id) => UNIQUES[id].minTier <= tier);
}

/** Предмет-уникалка по id (форма из данных, без аффиксов). */
export function makeUnique(id, tier, uid) {
  const u = UNIQUES[id];
  return {
    uid, type: u.type, shape: [u.size[0], u.size[1]], tier, rarity: 'unique',
    implicit: null, affixes: [], enchant: 0, unique: id, locked: false,
  };
}

/**
 * Случайная уникалка тира (exclude — id, которые не повторять). null, если пул пуст.
 * @return {Object}
 */
export function rollUnique(rng, tier, opts = {}) {
  const exclude = opts.exclude || [];
  let pool = uniquesForTier(tier).filter((id) => !exclude.includes(id));
  if (!pool.length) pool = uniquesForTier(tier);
  if (!pool.length) return null;
  const uid = opts.uid || newUid(rng);
  return makeUnique(opts.id && UNIQUES[opts.id] ? opts.id : rng.pick(pool), tier, uid);
}

/**
 * Сундук с босса: CHEST_SIZE записей {kind: 'item'|'unique'|'scroll', item?}.
 * @return {!Array<{kind: string, item: (Object|undefined)}>}
 */
export function rollChest(rng, tier) {
  const tbl = CHEST_TABLES[tier] || CHEST_TABLES[1];
  const out = [];
  const seenUniques = [];
  for (let i = 0; i < CHEST_SIZE; i++) {
    const kind = weighted(rng, Object.keys(tbl).map((k) => [k, tbl[k]]));
    if (kind === 'scroll') {
      out.push({ kind: 'scroll' });
    } else if (kind === 'unique') {
      const item = rollUnique(rng, tier, { exclude: seenUniques });
      if (item) {
        seenUniques.push(item.unique);
        out.push({ kind: 'unique', item });
      } else {
        out.push({ kind: 'item', item: rollItem(rng, tier, { rarity: 'epic' }) });
      }
    } else {
      out.push({ kind: 'item', item: rollItem(rng, tier, { rarity: kind }) });
    }
  }
  return out;
}

/** Дроп босса по порядку убийства (0 — первый): {boss, tier, hearts}. */
export function bossDrop(index) {
  return BOSS_DROPS[clamp(index | 0, 0, BOSS_DROPS.length - 1)];
}

/** Сколько сердец хаоса даёт босс с номером index. */
export function rollHearts(rng, index) {
  const h = bossDrop(index).hearts;
  if (h.chance >= 1) return h.n;
  return rng.next() < h.chance ? h.n : 0;
}

// ---------- Показ ----------

/**
 * Строки аффиксов для описания: значения с заточкой и множителем mul (бонус разнообразия).
 * @return {!Array<{stat: string, value: number, min: number, max: number,
 *     implicit: boolean, flat: boolean}>}
 */
export function affixLines(item, mul = 1) {
  const k = enchantMul(item) * mul;
  return item.affixes.map((a, i) => ({
    stat: a.stat, value: a.value * k, min: a.min * k, max: a.max * k,
    implicit: i === 0, flat: FLAT.has(a.stat),
  }));
}

// Слово по качеству ролла: от слабых (низ разброса, минус) к сильным.
function wordIndex(a) {
  const span = a.max - a.min;
  const q = span > 0 ? (a.value - a.min) / span : 1;
  return clamp(Math.floor(q * NAME_WORDS), 0, NAME_WORDS - 1);
}

/** Ключ базы имени: item.type.<type>.<w>x<h>. */
export function baseNameKey(type, shape) {
  return `item.type.${type}.${shape[0]}x${shape[1]}`;
}

/**
 * Части имени (ключи i18n): префикс от первого необязательного аффикса, суффикс от второго.
 * Уникалка: base = unique.<id>.name, без префикса и суффикса.
 * @return {{prefix: ?string, base: string, suffix: ?string}}
 */
export function itemName(item) {
  if (item.unique) return { prefix: null, base: `unique.${item.unique}.name`, suffix: null };
  const p = item.affixes[1];
  const s = item.affixes[2];
  return {
    prefix: p ? `item.prefix.${p.stat}.${wordIndex(p)}` : null,
    base: baseNameKey(item.type, item.shape),
    suffix: s ? `item.suffix.${s.stat}.${wordIndex(s)}` : null,
  };
}

// ---------- Сумка ----------

/** Пустая сумка с открытой областью cols × rows. */
export function createBag(cols = BAG.startCols, rows = BAG.startRows) {
  return { cols: clamp(cols | 0, 1, BAG.w), rows: clamp(rows | 0, 1, BAG.h), items: [] };
}

/**
 * Открытая область по полученным ачивкам (массив, Set или объект id → truthy).
 * @return {{cols: number, rows: number}}
 */
export function bagSize(achieved) {
  const has = (id) => {
    if (!achieved) return false;
    if (Array.isArray(achieved)) return achieved.includes(id);
    if (achieved instanceof Set) return achieved.has(id);
    return !!achieved[id];
  };
  let cols = BAG.startCols;
  let rows = BAG.startRows;
  for (const id of Object.keys(BAG.unlocks)) {
    if (!has(id)) continue;
    cols += BAG.unlocks[id].cols || 0;
    rows += BAG.unlocks[id].rows || 0;
  }
  return { cols: Math.min(cols, BAG.w), rows: Math.min(rows, BAG.h) };
}

/** Сумка с новой открытой областью; предметы, что не влезли, возвращаются в dropped. */
export function resizeBag(bag, cols, rows) {
  let out = createBag(cols, rows);
  const dropped = [];
  for (const e of bag.items) {
    const next = place(out, e.item, e.x, e.y, e.rot);
    if (next) out = next;
    else dropped.push(e.item);
  }
  return { bag: out, dropped };
}

/** Размер предмета на сетке с учётом поворота: [w, h]. */
export function itemSize(item, rot) {
  return rot ? [item.shape[1], item.shape[0]] : [item.shape[0], item.shape[1]];
}

function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
}

/**
 * Можно ли положить предмет в (x, y): в открытой области, без пересечений, не больше одной
 * уникалки. Сам предмет (тот же uid) при перемещении не мешает.
 * @return {boolean}
 */
export function canPlace(bag, item, x, y, rot = false) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  const [w, h] = itemSize(item, rot);
  if (x < 0 || y < 0 || x + w > bag.cols || y + h > bag.rows) return false;
  let uniques = item.unique ? 1 : 0;
  for (const e of bag.items) {
    if (e.item.uid === item.uid) continue;
    if (e.item.unique) uniques++;
    const [ew, eh] = itemSize(e.item, e.rot);
    if (overlaps(x, y, w, h, e.x, e.y, ew, eh)) return false;
  }
  return uniques <= BAG.maxUniques;
}

/** Положить или переместить предмет. Новая сумка или null. */
export function place(bag, item, x, y, rot = false) {
  if (!canPlace(bag, item, x, y, rot)) return null;
  const items = bag.items.filter((e) => e.item.uid !== item.uid);
  items.push({ item, x, y, rot: !!rot });
  return { ...bag, items };
}

/** Убрать предмет из сумки по uid. */
export function remove(bag, uid) {
  return { ...bag, items: bag.items.filter((e) => e.item.uid !== uid) };
}

/** Повернуть предмет на месте (тот же левый верхний угол). Новая сумка или null. */
export function rotate(bag, uid) {
  const e = bag.items.find((it) => it.item.uid === uid);
  if (!e) return null;
  return place(bag, e.item, e.x, e.y, !e.rot);
}

/** Сетка [y][x] uid или null (вся BAG.w × BAG.h; закрытые клетки: x ≥ cols или y ≥ rows). */
export function bagGrid(bag) {
  const g = Array.from({ length: BAG.h }, () => new Array(BAG.w).fill(null));
  for (const e of bag.items) {
    const [w, h] = itemSize(e.item, e.rot);
    for (let y = e.y; y < e.y + h; y++) for (let x = e.x; x < e.x + w; x++) g[y][x] = e.item.uid;
  }
  return g;
}

/** Все открытые клетки заняты (ачивка tetris). */
export function bagFull(bag) {
  let cells = 0;
  for (const e of bag.items) cells += e.item.shape[0] * e.item.shape[1];
  return cells >= bag.cols * bag.rows;
}

/** Число разных типов в сумке. */
export function bagTypes(bag) {
  return new Set(bag.items.map((e) => e.item.type)).size;
}

/**
 * Сумма бонусов сумки для computeStats(..., extra):
 *   inc — сумма increased по процентным статам (доли), flat — плоские прибавки,
 *   more — множители уникалок (доля: 1 = ×2), uniques — id надетых уникалок,
 *   types — разных типов, diversity — множитель аффиксов за разнообразие.
 * Значения аффиксов уже с заточкой и разнообразием.
 * @return {{inc: !Object<string, number>, flat: !Object<string, number>,
 *     more: !Object<string, number>, uniques: !Array<string>, types: number, diversity: number}}
 */
export function bagBonus(bag) {
  const types = bagTypes(bag);
  const diversity = 1 + BAG.diversityPerType * types;
  const inc = {};
  const flat = {};
  const more = {};
  const uniques = [];
  for (const e of bag.items) {
    const it = e.item;
    if (it.unique) {
      uniques.push(it.unique);
      const m = (UNIQUES[it.unique] && UNIQUES[it.unique].more) || {};
      for (const s of Object.keys(m)) more[s] = (1 + (more[s] || 0)) * (1 + m[s]) - 1;
      continue;
    }
    const k = enchantMul(it) * diversity;
    for (const a of it.affixes) {
      const to = FLAT.has(a.stat) ? flat : inc;
      to[a.stat] = (to[a.stat] || 0) + a.value * k;
    }
  }
  return { inc, flat, more, uniques, types, diversity };
}

// ---------- Валюты ----------

/** Пустой кошелёк {crystals, scrolls, hearts}. */
export function emptyWallet() {
  const w = {};
  for (const c of CURRENCIES) w[c] = 0;
  return w;
}

/** Хватает ли валюты на cost ({crystals?, scrolls?, hearts?}). */
export function canAfford(wallet, cost) {
  for (const c of CURRENCIES) if ((cost[c] || 0) > (wallet[c] || 0)) return false;
  return true;
}

/** Кошелёк + add (add может быть отрицательным). */
export function addCurrency(wallet, add) {
  const w = { ...emptyWallet(), ...wallet };
  for (const c of CURRENCIES) w[c] = Math.max(0, (w[c] || 0) + (add[c] || 0));
  return w;
}

function neg(cost) {
  const o = {};
  for (const c of CURRENCIES) o[c] = -(cost[c] || 0);
  return o;
}

/** Кристаллы за разборку предмета. */
export function disassembleValue(item) {
  return (DISASSEMBLE.rarity[item.rarity] || 0) * (DISASSEMBLE.tier[item.tier] || 0);
}

// ---------- Стеш ----------

/** Стеш полон. */
export function stashFull(stash) {
  return stash.length >= STASH.size;
}

/**
 * Что исчезнет, если взять предмет в полный стеш: случайный незалоченный предмет самой
 * низкой редкости. null, если стеш не полон или всё залочено.
 * @return {?string} uid
 */
export function previewEvict(stash, rng) {
  if (!stashFull(stash)) return null;
  const free = stash.filter((it) => !it.locked);
  if (!free.length) return null;
  const rank = (it) => RARITIES.indexOf(it.rarity);
  const low = Math.min(...free.map(rank));
  return rng.pick(free.filter((it) => rank(it) === low)).uid;
}

/**
 * Взять предмет в стеш. Если полон, вытесняется evictUid (из previewEvict) и разбирается.
 * @return {{ok: boolean, stash: !Array, evicted: ?Object, crystals: number, reason: ?string}}
 */
export function stashAdd(stash, item, evictUid = null) {
  if (stash.some((it) => it.uid === item.uid)) {
    return { ok: false, stash, evicted: null, crystals: 0, reason: 'duplicate' };
  }
  if (!stashFull(stash)) {
    return { ok: true, stash: [...stash, item], evicted: null, crystals: 0, reason: null };
  }
  const ev = evictUid && stash.find((it) => it.uid === evictUid && !it.locked);
  if (!ev) return { ok: false, stash, evicted: null, crystals: 0, reason: 'full' };
  return {
    ok: true, stash: [...stash.filter((it) => it.uid !== ev.uid), item],
    evicted: ev, crystals: disassembleValue(ev), reason: null,
  };
}

/** Убрать предмет из стеша (например, в сумку). */
export function stashRemove(stash, uid) {
  return stash.filter((it) => it.uid !== uid);
}

/** Замок на предмете в стеше. */
export function stashLock(stash, uid, locked = true) {
  return stash.map((it) => (it.uid === uid ? { ...it, locked: !!locked } : it));
}

/**
 * Разобрать предмет из стеша в кристаллы (залоченный нельзя).
 * @return {{ok: boolean, stash: !Array, wallet: !Object, crystals: number, reason: ?string}}
 */
export function disassemble(stash, uid, wallet) {
  const it = stash.find((x) => x.uid === uid);
  if (!it) return { ok: false, stash, wallet, crystals: 0, reason: 'missing' };
  if (it.locked) return { ok: false, stash, wallet, crystals: 0, reason: 'locked' };
  const crystals = disassembleValue(it);
  return {
    ok: true, stash: stashRemove(stash, uid), wallet: addCurrency(wallet, { crystals }),
    crystals, reason: null,
  };
}

// ---------- Крафт ----------

const tierCost = (tier) => CRAFT.costTierMul[tier] || 1;

/**
 * Цена операции без свитка или null, если операция к предмету неприменима.
 * op: 'rerollAll' | 'rerollValue' | 'upgradeRarity' | 'merge' | 'enchant'; other — второй
 * предмет для merge.
 * @return {?{crystals: number, hearts: number, scrolls: number}}
 */
export function craftCost(op, item, other) {
  if (!item || item.unique) return null;
  const T = tierCost(item.tier);
  const c = (crystals, hearts = 0) => ({ crystals, hearts, scrolls: 0 });
  if (op === 'rerollAll') return c(CRAFT.rerollAll.crystals * T);
  if (op === 'rerollValue') return c(CRAFT.rerollValue.crystals * T);
  if (op === 'upgradeRarity') {
    const next = RARITIES[RARITIES.indexOf(item.rarity) + 1];
    if (!RARITY_AFFIXES[next]) return null;
    return c(CRAFT.upgradeRarity.crystals * T, CRAFT.upgradeRarity.hearts[next] || 0);
  }
  if (op === 'merge') {
    if (!other || other.unique || other.type !== item.type || other.uid === item.uid) return null;
    // редкость итога неизвестна заранее: берём дороже из двух (точная цена — mergeCost)
    const rank = Math.max(RARITIES.indexOf(item.rarity), RARITIES.indexOf(other.rarity));
    return mergeCost(item, other, RARITIES[rank]);
  }
  if (op === 'enchant') {
    const n = (item.enchant || 0) + 1;
    if (n > CRAFT.enchant.max) return null;
    return c(CRAFT.enchant.crystalsPerLevel * n * T);
  }
  return null;
}

/** Цена соединения при известной редкости итога. */
export function mergeCost(a, b, rarity) {
  const T = tierCost(Math.max(a.tier, b.tier));
  return {
    crystals: CRAFT.merge.crystals * T, hearts: CRAFT.merge.hearts[rarity] || 0, scrolls: 0,
  };
}

/** Шанс успеха: upgradeRarity — в следующую редкость, enchant — на следующий плюс. */
export function craftChance(op, item) {
  if (op === 'upgradeRarity') {
    const next = RARITIES[RARITIES.indexOf(item.rarity) + 1];
    return CRAFT.upgradeRarity.chance[next] ?? 0;
  }
  if (op === 'enchant') return CRAFT.enchant.chance[(item.enchant || 0) + 1] ?? 0;
  return 1;
}

// Общий результат крафта.
function res(ok, fields) {
  return {
    ok, success: false, item: null, broken: false, saved: false, refund: 0,
    cost: { crystals: 0, hearts: 0, scrolls: 0 }, wallet: null, reason: null, ...fields,
  };
}

function precheck(item, cost, wallet, scroll) {
  if (!cost) return res(false, { item, wallet, reason: 'invalid' });
  const need = scroll ? { ...cost, scrolls: 1 } : cost;
  if (wallet && !canAfford(wallet, need)) return res(false, { item, wallet, reason: 'funds' });
  return null;
}

const pay = (wallet, cost) => (wallet ? addCurrency(wallet, neg(cost)) : null);

/**
 * Перекатить все аффиксы: новые статы и значения, обязательный — в пределах пула типа,
 * число аффиксов то же. wallet необязателен (без него цена не проверяется).
 * @return {!Object} {ok, success, item, broken, saved, refund, cost, wallet, reason}
 */
export function rerollAll(rng, item, wallet = null) {
  const cost = craftCost('rerollAll', item);
  const bad = precheck(item, cost, wallet, false);
  if (bad) return bad;
  const affixes = rollAffixes(rng, item.type, item.shape, item.tier, item.affixes.length);
  const next = { ...item, implicit: affixes[0].stat, affixes };
  return res(true, { success: true, item: next, cost, wallet: pay(wallet, cost) });
}

/** Перекатить значение аффикса i (стат тот же, разброс по текущему тиру и форме). */
export function rerollValue(rng, item, i, wallet = null) {
  const cost = item && item.affixes[i] ? craftCost('rerollValue', item) : null;
  const bad = precheck(item, cost, wallet, false);
  if (bad) return bad;
  const affixes = item.affixes.slice();
  affixes[i] = rollAffix(rng, affixes[i].stat, item.shape, item.tier, i === 0);
  const next = { ...item, affixes };
  return res(true, { success: true, item: next, cost, wallet: pay(wallet, cost) });
}

// Рискованная операция: успех → apply(), провал → ломает или спасает свиток.
function risky(rng, item, cost, chance, wallet, scroll, refundOnBreak, apply) {
  const bad = precheck(item, cost, wallet, scroll);
  if (bad) return bad;
  if (rng.next() < chance) {
    const paid = scroll && CRAFT.scrollConsumedOnSuccess ? { ...cost, scrolls: 1 } : cost;
    return res(true, { success: true, item: apply(), cost: paid, wallet: pay(wallet, paid) });
  }
  if (scroll) {
    const paid = { ...cost, scrolls: 1 };
    return res(true, { item, saved: true, cost: paid, wallet: pay(wallet, paid) });
  }
  const refund = refundOnBreak ? disassembleValue(item) : 0;
  let w = pay(wallet, cost);
  if (w && refund) w = addCurrency(w, { crystals: refund });
  return res(true, { broken: true, refund, cost, wallet: w });
}

/**
 * Поднять редкость (+1 аффикс). Провал ломает предмет; opts.scroll — свиток спасает.
 * @return {!Object} как rerollAll
 */
export function upgradeRarity(rng, item, wallet = null, opts = {}) {
  const cost = craftCost('upgradeRarity', item);
  const chance = cost ? craftChance('upgradeRarity', item) : 0;
  return risky(rng, item, cost, chance, wallet, !!opts.scroll, CRAFT.upgradeRarity.breakRefund,
      () => {
        const rarity = RARITIES[RARITIES.indexOf(item.rarity) + 1];
        const used = new Set(item.affixes.map((a) => a.stat));
        const affixes = item.affixes.slice();
        const stat = pickStat(rng, ITEM_STATS, used);
        if (stat) affixes.push(rollAffix(rng, stat, item.shape, item.tier, false));
        return { ...item, rarity, affixes };
      });
}

/**
 * Заточка на +1. До +3 без риска, дальше провал разбирает предмет в кристаллы
 * (refund уже добавлен в wallet); opts.scroll — свиток сохраняет предмет.
 * @return {!Object} как rerollAll
 */
export function enchant(rng, item, wallet = null, opts = {}) {
  const cost = craftCost('enchant', item);
  const chance = cost ? craftChance('enchant', item) : 0;
  const scroll = !!opts.scroll && chance < 1;
  return risky(rng, item, cost, chance, wallet, scroll, CRAFT.enchant.breakRefund,
      () => ({ ...item, enchant: (item.enchant || 0) + 1 }));
}

/**
 * Соединить два предмета одного типа. Редкость итога — одного из двух; форма, тир и
 * обязательный — от одного из двух; остальные аффиксы случайно из обоих (значения те же,
 * недостающие докатываются); заточка — меньшая. Новый uid. Залоченные не соединяются.
 * Вызывающий убирает a и b из стеша и кладёт item.
 * @return {!Object} как rerollAll
 */
export function merge(rng, a, b, wallet = null) {
  if (!craftCost('merge', a, b)) return res(false, { item: a, wallet, reason: 'invalid' });
  if (a.locked || b.locked) return res(false, { item: a, wallet, reason: 'locked' });
  const rarity = rng.next() < 0.5 ? a.rarity : b.rarity;
  const cost = mergeCost(a, b, rarity);
  if (wallet && !canAfford(wallet, cost)) return res(false, { item: a, wallet, reason: 'funds' });
  const donor = rng.next() < 0.5 ? a : b;
  const count = RARITY_AFFIXES[rarity];
  const affixes = [{ ...donor.affixes[0] }];
  const used = new Set([affixes[0].stat]);
  const pool = [...a.affixes.slice(1), ...b.affixes.slice(1)];
  while (affixes.length < count && pool.length) {
    const cand = pool.filter((x) => !used.has(x.stat));
    if (!cand.length) break;
    const pick = rng.pick(cand);
    used.add(pick.stat);
    affixes.push({ ...pick });
  }
  while (affixes.length < count) {
    const stat = pickStat(rng, ITEM_STATS, used);
    if (!stat) break;
    used.add(stat);
    affixes.push(rollAffix(rng, stat, donor.shape, donor.tier, false));
  }
  const item = {
    uid: newUid(rng), type: donor.type, shape: [donor.shape[0], donor.shape[1]],
    tier: donor.tier, rarity, implicit: affixes[0].stat, affixes,
    enchant: Math.min(a.enchant || 0, b.enchant || 0), unique: null, locked: false,
  };
  return res(true, { success: true, item, cost, wallet: pay(wallet, cost) });
}

// ---------- Сохранения ----------

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

function validShape(type, shape) {
  return Array.isArray(shape) && ITEM_TYPES[type].shapes.some((s) =>
    s.size[0] === shape[0] && s.size[1] === shape[1]);
}

// Наибольший разброс аффикса для типа: T4, самая крупная форма, без заточки.
function capFor(stat, type) {
  let best = 0;
  for (const s of ITEM_TYPES[type].shapes) best = Math.max(best, affixMax(stat, s.size, 4));
  return round(best);
}

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Аффикс из сохранения версии v в нынешний: старый стат (LEGACY_AFFIX_STATS: armor -> resistance) в новый,
// стат со сменой единиц (LEGACY_AFFIX_SCALE: thorns до v2) — с пересчётом чисел.
function migrateAffix(a, v) {
  if (!a || typeof a !== 'object') return a;
  let stat = a.stat;
  let k = 1;
  if (own(LEGACY_AFFIX_STATS, stat)) {
    k = LEGACY_AFFIX_STATS[stat].mul;
    stat = LEGACY_AFFIX_STATS[stat].to;
  }
  const sc = own(LEGACY_AFFIX_SCALE, stat) ? LEGACY_AFFIX_SCALE[stat] : null;
  if (sc && v < sc.before) k *= sc.mul;
  if (stat === a.stat && k === 1) return a;
  return { stat, value: num(a.value) * k, min: num(a.min) * k, max: num(a.max) * k };
}

/**
 * Проверить предмет из сохранения. Неизвестное отбрасывается, числа зажимаются.
 * @param {*} raw
 * @param {number=} v версия сохранения (INVENTORY_VERSION): старые числа пересчитываются (migrateAffix)
 * @return {?Object} предмет или null
 */
export function normalizeItem(raw, v = INVENTORY_VERSION) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.uid !== 'string' || !UID_RE.test(raw.uid)) return null;
  const tier = TIERS.includes(raw.tier) ? raw.tier : null;
  if (!tier) return null;
  const locked = raw.locked === true;
  if (raw.unique != null || raw.rarity === 'unique') {
    if (!UNIQUES[raw.unique]) return null;
    return { ...makeUnique(raw.unique, tier, raw.uid), locked };
  }
  if (!ITEM_TYPES[raw.type] || !ITEM_TYPES[raw.type].weight) return null;
  if (!validShape(raw.type, raw.shape)) return null;
  const count = RARITY_AFFIXES[raw.rarity];
  if (!count || !Array.isArray(raw.affixes) || !raw.affixes.length) return null;
  const affixes = [];
  const used = new Set();
  for (const r of raw.affixes.slice(0, count)) {
    const a = migrateAffix(r, v);
    if (!a || typeof a !== 'object' || !ITEM_STATS.includes(a.stat) || used.has(a.stat)) {
      return null;
    }
    const implicit = affixes.length === 0;
    if (implicit && !implicitPool(raw.type).includes(a.stat)) return null;
    used.add(a.stat);
    const cap = capFor(a.stat, raw.type);
    const max = clamp(num(a.max), 0, cap);
    const min = clamp(num(a.min), implicit ? 0 : -cap / 2, max);
    affixes.push({ stat: a.stat, value: round(clamp(num(a.value), min, max)), min, max });
  }
  return {
    uid: raw.uid, type: raw.type, shape: [raw.shape[0], raw.shape[1]], tier,
    rarity: raw.rarity, implicit: affixes[0].stat, affixes,
    enchant: clamp(Math.floor(num(raw.enchant)), 0, CRAFT.enchant.max), unique: null, locked,
  };
}

/**
 * Пустой инвентарь: стеш, сумка, кошелёк, пресеты сумки (BAG.presets, общие; раскладка по uid:
 * [{uid, x, y, rot}] или null) и уникалки, что когда-либо были у игрока (seen: {id: 1}, кодекс).
 */
export function emptyInventory(size = bagSize(null)) {
  return { v: INVENTORY_VERSION, stash: [], bag: createBag(size.cols, size.rows),
    wallet: emptyWallet(), presets: new Array(BAG.presets).fill(null), seen: {} };
}

// Пресет из сохранения: до BAG.w × BAG.h мест {uid, x, y, rot}, битые отброшены; не массив — null.
function normalizePreset(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  const seen = new Set();
  for (const e of raw.slice(0, BAG.w * BAG.h)) {
    if (!e || typeof e.uid !== 'string' || !UID_RE.test(e.uid) || seen.has(e.uid)) continue;
    if (!Number.isInteger(e.x) || !Number.isInteger(e.y)) continue;
    seen.add(e.uid);
    out.push({
      uid: e.uid, x: clamp(e.x, 0, BAG.w - 1), y: clamp(e.y, 0, BAG.h - 1), rot: e.rot === true,
    });
  }
  return out;
}

/**
 * Проверить инвентарь из сохранения (localStorage / Firestore). size — открытая область сумки
 * по ачивкам (bagSize); что не влезло в сумку, уходит в стеш. Повторные uid отбрасываются.
 * @return {?Object} {v, stash, bag, wallet, presets, seen} или null для чужой версии
 */
export function normalizeInventory(raw, size = null) {
  if (!raw || typeof raw !== 'object') return emptyInventory(size || bagSize(null));
  if (typeof raw.v === 'number' && raw.v > INVENTORY_VERSION) return null;
  const rb = raw.bag && typeof raw.bag === 'object' ? raw.bag : {};
  const sz = size || {
    cols: clamp(num(rb.cols) || BAG.startCols, BAG.startCols, BAG.w),
    rows: clamp(num(rb.rows) || BAG.startRows, BAG.startRows, BAG.h),
  };
  const inv = emptyInventory(sz);
  const seen = new Set();
  const ver = typeof raw.v === 'number' ? raw.v : INVENTORY_VERSION;
  const take = (r) => {
    const it = normalizeItem(r, ver);
    if (!it || seen.has(it.uid)) return null;
    seen.add(it.uid);
    return it;
  };
  for (const e of Array.isArray(rb.items) ? rb.items : []) {
    const it = e && take(e.item);
    if (!it) continue;
    const next = place(inv.bag, it, e.x, e.y, e.rot === true);
    if (next) inv.bag = next;
    else inv.stash.push(it);
  }
  for (const r of Array.isArray(raw.stash) ? raw.stash : []) {
    const it = take(r);
    if (it) inv.stash.push(it);
  }
  const w = raw.wallet && typeof raw.wallet === 'object' ? raw.wallet : {};
  for (const c of CURRENCIES) inv.wallet[c] = Math.max(0, Math.floor(num(w[c])));
  const pr = Array.isArray(raw.presets) ? raw.presets : [];
  for (let i = 0; i < BAG.presets; i++) inv.presets[i] = normalizePreset(pr[i]);
  const sn = raw.seen && typeof raw.seen === 'object' ? raw.seen : {};
  for (const id of Object.keys(sn)) if (sn[id] && UNIQUES[id]) inv.seen[id] = 1;
  for (const it of inv.stash) if (it.unique) inv.seen[it.unique] = 1;
  for (const e of inv.bag.items) if (e.item.unique) inv.seen[e.item.unique] = 1;
  return inv;
}
