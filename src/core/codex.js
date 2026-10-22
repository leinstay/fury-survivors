// Кодекс: чистая логика без DOM. Трекер забега (события sim и кадры) и слияние итогов забега в кодекс.
// Хранение (localStorage, Firestore) в src/services/codex.js, показ в src/scenes/Codex.js.
//
// Кодекс (схема CODEX.version):
// {
//   v, id, nick,
//   seen: { weapon: {id: 1}, passive: {...}, enemy: {...}, boss: {...} },   // открытые записи
//   foes: { [enemyOrBossId]: { kills, elites, hits, taken, met } },        // свои убийства, удары по себе, встречи
//   totals: { runs: {solo, duo}, wins: {solo, duo}, time, dist, kills, damage, coins,
//             pickups: {kind: n}, best: {solo, duo}, heroes: {id: n} },
//   runs: [run, ...]                                                        // новые первыми, не больше CODEX.maxRuns
// }
// run: { at, mode: 'solo'|'duo', partner, hero, difficulty, status, time, level, kills, coins, score, dist,
//        damage: {weaponId: dmg}, held: {weaponId: s}, weapons: [[id, level]], passives: [[id, level]] }
// В коопе всё своё: свои убийства (kill.by), удары по себе, свои подборы и урон; увиденное — общее.
import { CODEX } from '../data/codex.js';
import { WEAPONS } from '../data/weapons.js';
import { PASSIVES } from '../data/passives.js';
import { ENEMIES } from '../data/enemies.js';
import { BOSSES } from '../data/bosses.js';

export const CODEX_KINDS = ['weapon', 'passive', 'enemy', 'boss'];
export const RUN_STATUSES = ['victory', 'dead', 'disconnected', 'quit'];
export const RUN_MODES = ['solo', 'duo'];
export const PICKUP_KINDS = ['xp', 'heal', 'magnet', 'coin', 'chest'];

const DEFS = { weapon: WEAPONS, passive: PASSIVES, enemy: ENEMIES, boss: BOSSES };
const ID_RE = new RegExp(`^[a-z0-9]{${CODEX.idLength}}$`);
const NICK_RE = /^[A-Za-z0-9]{0,6}$/;
const FOE_FIELDS = ['kills', 'elites', 'hits', 'taken', 'met'];

/** @return {boolean} id кодекса нужной формы ([a-z0-9], CODEX.idLength знаков) */
export function validCodexId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

/** Тип записи для id врага или босса: 'boss', 'enemy' или null (неизвестный). */
export function foeKind(id) {
  if (Object.prototype.hasOwnProperty.call(BOSSES, id)) return 'boss';
  if (Object.prototype.hasOwnProperty.call(ENEMIES, id)) return 'enemy';
  return null;
}

function known(kind, id) {
  const defs = DEFS[kind];
  return !!defs && typeof id === 'string' && Object.prototype.hasOwnProperty.call(defs, id);
}

function emptyTotals() {
  return {
    runs: { solo: 0, duo: 0 }, wins: { solo: 0, duo: 0 },
    time: 0, dist: 0, kills: 0, damage: 0, coins: 0, pickups: {},
    best: { solo: 0, duo: 0 }, heroes: {},
  };
}

/** Пустой кодекс. */
export function emptyCodex(id = '', nick = '') {
  return {
    v: CODEX.version, id, nick,
    seen: { weapon: {}, passive: {}, enemy: {}, boss: {} },
    foes: {}, totals: emptyTotals(), runs: [],
  };
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

function numMap(raw, keyOk = (k) => k.length <= 40) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of Object.keys(raw)) {
    const v = num(raw[k]);
    if (v > 0 && keyOk(k)) out[k] = v;
  }
  return out;
}

function levelList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((it) => Array.isArray(it) && typeof it[0] === 'string')
      .slice(0, 12).map((it) => [it[0].slice(0, 40), Math.max(1, Math.floor(num(it[1])))]);
}

/** Запись забега из чего угодно (localStorage, Firestore): лишнее отброшено, битое обнулено. */
export function normalizeRun(r) {
  if (!r || typeof r !== 'object') return null;
  return {
    at: num(r.at),
    mode: RUN_MODES.includes(r.mode) ? r.mode : 'solo',
    partner: str(r.partner, 12),
    hero: str(r.hero, 40),
    difficulty: str(r.difficulty, 40),
    status: RUN_STATUSES.includes(r.status) ? r.status : 'quit',
    time: num(r.time), level: Math.max(1, Math.floor(num(r.level))),
    kills: Math.floor(num(r.kills)),
    coins: Math.floor(num(r.coins)), score: Math.floor(num(r.score)), dist: num(r.dist),
    damage: numMap(r.damage), held: numMap(r.held),
    weapons: levelList(r.weapons), passives: levelList(r.passives),
  };
}

/**
 * Кодекс из сохранённых данных. null: не объект или схема новее нашей (не трогаем, чтобы не испортить).
 * @param {*} raw
 * @return {?Object}
 */
