// Ачивки: чистая логика без Phaser и DOM. Список и пороги в src/data/achievements.js,
// итог забега (RunSummary) собирает src/core/run-summary.js, хранение — src/services/achievements.js.
//
// Состояние (схема ACHIEVEMENTS_VERSION):
// {
//   v,
//   done: { id: at },        // получено: время (мс) или 1, если время неизвестно
//   counters: { medic, disassembled, rerolls, broke, enchantMax },  // за всё время
//                            //   rerolls — перекаты крафта (не reroll карточек уровня)
//   heroesWon: { heroId: 1 },   // кем уже побеждали (both_heroines)
//   evolutions: { weaponId: 1 },  // какие эволюции уже были (evolutionist)
//   seen: { id: 1 },         // получение уже показано игроку (плашка «новое» гаснет)
// }
// Все функции не меняют входное состояние и возвращают новое.
import { ACHIEVEMENTS, ACHIEVEMENTS_VERSION } from '../data/achievements.js';
import { HEROES } from '../data/heroes.js';
import { WEAPONS } from '../data/weapons.js';
import { ENEMIES } from '../data/enemies.js';
import { STASH, BAG, CURRENCIES } from '../data/items.js';
import { bagFull, bagTypes, emptyWallet } from './items.js';
import { normalizeRunSummary } from './run-summary.js';

export const COUNTER_KEYS = ['medic', 'disassembled', 'rerolls', 'broke', 'enchantMax'];

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const known = (id) => typeof id === 'string' && has(ACHIEVEMENTS, id);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const int = (v) => Math.floor(num(v));

/** Все эволюции из данных (оружие с evolved). */
export function evolvedIds() {
  return Object.keys(WEAPONS).filter((id) => WEAPONS[id].evolved);
}

/** Пустое состояние ачивок. */
export function emptyAchievements() {
  const counters = {};
  for (const k of COUNTER_KEYS) counters[k] = 0;
  return { v: ACHIEVEMENTS_VERSION, done: {}, counters, heroesWon: {}, evolutions: {}, seen: {} };
}

function flagMap(raw, ok) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of Object.keys(raw)) if (raw[k] && ok(k)) out[k] = 1;
  return out;
}

/**
 * Состояние из сохранения. Неизвестные id и битые числа отброшены. null — схема новее нашей.
 * @param {*} raw
 * @return {?Object}
 */
export function normalizeAchievements(raw) {
  if (!raw || typeof raw !== 'object') return emptyAchievements();
  if (typeof raw.v === 'number' && raw.v > ACHIEVEMENTS_VERSION) return null;
  const s = emptyAchievements();
  const done = raw.done && typeof raw.done === 'object' ? raw.done : {};
  for (const id of Object.keys(done)) {
    if (!known(id) || !done[id]) continue;
    s.done[id] = int(done[id]) || 1;
  }
  const c = raw.counters && typeof raw.counters === 'object' ? raw.counters : {};
  for (const k of COUNTER_KEYS) s.counters[k] = int(c[k]);
  s.heroesWon = flagMap(raw.heroesWon, (k) => has(HEROES, k));
  s.evolutions = flagMap(raw.evolutions, (k) => has(WEAPONS, k) && !!WEAPONS[k].evolved);
  s.seen = flagMap(raw.seen, (k) => !!s.done[k]);
  return s;
}

function clone(state) {
  return {
    v: ACHIEVEMENTS_VERSION, done: { ...state.done }, counters: { ...state.counters },
    heroesWon: { ...state.heroesWon }, evolutions: { ...state.evolutions }, seen: { ...state.seen },
  };
}

/** Id полученных ачивок (для bagSize из src/core/items.js). */
export function achievedIds(state) {
  return state ? Object.keys(state.done).filter(known) : [];
}

/** Получена ли ачивка. */
export function isDone(state, id) {
  return !!(state && state.done[id]);
}

/** Полученные, но ещё не показанные игроку. */
export function unseenIds(state) {
  return achievedIds(state).filter((id) => !state.seen[id]);
}

/** Отметить показанными (ids — список или все полученные). */
export function markSeen(state, ids = null) {
  const s = clone(state);
  for (const id of ids || achievedIds(state)) if (s.done[id]) s.seen[id] = 1;
  return s;
}

/**
 * Прибавить счётчики крафта (delta: {disassembled, rerolls, broke} — сколько добавить;
 * enchantMax — достигнутая заточка, берётся максимум).
 */
export function bumpCounters(state, delta = {}) {
  const s = clone(state);
  for (const k of COUNTER_KEYS) {
    const v = int(delta[k]);
    if (!v) continue;
    s.counters[k] = k === 'enchantMax' ? Math.max(s.counters[k], v) : s.counters[k] + v;
  }
  return s;
}

/** Числа для описания ачивки: t(`ach.${id}.desc`, achievementParams(id)). */
export function achievementParams(id) {
  const d = ACHIEVEMENTS[id] || {};
  return {
    n: d.target ?? '',
    s: d.seconds ?? '',
    e: d.enemies ?? '',
    p: d.hpBelow != null ? Math.round(d.hpBelow * 100) : '',
    all: id === 'evolutionist' ? evolvedIds().length : '',
  };
}

