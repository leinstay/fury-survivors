// Хранение инвентаря (стеш, сумка, кошелёк): localStorage и копия в Firestore fury_inventory/{id}
// (id — id кодекса игрока). Логика предметов в src/core/items.js. Без DOM на импорте.
// Копия в Firestore не чаще INVENTORY_STORE.backupEveryMs: инвентарь в меню меняется часто, а записей
// на Spark мало (docs/FIRESTORE.md).
import { INVENTORY_STORE } from '../data/achievements.js';
import { INVENTORY_VERSION, BAG } from '../data/items.js';
import {
  emptyInventory, normalizeInventory, addCurrency, resizeBag, bagSize,
} from '../core/items.js';
import { loadFirestore } from './firebase.js';
import { getCodex } from './codex.js';

let cache = null;
let lastBackup = 0;
let backupTimer = null;

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function withTimeout(promise, ms = INVENTORY_STORE.timeoutMs) {
  let timer = null;
  const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('offline')), ms); });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

/** Инвентарь игрока (создаётся при первом обращении). Схема новее нашей: пустой в памяти, без записи. */
export function getInventory() {
  if (cache) return cache;
  let inv = null;
  let foreign = false;
  try {
    const raw = storage() && storage().getItem(INVENTORY_STORE.storageKey);
    if (raw) {
      inv = normalizeInventory(JSON.parse(raw));
      foreign = inv === null;
    }
  } catch { inv = null; }
  cache = inv || emptyInventory(bagSize(null));
  if (!foreign) saveInventory();
  return cache;
}

/**
 * Заменить инвентарь (после операции из src/core/items.js) и сохранить локально.
 * backup: true — ещё и копия в Firestore (с ограничением частоты).
 */
export function setInventory(inv, { backup = false } = {}) {
  cache = inv;
  saveInventory();
  if (backup) scheduleBackup();
  return cache;
}

export function saveInventory() {
  if (!cache) return;
  try {
    const s = storage();
    if (s) s.setItem(INVENTORY_STORE.storageKey, JSON.stringify(cache));
  } catch { /* полный localStorage: живём с инвентарём в памяти */ }
}

/**
 * Открытая область сумки по ачивкам (bagSize из src/core/items.js). Предметы, что не влезли, уходят
 * в стеш. Если размер тот же, ничего не меняется.
 * @param {{cols: number, rows: number}} size
 */
export function syncBagSize(size) {
  const inv = getInventory();
  if (inv.bag.cols === size.cols && inv.bag.rows === size.rows) return inv;
  const { bag, dropped } = resizeBag(inv.bag, size.cols, size.rows);
  return setInventory({ ...inv, bag, stash: [...inv.stash, ...dropped] }, { backup: true });
}

/**
 * Награда ачивок (rewardsFor / evaluateRun / evaluateMeta из src/core/achievements.js) в инвентарь:
 * валюта в кошелёк; сумка — до size (bagSize по полученным ачивкам), а без size — на bag.cols/rows шире.
 * @param {?{wallet: !Object, bag: {cols: number, rows: number}}} rewards
 * @param {?{cols: number, rows: number}=} size
 * @return {!Object} инвентарь
 */
export function grantRewards(rewards, size = null) {
  let inv = getInventory();
  if (!rewards) return inv;
  inv = { ...inv, wallet: addCurrency(inv.wallet, rewards.wallet || {}) };
  const add = rewards.bag || {};
  const cols = size ? size.cols : Math.min(BAG.w, inv.bag.cols + (add.cols || 0));
  const rows = size ? size.rows : Math.min(BAG.h, inv.bag.rows + (add.rows || 0));
  if (cols !== inv.bag.cols || rows !== inv.bag.rows) {
    const { bag, dropped } = resizeBag(inv.bag, cols, rows);
    inv = { ...inv, bag, stash: [...inv.stash, ...dropped] };
  }
  return setInventory(inv, { backup: true });
}

// Копия не чаще backupEveryMs: лишние вызовы сливаются в одну отложенную запись.
function scheduleBackup() {
  if (backupTimer) return;
  const wait = Math.max(0, lastBackup + INVENTORY_STORE.backupEveryMs - Date.now());
  if (wait === 0) {
    backupInventory();
    return;
  }
  backupTimer = setTimeout(() => {
    backupTimer = null;
    backupInventory();
  }, wait);
}

/** Копия в Firestore сразу (например, при выходе из экрана инвентаря). Ошибки глотаются. */
export async function backupInventory() {
  // Браузер под автоматизацией (Playwright smoke): в боевую базу не пишем.
  if (globalThis.navigator && globalThis.navigator.webdriver) return false;
  lastBackup = Date.now();
  try {
    const inv = getInventory();
    const id = getCodex().id;
    const data = JSON.stringify(inv);
    if (data.length >= INVENTORY_STORE.maxBytes) return false;
    const { fs, db } = await loadFirestore();
    await withTimeout(fs.setDoc(fs.doc(db, INVENTORY_STORE.collection, id), {
      data, v: INVENTORY_VERSION, updatedAt: fs.serverTimestamp(),
    }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Инвентарь из Firestore по id кодекса (восстановление вместе с кодексом).
 * Ошибка: message 'notfound' | 'offline' | 'invalid'.
 * @param {string} id
 * @return {!Promise<!Object>}
 */
export async function fetchInventory(id) {
  let snap;
  try {
    const { fs, db } = await loadFirestore();
    snap = await withTimeout(fs.getDoc(fs.doc(db, INVENTORY_STORE.collection, id)));
  } catch {
    throw new Error('offline');
  }
  if (!snap.exists()) throw new Error('notfound');
  let inv = null;
  try {
    inv = normalizeInventory(JSON.parse(snap.data().data));
  } catch { inv = null; }
  if (!inv) throw new Error('invalid');
  return inv;
}

/** Заменить локальный инвентарь (восстановление). */
export function replaceInventory(inv) {
  cache = inv;
  saveInventory();
}

/** Сброс кэша в памяти (тесты). */
export function resetInventoryCache() {
  cache = null;
  lastBackup = 0;
  if (backupTimer) clearTimeout(backupTimer);
  backupTimer = null;
}