export function normalizeCodex(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.v === 'number' && raw.v > CODEX.version) return null;
  const c = emptyCodex(validCodexId(raw.id) ? raw.id : '',
      typeof raw.nick === 'string' && NICK_RE.test(raw.nick) ? raw.nick : '');
  const seen = raw.seen && typeof raw.seen === 'object' ? raw.seen : {};
  for (const kind of CODEX_KINDS) {
    const s = seen[kind];
    if (!s || typeof s !== 'object') continue;
    for (const id of Object.keys(s)) if (s[id] && known(kind, id)) c.seen[kind][id] = 1;
  }
  const foes = raw.foes && typeof raw.foes === 'object' ? raw.foes : {};
  for (const id of Object.keys(foes)) {
    if (!foeKind(id) || !foes[id] || typeof foes[id] !== 'object') continue;
    const f = {};
    for (const k of FOE_FIELDS) f[k] = num(foes[id][k]);
    c.foes[id] = f;
  }
  const t = raw.totals && typeof raw.totals === 'object' ? raw.totals : {};
  const pair = (o) => ({ solo: num(o && o.solo), duo: num(o && o.duo) });
  c.totals = {
    runs: pair(t.runs), wins: pair(t.wins),
    time: num(t.time), dist: num(t.dist), kills: num(t.kills),
    damage: num(t.damage), coins: num(t.coins),
    pickups: numMap(t.pickups, (k) => PICKUP_KINDS.includes(k)),
    best: pair(t.best), heroes: numMap(t.heroes),
  };
  c.runs = (Array.isArray(raw.runs) ? raw.runs : []).map(normalizeRun).filter(Boolean)
      .slice(0, CODEX.maxRuns);
  return c;
}

/** Открыта ли запись (видел на карточке, в сундуке, у себя; врага — рядом, босса — при появлении). */
export function isSeen(codex, kind, id) {
  return !!(codex && codex.seen[kind] && codex.seen[kind][id]);
}

/** Статус конца забега по sim: победа, смерть или потеря связи (lost). */
export function runStatus(sim, lost) {
  if (sim.state === 'victory') return 'victory';
  if (sim.state === 'gameover') return 'dead';
  return lost ? 'disconnected' : 'quit';
}

/**
 * Трекер одного забега. onEvents — события каждого тика (Game.handleEvents), observe — раз в кадр
 * (карточки, сундук, оружие в руках, шаги, враги рядом), finish — итог забега для mergeRun.
 * @param {{local: (number|undefined), coop: (boolean|undefined), partner: (string|undefined)}} o
 */
export function createRunTracker(o = {}) {
  return new RunTracker(o);
}

class RunTracker {
  constructor({ local = 0, coop = false, partner = '' } = {}) {
    this.local = local;
    this.coop = !!coop;
    this.partner = partner || '';
    this.seen = { weapon: {}, passive: {}, enemy: {}, boss: {} };
    this.foes = {};
    this.pickups = {};
    this.coins = 0;
    this.kills = 0;
    this.dist = 0;
    this.held = {};
    this.lastX = NaN;
    this.lastY = NaN;
    this.lastT = 0;
    this.scanT = 0;
    this.finished = false;
  }

  see(kind, id) {
    if (known(kind, id)) this.seen[kind][id] = 1;
  }

  foe(id) {
    let f = this.foes[id];
    if (!f) {
      f = { kills: 0, elites: 0, hits: 0, taken: 0, met: 0 };
      this.foes[id] = f;
    }
    return f;
  }

  seeCard(c) {
    if (c && (c.kind === 'weapon' || c.kind === 'passive')) this.see(c.kind, c.id);
  }

  onEvents(events) {
    if (this.finished) return;
    const me = this.local;
    for (const ev of events) {
      switch (ev.type) {
        case 'kill': {
          const kind = foeKind(ev.enemy);
          if (!kind) break;
          this.see(kind, ev.enemy);
          if (ev.by !== me) break;
          const f = this.foe(ev.enemy);
          f.kills++;
          if (ev.elite) f.elites++;
          this.kills++;
          break;
        }
        case 'playerHurt': {
          if (ev.player !== me) break;
          const kind = foeKind(ev.src);
          if (!kind) break;
          this.see(kind, ev.src);
          const f = this.foe(ev.src);
          f.hits++;
          f.taken += ev.amount || 0;
          break;
        }
        case 'bossSpawn':
          if (!foeKind(ev.boss)) break;
          this.see('boss', ev.boss);
          this.foe(ev.boss).met++;
          break;
        case 'pickup':
          if (ev.player !== me || !PICKUP_KINDS.includes(ev.kind)) break;
          this.pickups[ev.kind] = (this.pickups[ev.kind] || 0) + 1;
          if (ev.kind === 'coin') this.coins++;
          break;
        case 'chest':
          if (ev.player !== me) break;
          for (const it of ev.items || []) this.seeCard(it);
          break;
        default:
          break;
      }
    }
  }