// ---------- условия ----------
// Каждое условие: (s, run, ctx) → boolean; run или ctx может быть null (проверка мета-ачивок без забега
// или забега без инвентаря), тогда условие, которому нужен отсутствующий источник, не срабатывает.

const target = (id) => ACHIEVEMENTS[id].target || 1;
const bosses = (run) => (run ? run.bossesKilled.length : 0);

function stashOf(ctx) {
  return ctx && Array.isArray(ctx.stash) ? ctx.stash : null;
}

function bagOf(ctx) {
  return ctx && ctx.bag && Array.isArray(ctx.bag.items) ? ctx.bag : null;
}

// Разные уникалки во владении: стеш и сумка (или ctx.uniquesOwned).
function uniquesOwned(ctx) {
  if (!ctx) return 0;
  if (typeof ctx.uniquesOwned === 'number') return ctx.uniquesOwned;
  const ids = new Set();
  for (const it of stashOf(ctx) || []) if (it && it.unique) ids.add(it.unique);
  for (const e of (bagOf(ctx) || { items: [] }).items) {
    if (e.item && e.item.unique) ids.add(e.item.unique);
  }
  return ids.size;
}

// Бестиарий заполнен: все враги из enemies.js увидены в кодексе (или ctx.bestiaryComplete).
function bestiaryComplete(ctx) {
  if (!ctx) return false;
  if (typeof ctx.bestiaryComplete === 'boolean') return ctx.bestiaryComplete;
  const seen = ctx.codex && ctx.codex.seen && ctx.codex.seen.enemy;
  if (!seen) return false;
  const ids = Object.keys(ENEMIES);
  return ids.length > 0 && ids.every((id) => seen[id]);
}

const CHECKS = {
  first_trophy: (s, run) => bosses(run) >= target('first_trophy'),
  three_crowns: (s, run) => bosses(run) >= target('three_crowns'),
  reaper_slayer: (s, run) => !!run && run.reaperKilled,
  both_heroines: (s) => {
    const ids = Object.keys(HEROES);
    return ids.length > 0 && ids.every((h) => s.heroesWon[h]);
  },
  hunger: (s, run) => !!run && run.won && run.foodPicked === 0,
  monogamy: (s, run) => !!run && run.weaponsAtDryadKill === 1 && run.passivesAtDryadKill === 0,
  untouchable: (s, run) => !!run && run.untouchableMax >= ACHIEVEMENTS.untouchable.seconds,
  ascetic: (s, run) => !!run && run.time >= ACHIEVEMENTS.ascetic.seconds &&
    run.xpPickedBefore120 === 0,
  last_breath: (s, run) => !!run &&
    run.bossesKilled.some((b) => b.hp > 0 && b.hp < ACHIEVEMENTS.last_breath.hpBelow),
  no_safety: (s, run) => !!run && run.won && run.rerolls + run.skips + run.banishes === 0,
  evolutionist: (s) => {
    const ids = evolvedIds();
    return ids.length > 0 && ids.every((id) => s.evolutions[id]);
  },
  naturalist: (s, run, ctx) => bestiaryComplete(ctx),
  hoarder: (s, run, ctx) => !!stashOf(ctx) && stashOf(ctx).length >= STASH.size,
  tetris: (s, run, ctx) => !!bagOf(ctx) && bagOf(ctx).items.length > 0 && bagFull(bagOf(ctx)),
  collector: (s, run, ctx) => uniquesOwned(ctx) >= target('collector'),
  diversity: (s, run, ctx) => !!bagOf(ctx) && bagTypes(bagOf(ctx)) >= target('diversity'),
  recycler: (s) => s.counters.disassembled >= target('recycler'),
  smith: (s) => s.counters.enchantMax >= target('smith'),
  broke_it: (s) => s.counters.broke >= target('broke_it'),
  chaos_alchemist: (s) => s.counters.rerolls >= target('chaos_alchemist'),
  side_by_side: (s, run) => !!run && run.coop && bosses(run) >= target('side_by_side'),
  medic: (s) => s.counters.medic >= target('medic'),
  no_one_left: (s, run) => !!run && run.coop && run.won && !run.anyoneFell,
  vacuum: (s, run) => !!run && run.maxMagnetGems >= target('vacuum'),
  meat_grinder: (s, run) => !!run && run.maxKillsPerMinute >= target('meat_grinder'),
};

/** Пустая награда: кошелёк и открытые клетки сумки. */
export function emptyRewards() {
  return { wallet: emptyWallet(), bag: { cols: 0, rows: 0 } };
}

