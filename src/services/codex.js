// Хранение кодекса: localStorage (переживает Ctrl+F5) и резервная копия в Firestore fury_codex/{id}.
// Логика кодекса (трекер, слияние, нормализация) в src/core/codex.js. Без DOM на импорте.
import { CODEX } from '../data/codex.js';
import { emptyCodex, normalizeCodex, mergeRun, validCodexId } from '../core/codex.js';
import { loadFirestore } from './firebase.js';
import { readNick } from './nick-store.js';

let cache = null;

/** Случайный id [a-z0-9] длиной CODEX.idLength (crypto, угадать нельзя). */
export function randomCodexId() {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const n = CODEX.idLength;
  const bytes = new Uint8Array(n);
  const cr = globalThis.crypto;
  if (cr && cr.getRandomValues) cr.getRandomValues(bytes);
  else for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  let s = '';
  // 256 не делится на 36: первые 4 знака чуть чаще (8/256 против 7/256), на неугадываемость не влияет
  for (let i = 0; i < n; i++) s += abc[bytes[i] % abc.length];
  return s;
}

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** Кодекс игрока (создаётся при первом обращении). */
export function getCodex() {
  if (cache) return cache;
  let c = null;
  try {
    const raw = storage() && storage().getItem(CODEX.storageKey);
    if (raw) c = normalizeCodex(JSON.parse(raw));
  } catch { c = null; }
  if (!c) c = emptyCodex();
  if (!c.id) c.id = randomCodexId();
  if (!c.nick) c.nick = readNick();
  cache = c;
  saveCodex();
  return c;
}

export function saveCodex() {
  if (!cache) return;
  try {
    const s = storage();
    if (s) s.setItem(CODEX.storageKey, JSON.stringify(cache));
  } catch { /* полный localStorage: живём с кодексом в памяти */ }
}

function withTimeout(promise, ms = CODEX.timeoutMs) {
  let timer = null;
  const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('offline')), ms); });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

/**
 * Итог забега (RunTracker.finish) в кодекс, сохранить и отправить копию в Firestore.
 * @param {?Object} result
 */
export function recordRun(result) {
  if (!result) return;
  const c = getCodex();
  mergeRun(c, result);
  const nick = readNick();
  if (nick) c.nick = nick;
  saveCodex();
  backupCodex();
}

/** Копия в Firestore. Ошибки (офлайн, правила) молча глотаются: локальный кодекс главный. */
export async function backupCodex() {
  // Браузер под автоматизацией (Playwright smoke): не пишем тестовые забеги в боевую базу.
  if (globalThis.navigator && globalThis.navigator.webdriver) return false;
  try {
    const c = getCodex();
    const data = JSON.stringify(c);
    if (data.length >= CODEX.maxBytes) return false;
    const { fs, db } = await loadFirestore();
    await withTimeout(fs.setDoc(fs.doc(db, CODEX.collection, c.id), {
      nick: c.nick || '', data, v: CODEX.version, updatedAt: fs.serverTimestamp(),
    }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Кодекс из Firestore по id (для восстановления). Ошибка: message 'invalid' | 'notfound' | 'offline'.
 * @param {string} id
 * @return {!Promise<!Object>} нормализованный кодекс с этим id
 */
export async function fetchCodex(id) {
  if (!validCodexId(id)) throw new Error('invalid');
  let snap;
  try {
    const { fs, db } = await loadFirestore();
    snap = await withTimeout(fs.getDoc(fs.doc(db, CODEX.collection, id)));
  } catch {
    throw new Error('offline');
  }
  if (!snap.exists()) throw new Error('notfound');
  let c = null;
  try {
    c = normalizeCodex(JSON.parse(snap.data().data));
  } catch { c = null; }
  if (!c) throw new Error('invalid');
  c.id = id;
  return c;
}

/** Заменить локальный кодекс (восстановление): дальше пишем в документ с его id. */
export function replaceCodex(codex) {
  cache = codex;
  saveCodex();
}