  observe(sim) {
    if (this.finished) return;
    const p = sim.players[this.local];
    if (!p) return;
    if (!p.dead && Number.isFinite(this.lastX)) {
      const dx = p.x - this.lastX;
      const dy = p.y - this.lastY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= CODEX.maxJump) this.dist += d;
    }
    this.lastX = p.x;
    this.lastY = p.y;
    const dt = Math.max(0, sim.time - this.lastT);
    this.lastT = sim.time;
    for (const w of p.weapons) {
      this.held[w.id] = (this.held[w.id] || 0) + dt;
      this.see('weapon', w.id);
    }
    for (const it of p.passives) this.see('passive', it.id);
    if (sim.state === 'levelup' && sim.picker === this.local && p.levelUp) {
      for (const c of p.levelUp.cards) this.seeCard(c);
    }
    if (sim.state === 'chest' && sim.chest && sim.chest.player === this.local) {
      for (const c of sim.chest.cards) this.seeCard(c);
    }
    if (sim.time >= this.scanT) {
      this.scanT = sim.time + CODEX.scanEvery;
      const r2 = CODEX.seenRange * CODEX.seenRange;
      for (const e of sim.enemies) {
        if (e.dead) continue;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        if (dx * dx + dy * dy <= r2) this.see(e.boss ? 'boss' : 'enemy', e.type);
      }
    }
  }

  /**
   * Итог забега (один раз). null: уже закончен или выход в меню раньше CODEX.minQuitTime.
   * @param {!Object} sim
   * @param {{status: string, at: number, score: number}} o at — время конца (мс), score — как на экране итогов
   * @return {?{run: !Object, seen: !Object, foes: !Object, pickups: !Object}}
   */
  finish(sim, { status, at = 0, score = 0 }) {
    if (this.finished) return null;
    this.observe(sim);
    this.finished = true;
    if (status === 'quit' && sim.time < CODEX.minQuitTime) return null;
    const p = sim.players[this.local] || sim.player;
    const damage = {};
    for (const [id, v] of Object.entries(p.damageByWeapon || {})) {
      if (v > 0) damage[id] = Math.round(v);
    }
    const held = {};
    for (const [id, v] of Object.entries(this.held)) if (v > 0) held[id] = Math.round(v * 10) / 10;
    const run = normalizeRun({
      at, mode: this.coop ? 'duo' : 'solo', partner: this.coop ? this.partner : '',
      hero: p.hero, difficulty: sim.difficulty, status,
      time: Math.round(sim.time * 10) / 10, level: sim.player.level, kills: this.kills,
      coins: this.coop ? this.coins : sim.coins, score, dist: Math.round(this.dist),
      damage, held,
      weapons: p.weapons.map((w) => [w.id, w.level]),
      passives: p.passives.map((it) => [it.id, it.level]),
    });
    return { run, seen: this.seen, foes: this.foes, pickups: this.pickups };
  }
}

/**
 * Итог забега (RunTracker.finish) в кодекс: открытые записи, счётчики врагов, итоги, история.
 * @param {!Object} codex меняется на месте
 * @param {?Object} result
 * @return {!Object} codex
 */
export function mergeRun(codex, result) {
  if (!result || !result.run) return codex;
  const { run } = result;
  for (const kind of CODEX_KINDS) {
    for (const id of Object.keys((result.seen && result.seen[kind]) || {})) {
      if (known(kind, id)) codex.seen[kind][id] = 1;
    }
  }
  for (const [id, f] of Object.entries(result.foes || {})) {
    if (!foeKind(id)) continue;
    if (!codex.foes[id]) codex.foes[id] = { kills: 0, elites: 0, hits: 0, taken: 0, met: 0 };
    const c = codex.foes[id];
    for (const k of FOE_FIELDS) c[k] += num(f[k]);
  }
  const t = codex.totals;
  t.runs[run.mode]++;
  if (run.status === 'victory') t.wins[run.mode]++;
  t.time += run.time;
  t.dist += run.dist;
  t.kills += run.kills;
  t.coins += run.coins;
  for (const v of Object.values(run.damage)) t.damage += v;
  for (const [k, v] of Object.entries(result.pickups || {})) {
    if (PICKUP_KINDS.includes(k)) t.pickups[k] = (t.pickups[k] || 0) + num(v);
  }
  t.best[run.mode] = Math.max(t.best[run.mode], run.score);
  if (run.hero) t.heroes[run.hero] = (t.heroes[run.hero] || 0) + 1;
  codex.runs.unshift(run);
  if (codex.runs.length > CODEX.maxRuns) codex.runs.length = CODEX.maxRuns;
  return codex;
}

/** DPS оружия в забеге: урон за время, пока оружие было в руках (старые записи без held: за весь забег). */
export function weaponDps(run, id) {
  const s = run.held[id] || run.time;
  return s > 0 ? (run.damage[id] || 0) / s : 0;
}