/** Награда за список ачивок: {wallet: {crystals, scrolls, hearts}, bag: {cols, rows}}. */
export function rewardsFor(ids) {
  const r = emptyRewards();
  for (const id of ids) {
    const rw = known(id) ? ACHIEVEMENTS[id].reward : null;
    if (!rw) continue;
    for (const c of CURRENCIES) r.wallet[c] += int(rw[c]);
    if (rw.bag) {
      const u = BAG.unlocks[id] || (rw.bag === 'row' ? { rows: 1 } : { cols: 1 });
      r.bag.cols += u.cols || 0;
      r.bag.rows += u.rows || 0;
    }
  }
  return r;
}

// Проверить все неполученные; полученные сейчас — в done с временем at.
function settle(s, run, ctx, at) {
  const unlocked = [];
  for (const id of Object.keys(ACHIEVEMENTS)) {
    if (s.done[id] || !CHECKS[id] || !CHECKS[id](s, run, ctx)) continue;
    s.done[id] = int(at) || 1;
    unlocked.push(id);
  }
  return { state: s, unlocked, rewards: rewardsFor(unlocked) };
}

// Учесть инвентарь в счётчиках (самая высокая заточка) и эволюции из ctx.
function absorbCtx(s, ctx) {
  if (!ctx) return;
  let best = int(ctx.enchantMax);
  for (const it of stashOf(ctx) || []) if (it) best = Math.max(best, int(it.enchant));
  for (const e of (bagOf(ctx) || { items: [] }).items) {
    if (e.item) best = Math.max(best, int(e.item.enchant));
  }
  s.counters.enchantMax = Math.max(s.counters.enchantMax, best);
  const c = ctx.counters && typeof ctx.counters === 'object' ? ctx.counters : {};
  // абсолютные значения со стороны (если их ведёт вызывающий): берём максимум, поэтому повтор не удваивает
  for (const k of COUNTER_KEYS) s.counters[k] = Math.max(s.counters[k], int(c[k]));
  for (const id of Array.isArray(ctx.evolutions) ? ctx.evolutions : []) {
    if (has(WEAPONS, id) && WEAPONS[id].evolved) s.evolutions[id] = 1;
  }
}

/**
 * Итог забега → новые ачивки. Награда только за впервые полученные (повтор того же забега ничего не даёт,
 * кроме счётчика medic: каждый забег — новые оживления).
 * @param {!Object} state
 * @param {*} run RunSummary (src/core/run-summary.js), нормализуется
 * @param {number=} at время получения (мс); без него 1
 * @return {{state: !Object, unlocked: !Array<string>, rewards: {wallet: !Object, bag: !Object}}}
 */
export function evaluateRun(state, run, at = 1) {
  const s = clone(normalizeAchievements(state) || emptyAchievements());
  const r = normalizeRunSummary(run);
  s.counters.medic += r.revives;
  if (r.won && has(HEROES, r.hero)) s.heroesWon[r.hero] = 1;
  for (const id of r.evolutionsGot) s.evolutions[id] = 1;
  return settle(s, r, null, at);
}

/**
 * Ачивки стеша, сумки, крафта и кодекса.
 * ctx: { stash: [item], bag: {cols, rows, items}, codex, enchantMax?, evolutions?: [id],
 *        bestiaryComplete?: boolean, uniquesOwned?: number,
 *        counters?: {disassembled, rerolls, broke, enchantMax, medic} — абсолютные (берётся максимум) }.
 * Счётчики крафта удобнее вести здесь же: bumpCounters(state, {disassembled: 1}) перед вызовом.
 * @return {{state: !Object, unlocked: !Array<string>, rewards: {wallet: !Object, bag: !Object}}}
 */
export function evaluateMeta(state, ctx = {}, at = 1) {
  const s = clone(normalizeAchievements(state) || emptyAchievements());
  absorbCtx(s, ctx || {});
  return settle(s, null, ctx || {}, at);
}

/**
 * Прогресс ачивки со счётчиком: {cur, max} или null (условие «да/нет» в одном забеге).
 * ctx как у evaluateMeta (для стеша и сумки), необязателен.
 */
export function achievementProgress(state, id, ctx = null) {
  if (!state || !known(id)) return null;
  const max = (v) => ({ cur: Math.min(v, target(id)), max: target(id) });
  switch (id) {
    case 'medic': return max(state.counters.medic);
    case 'recycler': return max(state.counters.disassembled);
    case 'chaos_alchemist': return max(state.counters.rerolls);
    case 'smith': return max(state.counters.enchantMax);
    case 'both_heroines': {
      const ids = Object.keys(HEROES);
      return { cur: ids.filter((h) => state.heroesWon[h]).length, max: ids.length };
    }
    case 'evolutionist': {
      const ids = evolvedIds();
      return { cur: ids.filter((e) => state.evolutions[e]).length, max: ids.length };
    }
    case 'collector': return ctx ? max(uniquesOwned(ctx)) : null;
    case 'diversity': return bagOf(ctx) ? max(bagTypes(bagOf(ctx))) : null;
    case 'hoarder': {
      const st = stashOf(ctx);
      return st ? { cur: Math.min(st.length, STASH.size), max: STASH.size } : null;
    }
    default: return null;
  }
}
