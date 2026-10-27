// Хранение ачивок: localStorage и копия в Firestore fury_achievements/{id} (id — id кодекса игрока).
// Логика в src/core/achievements.js. Награды уходят в инвентарь (src/services/inventory.js).
// Без DOM на импорте.
import { ACHIEVEMENT_STORE, ACHIEVEMENTS_VERSION } from '../data/achievements.js';
import {
  emptyAchievements, normalizeAchievements, evaluateRun, evaluateMeta, achievedIds, markSeen,
  bumpCounters,
} from '../core/achievements.js';
import { bagSize } from '../core/items.js';
import { loadFirestore } from './firebase.js';
import { getCodex } from './codex.js';
import { getInventory, grantRewards, syncBagSize } from './inventory.js';

let cache = null;
let readOnly = false; // в localStorage схема новее нашей: не перезаписываем

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function withTimeout(promise, ms = ACHIEVEMENT_STORE.timeoutMs) {
  let timer = null;
  const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('offline')), ms); });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

/** Состояние ачивок (при первом обращении — из localStorage; сумка подгоняется под полученные). */
export function getAchievements() {
  if (cache) return cache;
  let s = null;
  try {
    const raw = storage() && storage().getItem(ACHIEVEMENT_STORE.storageKey);
    if (raw) {
      s = normalizeAchievements(JSON.parse(raw));
      readOnly = s === null;
    }
  } catch { s = null; }
  cache = s || emptyAchievements();
  saveAchievements();
  // чужая (новее) схема: в памяти пусто, сумку по нему не урезаем
  if (!readOnly) syncBagSize(bagSize(achievedIds(cache)));
  return cache;
}

export function saveAchievements() {
  if (!cache || readOnly) return;
  try {
    const st = storage();
    if (st) st.setItem(ACHIEVEMENT_STORE.storageKey, JSON.stringify(cache));
  } catch { /* полный localStorage: живём в памяти */ }
}

// Новое состояние после проверки: сохранить, выдать награды, копия в Firestore.
// Схема новее нашей (readOnly): ничего не открываем, иначе награды выдавались бы каждый запуск.
function commit(res) {
  if (readOnly) return { state: cache, unlocked: [], rewards: null };
  cache = res.state;
  saveAchievements();
  if (res.unlocked.length) {
    grantRewards(res.rewards, bagSize(achievedIds(cache)));
    backupAchievements();
  }
  return res;
}

/**
 * Итог забега (RunSummaryTracker.finish) → ачивки и награды.
 * @param {?Object} summary
 * @return {{unlocked: !Array<string>, rewards: !Object}} что получено сейчас
 */
export function recordRunAchievements(summary) {
  const s = getAchievements();
  if (!summary) return { unlocked: [], rewards: null };
  const res = commit(evaluateRun(s, summary, Date.now()));
  // medic меняет счётчик и без новых ачивок
  if (!res.unlocked.length && summary.revives) backupAchievements();
  return { unlocked: res.unlocked, rewards: res.rewards };
}

/**
 * Проверить ачивки стеша, сумки, крафта и кодекса. delta — счётчики крафта за эту операцию
 * ({disassembled, rerolls, broke, enchantMax}, см. bumpCounters). Стеш, сумка и кодекс берутся
 * из сервисов, ctx может их дополнить или заменить.
 * @return {{unlocked: !Array<string>, rewards: !Object}}
 */
export function checkMetaAchievements(delta = null, ctx = {}) {
  let s = getAchievements();
  if (delta) s = bumpCounters(s, delta);
  const inv = getInventory();
  const full = { stash: inv.stash, bag: inv.bag, codex: getCodex(), ...ctx };
  const res = commit(evaluateMeta(s, full, Date.now())); // счётчики сохраняются локально и без новых ачивок
  return { unlocked: res.unlocked, rewards: res.rewards };
}

/** Отметить полученные ачивки показанными (ids — список или все). */
export function markAchievementsSeen(ids = null) {
  cache = markSeen(getAchievements(), ids);
  saveAchievements();
}

/** Копия в Firestore. Ошибки (офлайн, правила) молча глотаются: локальное состояние главное. */
export async function backupAchievements() {
  if (globalThis.navigator && globalThis.navigator.webdriver) return false;
  if (readOnly) return false;
  try {
    const s = getAchievements();
    const id = getCodex().id;
    const data = JSON.stringify(s);
    if (data.length >= ACHIEVEMENT_STORE.maxBytes) return false;
    const { fs, db } = await loadFirestore();
    await withTimeout(fs.setDoc(fs.doc(db, ACHIEVEMENT_STORE.collection, id), {
      data, v: ACHIEVEMENTS_VERSION, updatedAt: fs.serverTimestamp(),
    }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Ачивки из Firestore по id кодекса (восстановление). Ошибка: 'notfound' | 'offline' | 'invalid'.
 * @param {string} id
 * @return {!Promise<!Object>}
 */
export async function fetchAchievements(id) {
  let snap;
  try {
    const { fs, db } = await loadFirestore();
    snap = await withTimeout(fs.getDoc(fs.doc(db, ACHIEVEMENT_STORE.collection, id)));
  } catch {
    throw new Error('offline');
  }
  if (!snap.exists()) throw new Error('notfound');
  let s = null;
  try {
    s = normalizeAchievements(JSON.parse(snap.data().data));
  } catch { s = null; }
  if (!s) throw new Error('invalid');
  return s;
}

/** Заменить локальные ачивки (восстановление); сумка подгоняется под полученные. */
export function replaceAchievements(state) {
  cache = state;
  readOnly = false;
  saveAchievements();
  syncBagSize(bagSize(achievedIds(cache)));
}

/** Сброс кэша в памяти (тесты). */
export function resetAchievementsCache() {
  cache = null;
  readOnly = false;
}
