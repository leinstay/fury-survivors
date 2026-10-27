// Онлайн-таблица рекордов на Cloud Firestore. Без Phaser и DOM на импорте.
// Все ошибки наружу как Error с message: 'offline' | 'cooldown' | 'invalid' | 'denied'.
// Firebase SDK подтягивается ленивым import() с gstatic при первом использовании; без сети
// игра работает полностью. Неудачная загрузка не кэшируется.
import {
  MODES, SCORE_FORMULA, LIMITS, BOARD, DIFFICULTY_FIELD, IP_FIELD, HERO_FIELD, STAGE_FIELD,
} from '../data/leaderboard.js';
import { loadFirestore } from './firebase.js';
import { validateName } from '../core/nick.js';

/**
 * Очки забега по формуле из data/leaderboard.js.
 * @param {{time: (number|undefined), kills: (number|undefined), coins: (number|undefined),
 *     victory: (boolean|undefined)}=} run
 * @param {!Object=} f формула (perSecond, perKill, perCoin, victoryBonus)
 * @return {number}
 */
export function computeScore(
    { time = 0, kills = 0, coins = 0, victory = false } = {}, f = SCORE_FORMULA) {
  const s = Math.floor(Math.max(0, time)) * f.perSecond +
      Math.max(0, Math.floor(kills)) * f.perKill +
      Math.max(0, Math.floor(coins)) * (f.perCoin || 0) + (victory ? f.victoryBonus : 0);
  return Math.min(Math.floor(s), LIMITS.scoreMax); // целое: правила Firestore принимают только int
}

const int = (v) => Math.floor(Number(v));

// Строковое поле записи по шаблону (test(undefined) проверил бы строку 'undefined').
const isField = (f, v) => typeof v === 'string' && f.re.test(v);

/**
 * Чистая: выкидывает битые строки; при одинаковом ip остаётся только лучшая запись (под каким бы ником
 * она ни была; записи без ip не трогаются); затем лучший результат каждого имени (имя в верхнем
 * регистре, в коопе это пара); сортировка по убыванию очков (при равенстве раньше встретившийся первым),
 * обрезка до limit.
 * @param {*} entries сырые строки из базы
 * @param {number=} limit
 * @return {!Array<{name: string, score: number, time: number, kills: number, level: number,
 *     victory: boolean, difficulty: string}>}
 */
export function topTen(entries, limit = BOARD.rows) {
  if (!Array.isArray(entries)) return [];
  const rows = [];
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    const name = typeof e.name === 'string' ? e.name.toUpperCase() : '';
    const score = int(e.score);
    if (!name || !Number.isFinite(score)) continue;
    rows.push({
      name, score,
      time: Number.isFinite(int(e.time)) ? int(e.time) : 0,
      kills: Number.isFinite(int(e.kills)) ? int(e.kills) : 0,
      level: Number.isFinite(int(e.level)) ? int(e.level) : 0,
      victory: e.victory === true,
      difficulty: DIFFICULTY_FIELD.values.includes(e[DIFFICULTY_FIELD.key]) ?
        e[DIFFICULTY_FIELD.key] : DIFFICULTY_FIELD.fallback,
      ip: typeof e[IP_FIELD.key] === 'string' ? e[IP_FIELD.key] : '',
      hero: isField(HERO_FIELD, e[HERO_FIELD.key]) ? e[HERO_FIELD.key] : HERO_FIELD.fallback,
      stage: isField(STAGE_FIELD, e[STAGE_FIELD.key]) ? e[STAGE_FIELD.key] : STAGE_FIELD.fallback,
      order: rows.length,
    });
  }
  const bestIp = new Map();
  for (const r of rows) {
    if (!r.ip) continue;
    const seen = bestIp.get(r.ip);
    if (!seen || r.score > seen.score) bestIp.set(r.ip, r);
  }
  const best = new Map();
  for (const r of rows) {
    if (r.ip && bestIp.get(r.ip) !== r) continue;
    const seen = best.get(r.name);
    if (!seen || r.score > seen.score) best.set(r.name, seen ? { ...r, order: seen.order } : r);
  }
  return [...best.values()]
      .sort((a, b) => (b.score - a.score) || (a.order - b.order))
      .slice(0, limit)
      .map(({ order, ip, ...row }) => row);
}

