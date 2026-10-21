// Онлайн-таблица рекордов на Cloud Firestore. Без Phaser и DOM на импорте.
// Все ошибки наружу как Error с message: 'offline' | 'cooldown' | 'invalid' | 'denied'.
// Firebase SDK подтягивается ленивым import() с gstatic при первом использовании; без сети
// игра работает полностью. Неудачная загрузка не кэшируется.
import {
  FIREBASE_CONFIG, FIRESTORE_DB_ID, COLLECTION, SDK_URL, SCORE_FORMULA, LIMITS, BOARD,
} from '../data/leaderboard.js';
import { validateNick } from '../core/nick.js';

/** Очки забега по формуле из data/leaderboard.js. */
export function computeScore({ time = 0, kills = 0, victory = false } = {}, f = SCORE_FORMULA) {
  const s = Math.floor(Math.max(0, time)) * f.perSecond + Math.max(0, Math.floor(kills)) * f.perKill + (victory ? f.victoryBonus : 0);
  return Math.min(s, LIMITS.scoreMax);
}

const int = (v) => Math.floor(Number(v));

/**
 * topTen(entries, limit) -> [{ name, score, time, kills, level, victory }]. Чистая: выкидывает
 * битые строки, оставляет лучший результат каждого игрока (ключ = имя в верхнем регистре),
 * сортирует по убыванию очков (при равенстве раньше встретившийся первым), режет до limit.
 */
export function topTen(entries, limit = BOARD.rows) {
  if (!Array.isArray(entries)) return [];
  const best = new Map();
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    const name = typeof e.name === 'string' ? e.name.toUpperCase() : '';
    const score = int(e.score);
    if (!name || !Number.isFinite(score)) continue;
    const row = {
      name, score,
      time: Number.isFinite(int(e.time)) ? int(e.time) : 0,
      kills: Number.isFinite(int(e.kills)) ? int(e.kills) : 0,
      level: Number.isFinite(int(e.level)) ? int(e.level) : 0,
      victory: e.victory === true,
    };
    const seen = best.get(name);
    if (!seen) best.set(name, { ...row, order: best.size });
    else if (score > seen.score) Object.assign(seen, row);
  }
  return [...best.values()]
    .sort((a, b) => (b.score - a.score) || (a.order - b.order))
    .slice(0, limit)
    .map(({ order, ...row }) => row);
}

/** Место (1-based) игрока в таблице по имени или 0, если его там нет. */
export function rankOf(rows, name) {
  const i = rows.findIndex((r) => r.name === String(name).toUpperCase());
  return i + 1;
}

function classify(err) {
  const code = String((err && (err.code || err.message)) || '');
  if (/permission[-_ ]denied|PERMISSION_DENIED/i.test(code)) return 'denied';
  if (/^(offline|denied|invalid|cooldown)$/.test(code)) return code;
  return 'offline';
}

function withTimeout(promise, ms) {
  if (!(ms > 0)) return promise;
  let timer = null;
  const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('offline')), ms); });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

/** Реальный бэкенд: Firebase web SDK (firestore-lite) с CDN. */
async function loadFirestoreBackend() {
  if (!FIREBASE_CONFIG) throw new Error('offline');
  const { initializeApp, getApps, getApp } = await import(`${SDK_URL}/firebase-app.js`);
  const fs = await import(`${SDK_URL}/firebase-firestore-lite.js`);
  const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
  const db = FIRESTORE_DB_ID ? fs.getFirestore(app, FIRESTORE_DB_ID) : fs.getFirestore(app);
  const col = () => fs.collection(db, COLLECTION);
  return {
    async top(limit) {
      const snap = await fs.getDocs(fs.query(col(), fs.orderBy('score', 'desc'), fs.limit(limit)));
      return snap.docs.map((d) => d.data());
    },
    async add(doc) {
      await fs.addDoc(col(), { ...doc, createdAt: fs.serverTimestamp() });
    },
  };
}

/** Проверка и нормализация документа до отправки; null если не годится. */
function buildDoc({ name, score, time, kills, level, victory }) {
  const nick = validateNick(name);
  if (!nick.ok) return null;
  const doc = {
    name: nick.value, score: int(score), time: int(time), kills: int(kills), level: int(level), victory: victory === true,
  };
  const inR = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
  if (!inR(doc.score, 1, LIMITS.scoreMax) || !inR(doc.time, 0, LIMITS.timeMax)
    || !inR(doc.kills, 0, LIMITS.killsMax) || !inR(doc.level, 1, LIMITS.levelMax)) return null;
  return doc;
}

/** createLeaderboard({ loadBackend, now, timeoutMs, cooldownMs, hasConfig }): `loadBackend()` -> { top(limit), add(doc) }. */
export function createLeaderboard({
  loadBackend = loadFirestoreBackend,
  now = () => Date.now(),
  timeoutMs = BOARD.timeoutMs,
  cooldownMs = BOARD.cooldownMs,
  hasConfig = () => Boolean(FIREBASE_CONFIG),
} = {}) {
  let backendPromise = null;
  let lastSubmit = -Infinity;

  function backend() {
    if (!backendPromise) {
      backendPromise = (async () => loadBackend())();
      backendPromise.catch(() => { backendPromise = null; });
    }
    return backendPromise;
  }

  function isOnline() {
    if (!hasConfig()) return false;
    const nav = globalThis.navigator;
    return !(nav && nav.onLine === false);
  }

  async function fetchTop10() {
    try {
      const rows = await withTimeout((async () => (await backend()).top(BOARD.readLimit))(), timeoutMs);
      return topTen(rows);
    } catch (err) {
      backendPromise = null;
      throw new Error(classify(err), { cause: err });
    }
  }

  /** submitScore({ name, score, time, kills, level, victory }) -> Promise<void>. Кулдаун стартует после успешной записи. */
  async function submitScore(run) {
    const doc = buildDoc(run || {});
    if (!doc) throw new Error('invalid');
    if (now() - lastSubmit < cooldownMs) throw new Error('cooldown');
    try {
      await withTimeout((async () => (await backend()).add(doc))(), timeoutMs);
    } catch (err) {
      backendPromise = null;
      throw new Error(classify(err), { cause: err });
    }
    lastSubmit = now();
  }

  return { fetchTop10, submitScore, isOnline, topTen };
}

let service = createLeaderboard();

export function fetchTop10() { return service.fetchTop10(); }
export function submitScore(run) { return service.submitScore(run); }
export function isOnline() { return service.isOnline(); }

/** Тестовый шов: передать options с фейковым loadBackend, либо ничего для реального. */
export function __setBackendForTests(options) {
  service = createLeaderboard(options || {});
}