/**
 * @param {!Array<{name: string}>} rows
 * @param {string} name
 * @return {number} место (1-based) или 0, если игрока нет в таблице
 */
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
async function loadFirestoreBackend(collection = MODES.solo.collection) {
  const { fs, db } = await loadFirestore();
  const col = () => fs.collection(db, collection);
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

let ipPromise = null;

/**
 * Публичный IP отправителя (ipify), '' если не удалось. Один запрос на сессию; неудача не кэшируется.
 * @param {{fetch: (Function|undefined), timeoutMs: (number|undefined)}=} o
 * @return {!Promise<string>}
 */
export function fetchIp(o = {}) {
  const f = o.fetch || globalThis.fetch;
  if (!f || !IP_FIELD.url) return Promise.resolve('');
  if (!ipPromise) {
    ipPromise = (async () => {
      const res = await withTimeout(f(IP_FIELD.url), o.timeoutMs || IP_FIELD.timeoutMs);
      const j = await res.json();
      const ip = typeof j.ip === 'string' ? j.ip.trim() : '';
      if (!ip || ip.length > IP_FIELD.max || !/^[0-9a-fA-F:.]+$/.test(ip)) throw new Error('bad ip');
      return ip;
    })();
    ipPromise.catch(() => { ipPromise = null; });
  }
  return ipPromise.catch(() => '');
}

/** Проверка и нормализация документа до отправки; null если не годится. */
function buildDoc({ name, score, time, kills, level, victory, difficulty, hero, stage }, mode = 'solo') {
  const nick = validateName(name, mode);
  if (!nick.ok) return null;
  const doc = {
    name: nick.value, score: int(score), time: int(time), kills: int(kills), level: int(level),
    victory: victory === true,
    difficulty: DIFFICULTY_FIELD.values.includes(difficulty)
      ? difficulty : DIFFICULTY_FIELD.fallback,
  };
  if (isField(HERO_FIELD, hero)) doc[HERO_FIELD.key] = hero;
  if (isField(STAGE_FIELD, stage)) doc[STAGE_FIELD.key] = stage;
  const inR = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
  if (!inR(doc.score, 1, LIMITS.scoreMax) || !inR(doc.time, 0, LIMITS.timeMax)
    || !inR(doc.kills, 0, LIMITS.killsMax) || !inR(doc.level, 1, LIMITS.levelMax)) return null;
  return doc;
}

/**
 * Сервис таблицы рекордов. loadBackend() -> { top(limit), add(doc) }.
 * @param {{loadBackend: (function(): !Promise<!Object>|undefined), now: (function(): number|undefined),
 *     timeoutMs: (number|undefined), cooldownMs: (number|undefined),
 *     hasConfig: (function(): boolean|undefined)}=} options
 * @return {{fetchTop10: function(): !Promise<!Array<!Object>>,
 *     submitScore: function(!Object): !Promise<void>, isOnline: function(): boolean,
 *     topTen: function(*, number=): !Array<!Object>}}
 */
export function createLeaderboard({
  mode = 'solo',
  loadBackend = () => loadFirestoreBackend(MODES[mode].collection),
  now = () => Date.now(),
  timeoutMs = BOARD.timeoutMs,
  cooldownMs = BOARD.cooldownMs,
  hasConfig = () => Boolean(MODES[mode]),
  getIp = fetchIp,
} = {}) {
  let backendPromise = null;
  let lastSubmit = -Infinity;
  let inflight = null;   // запись в базу, которая ещё идёт (в том числе после таймаута)

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
      const rows = await withTimeout(
          (async () => (await backend()).top(BOARD.readLimit))(), timeoutMs);
      return topTen(rows);
    } catch (err) {
      backendPromise = null;
      throw new Error(classify(err), { cause: err });
    }
  }

  /** submitScore({ name, score, time, kills, level, victory }) -> Promise<void>. Кулдаун стартует после успешной записи. */
  async function submitScore(run) {
    const doc = buildDoc(run || {}, mode);
    if (!doc) throw new Error('invalid');
    if (now() - lastSubmit < cooldownMs) throw new Error('cooldown');
    // Запись после таймаута продолжает идти и может пройти: повторная отправка ждёт её же, а не пишет второй документ.
    if (!inflight) {
      inflight = (async () => {
        const ip = await getIp();
        if (ip) doc[IP_FIELD.key] = ip;
        const be = await backend();
        try {
          return await be.add(doc);
        } catch (err) {
          // правила без полей hero/stage (ещё не опубликованы): та же запись без них
          if (classify(err) !== 'denied' || !(HERO_FIELD.key in doc || STAGE_FIELD.key in doc)) throw err;
          const old = { ...doc };
          delete old[HERO_FIELD.key];
          delete old[STAGE_FIELD.key];
          return be.add(old);
        }
      })();
      inflight.then(() => { lastSubmit = now(); }, () => {}).finally(() => { inflight = null; });
    }
    try {
      await withTimeout(inflight, timeoutMs);
    } catch (err) {
      backendPromise = null;
      throw new Error(classify(err), { cause: err });
    }
  }

  return { fetchTop10, submitScore, isOnline, topTen };
}

const services = { solo: createLeaderboard({ mode: 'solo' }), coop: createLeaderboard({ mode: 'coop' }) };

/**
 * @param {string=} mode 'solo' | 'coop'
 * @return {!Promise<!Array<!Object>>} лучшие результаты; ошибка с message 'offline'|'denied'
 */
export function fetchTop10(mode = 'solo') { return services[mode].fetchTop10(); }
/**
 * @param {{name: string, score: number, time: number, kills: number, level: number,
 *     victory: boolean, difficulty: (string|undefined)}} run name в коопе — пара 'HOST+GUEST'
 * @param {string=} mode 'solo' | 'coop'
 * @return {!Promise<void>} ошибка с message 'offline'|'cooldown'|'invalid'|'denied'
 */
export function submitScore(run, mode = 'solo') { return services[mode].submitScore(run); }
/**
 * @return {boolean} есть конфиг Firebase и браузер не офлайн
 */
export function isOnline() { return services.solo.isOnline(); }

/**
 * Тестовый шов: передать options с фейковым loadBackend, либо ничего для реального.
 * @param {!Object=} options как у createLeaderboard (mode выбирает таблицу)
 */
export function __setBackendForTests(options) {
  const mode = (options && options.mode) || 'solo';
  services[mode] = createLeaderboard(options ? { getIp: async () => '', ...options } : { mode });
}
