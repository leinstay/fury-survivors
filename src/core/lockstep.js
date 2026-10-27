// Lockstep для сетевого коопа. Оба клиента крутят одинаковую детерминированную симуляцию (core/sim.js, общий seed)
// по тикам фиксированного шага. Ввод каждого игрока на тик T применяется на тике T + delay у обоих, поэтому тик
// нельзя посчитать, пока не пришёл ввод напарника на него (advance возвращает false — «ждём»). Команды экранов
// (выбор карточки, сундук, пауза) идут тем же путём и применяются на одном тике у обоих. Раз в hashEvery тиков
// клиенты сравнивают хеш состояния: расхождение — событие onDesync. Без Phaser и DOM (тесты в Node).
import { BUILD } from '../data/build.js';
import * as CONSTANTS from '../data/constants.js';
import { createSim } from './sim.js';
import { HEROES, HERO_BASE } from '../data/heroes.js';
import { WEAPONS, WEAPON_BEHAVIOR } from '../data/weapons.js';
import { PASSIVES } from '../data/passives.js';
import { STATS, STAT_CAPS, STAT_CAPS_REL } from '../data/stats.js';
import { COMBOS } from '../data/combos.js';
import { ENEMIES } from '../data/enemies.js';
import { BOSS, BOSSES } from '../data/bosses.js';
import { PICKUPS } from '../data/pickups.js';
import { COOP } from '../data/coop.js';
import { DIFFICULTIES } from '../data/difficulty.js';
import { forest } from '../data/stages/forest.js';
import * as ITEMS from '../data/items.js';
import { createRng } from './rng.js';
import { rollItem, makeUnique, createBag, place } from './items.js';

const { NET } = CONSTANTS;

const IDLE = { x: 0, y: 0 };

// Хеш FNV-1a строки.
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Поля состояния для хеша: всё, что влияет на дальнейший ход (позиции, HP, RNG, враги). Пары [имя, значение]:
 * при рассинхроне клиенты печатают их в консоль, видно, что разошлось.
 * @param {!Object} sim
 * @return {!Array<!Array>}
 */
export function hashParts(sim) {
  const r = (v) => Math.round(v * 1000);
  const out = [['frame', sim.frame], ['time', r(sim.time)], ['kills', sim.kills], ['coins', sim.coins],
    ['state', sim.state], ['rng', sim.rng.state], ['uid', sim.uid], ['enemies', sim.enemies.length],
    ['projectiles', sim.projectiles.length], ['pickups', sim.pickups.length],
    ['pendingLevels', sim.pendingLevels], ['levelTurn', sim.levelTurn], ['picker', sim.picker],
    ['overtime', r(sim.overtime)], ['lootRng', sim.lootRng.state], ['bossKills', sim.bossKills]];
  for (const p of sim.players) {
    const lu = p.levelUp;
    const k = `p${p.id}.`;
    out.push([k + 'x', r(p.x)], [k + 'y', r(p.y)], [k + 'hp', r(p.hp)], [k + 'level', p.level],
        [k + 'xp', r(p.xp)], [k + 'dead', p.dead ? 1 : 0], [k + 'coffin', r(p.coffinT)],
        [k + 'rerolls', lu.rerolls], [k + 'skips', lu.skips], [k + 'banishes', lu.banishes],
        [k + 'banished', lu.banished.size], [k + 'picks', lu.picks],
        [k + 'weapons', p.weapons.map((w) => `${w.id}${w.level}`).join(' ')],
        [k + 'passives', p.passives.map((q) => `${q.id}${q.level}`).join(' ')],
        [k + 'bag', bagKey(p.bag)], [k + 'loot', lootKey(p.loot)]);
  }
  let ex = 0;
  let ey = 0;
  let eh = 0;
  for (const e of sim.enemies) {
    if (e.dead) continue;
    ex += e.x; ey += e.y; eh += e.hp;
  }
  out.push(['enemyX', r(ex)], ['enemyY', r(ey)], ['enemyHp', r(eh)]);
  // Жница с Библией: освящённые круги и песочные часы
  out.push(['holy', sim.holy.map((c) => `${r(c.x)},${r(c.y)}`).join(' ')],
      ['hourglasses', sim.hourglasses.map((h) => `${h.uid}@${r(h.x)},${r(h.y)}`).join(' ')]);
  return out;
}

// Сумка игрока одной строкой: предметы, место, поворот, заточка (лоадаут из лобби должен совпадать у обоих).
function bagKey(bag) {
  if (!bag) return '';
  return `${bag.cols}x${bag.rows}:` + bag.items.map((e) =>
    `${e.item.uid}@${e.x},${e.y}${e.rot ? 'r' : ''}+${e.item.enchant || 0}`).join(' ');
}

// Лут с боссов: uid предметов (или вид записи) и сердца по сундукам.
function lootKey(loot) {
  if (!loot) return '';
  return loot.map((c) => `${c.tier}:` + c.entries.map((e) => (e.item ? e.item.uid : e.kind)).join('.') +
    `:${c.hearts}`).join('|');
}

/**
 * @param {!Object} sim
 * @return {number}
 */
export function hashSim(sim) {
  return fnv(hashParts(sim).map((kv) => kv[1]).join(','));
}

/**
 * Отпечаток версии игры: хеш всех игровых данных (баланс, враги, этап, константы) и короткого забега на двоих
 * с фиксированным вводом (ловит изменения логики sim). Совпадает у двух клиентов только при одной версии:
 * лобби сравнивает его, иначе забег разошёлся бы сразу.
 * @param {boolean=} fresh посчитать заново (тесты меняют данные)
 * @return {number}
 */
let fingerprint = null; // считается один раз (~50 мс): меню и лобби берут готовый

export function simFingerprint(fresh = false) {
  if (fingerprint !== null && !fresh) return fingerprint;
  const data = JSON.stringify([BUILD, CONSTANTS, HEROES, HERO_BASE, WEAPONS, WEAPON_BEHAVIOR,
    PASSIVES, STATS, STAT_CAPS, STAT_CAPS_REL,
    COMBOS, ENEMIES, BOSS, BOSSES, PICKUPS, COOP, DIFFICULTIES, forest, ITEMS]);
  fingerprint = fnv(`${data}|${runFingerprint()}`);
  return fingerprint;
}

/**
 * Версия игры для показа: отпечаток шестью hex-символами (у двух игроков в лобби должна совпадать).
 * @return {string}
 */
export function versionTag() {
  return simFingerprint().toString(16).padStart(8, '0').slice(0, 6);
}

// Лоадауты для отпечатка: обычные предметы у первого, кости (уникалка с бросками) у второго.
function fingerprintLoadouts() {
  const rng = createRng(77);
  let a = createBag();
  a = place(a, rollItem(rng, 2, { type: 'gloves' }), 0, 0) || a;
  a = place(a, rollItem(rng, 3, { type: 'ring' }), 2, 0) || a;
  let b = createBag();
  b = place(b, makeUnique('dice', 2, 'fpdice'), 0, 0) || b;
  return [a, b];
}

function runFingerprint() {
  const sim = createSim({ seed: 20261022, players: 2, heroes: [], difficulty: 'cursed',
    loadouts: fingerprintLoadouts() });
  const dt = 1 / 60;
  for (let i = 0; i < 900; i++) {
    if (sim.state === 'levelup') sim.chooseCard(0, sim.picker);
    else if (sim.state === 'chest') sim.chooseChest(0);
    const a = i / 50;
    const p0 = { x: Math.sin(a), y: Math.cos(a) };
    sim.step(dt, { players: [p0, { x: -p0.y, y: p0.x }] });
    if (sim.state === 'gameover' || sim.state === 'victory') break;
  }
  sim._bossLoot({ type: 'kitsune_empress' }); // ролл лута с босса (rollChest, rollHearts)
  return hashSim(sim);
}

/**
 * Применить команду экрана к симуляции. who — индекс игрока, отправившего её: карточки выбирает только тот,
 * чей ход (из своего пула), сундук — тот, кому он достался; остальные команды общие.
 * @param {!Object} sim
 * @param {number} who
 * @param {{k: string, i: (number|undefined)}} cmd
 * @return {boolean} применена ли
 */
export function applyCommand(sim, who, cmd) {
  switch (cmd.k) {
    case 'card':
      if (!sim.choosing(who)) return false;
      sim.chooseCard(cmd.i, who);
      return true;
    case 'reroll':
      return sim.reroll(who);
    case 'skip':
      return sim.skip(who);
    case 'banish':
      return sim.banish(cmd.i, who);
    case 'chest':
      if (sim.state !== 'chest' || sim.chest.player !== who) return false;
      sim.chooseChest(cmd.i);
      return true;
    case 'skipChest':
      if (sim.state !== 'chest' || sim.chest.player !== who) return false;
      sim.skipChest();
      return true;
    case 'revealDone':
      if (sim.state !== 'reveal' || sim.chest.player !== who) return false;
      sim.endReveal();
      return true;
    case 'finish':
      sim.finishOvertime();
      return true;
    default:
      return false;
  }
}

/**
 * @param {{sim: !Object, local: number, send: function(!Object), delay: (number|undefined),
 *     hashEvery: (number|undefined), onDesync: (function(number, number, number)|undefined)}} o
 *     send(msg) — отправить напарнику; onDesync(tick, mine, theirs) при расхождении хешей
 * @return {!Lockstep}
 */
export function createLockstep(o) {
  return new Lockstep(o);
}

class Lockstep {
  constructor(o) {
    this.sim = o.sim;
    this.local = o.local;
    this.remote = 1 - o.local;
    this.send = o.send;
    this.delay = o.delay === undefined ? NET.inputDelay : o.delay;
    this.hashEvery = o.hashEvery === undefined ? NET.hashEvery : o.hashEvery;
    this.onDesync = o.onDesync || null; // (tick, mine, theirs, parts) — parts: hashParts на этом тике
    this.partsAt = new Map();      // тик -> свои hashParts, пока хеш напарника не сошёлся (для отчёта)
    this.tick = 0;                 // следующий тик к расчёту
    this.inputs = [new Map(), new Map()]; // по игрокам: тик -> { x, y }
    this.cmds = new Map();         // тик -> [{ who, cmd }]
    this.hashes = new Map();       // тик -> хеш: свой, пока не пришёл чужой, или чужой, пока не посчитан свой
    this.paused = false;           // пауза общая: тики идут (нужны команде resume), сим не шагает
    this.desynced = false;
    this.waitT = 0;                // с подряд в ожидании ввода напарника
    this.lastRemoteT = 0;          // время по монотонным часам (сек), когда пришло последнее сообщение
    this.pendingCmds = [];         // свои команды, ждущие отправки с ближайшим вводом
    this.remoteMax = this.delay - 1; // последний тик, на который пришёл ввод напарника
    this.remoteAdv = 0;            // опережение напарника (его advantage()), приходит с его вводом
    // первые delay тиков обоих ничем не заняты: ввод на них пустой
    for (let t = 0; t < this.delay; t++) {
      this.inputs[0].set(t, IDLE);
      this.inputs[1].set(t, IDLE);
    }
  }

  /** Команда экрана: уйдёт напарнику и применится на одном тике у обоих. */
  command(cmd) {
    this.pendingCmds.push(cmd);
  }

  // Квантование ввода: оба клиента применяют ровно те же числа, что ушли по сети.
  _quant(input) {
    const q = NET.inputPrecision;
    const x = Math.round((input && input.x ? input.x : 0) * q) / q;
    const y = Math.round((input && input.y ? input.y : 0) * q) / q;
    return x === 0 && y === 0 ? IDLE : { x, y };
  }

  /**
   * Один тик: записать свой ввод на tick + delay (если ещё не записан) и, если ввод напарника на tick уже есть,
   * применить команды и шагнуть симуляцию.
   * @param {{x: number, y: number}} input свой ввод
   * @param {number} dt шаг тика, с
   * @param {number=} now монотонные часы, с (для таймаутов)
   * @return {boolean} true, если тик посчитан; false — ждём напарника
   */
  advance(input, dt, now = 0) {
    const at = this.tick + this.delay;
    const mine = this.inputs[this.local];
    if (!mine.has(at)) {
      const inp = this._quant(input);
      mine.set(at, inp);
      const msg = { t: at, x: inp.x, y: inp.y, a: this.advantage() };
      if (this.pendingCmds.length) {
        msg.c = this.pendingCmds;
        this._addCmds(at, this.local, this.pendingCmds);
        this.pendingCmds = [];
      }
      this.send(msg);
    }
    const theirs = this.inputs[this.remote].get(this.tick);
    if (!theirs) { this.waitT += dt; return false; }
    this.waitT = 0;
    const t = this.tick;
    const list = this.cmds.get(t);
    if (list) {
      list.sort((a, b) => a.who - b.who); // порядок одинаковый у обоих: сначала игрок 0
      for (const c of list) {
        if (c.cmd.k === 'pause') {
          // Escape мог быть отправлен до levelup/chest и приехать уже после выбора.
          // В resume пауза остановила бы таймер, а экран Pause там не открывается.
          if (this.sim.state === 'running') this.paused = true;
        }
        else if (c.cmd.k === 'resume' && this.paused) {
          this.paused = false;
          this.sim.resumeDelay(); // мир трогается через SIM.resumeDelay, как после выбора карточки
        }
        else applyCommand(this.sim, c.who, c.cmd);
      }
      this.cmds.delete(t);
    }
    if (!this.paused) {
      this.sim.step(dt, { players: [this.inputs[0].get(t), this.inputs[1].get(t)] });
    }
    this.inputs[0].delete(t);
    this.inputs[1].delete(t);
    this.tick = t + 1;
    if (this.hashEvery > 0 && this.tick % this.hashEvery === 0) this._hash(this.tick);
    return true;
  }

  _addCmds(t, who, cmds) {
    let list = this.cmds.get(t);
    if (!list) { list = []; this.cmds.set(t, list); }
    for (const cmd of cmds) list.push({ who, cmd });
  }

  _hash(t) {
    const parts = hashParts(this.sim);
    const h = fnv(parts.map((kv) => kv[1]).join(','));
    this.partsAt.set(t, parts);
    this.partsAt.delete(t - this.hashEvery * 8); // старые не держим
    const theirs = this.hashes.get(t);
    if (theirs !== undefined) {
      this.hashes.delete(t);
      this._compare(t, h, theirs);
    } else {
      this.hashes.set(t, h);
    }
    this.send({ h: t, v: h });
  }

  _compare(t, mine, theirs) {
    if (mine === theirs) { this.partsAt.delete(t); return; }
    if (this.desynced) return;
    this.desynced = true;
    if (this.onDesync) this.onDesync(t, mine, theirs, this.partsAt.get(t) || null);
  }

  /**
   * Сообщение от напарника: ввод { t, x, y, c? } или хеш { h, v }.
   * @param {!Object} msg
   * @param {number=} now монотонные часы, с
   */
  receive(msg, now = 0) {
    this.lastRemoteT = now;
    if (msg.h !== undefined) {
      const mine = this.hashes.get(msg.h);
      if (mine !== undefined) {
        this.hashes.delete(msg.h);
        this._compare(msg.h, mine, msg.v);
      } else {
        this.hashes.set(msg.h, msg.v);
      }
      return;
    }
    if (typeof msg.t !== 'number' || msg.t < this.tick) return;
    const q = NET.inputPrecision;
    const x = Math.round((+msg.x || 0) * q) / q;
    const y = Math.round((+msg.y || 0) * q) / q;
    this.inputs[this.remote].set(msg.t, x === 0 && y === 0 ? IDLE : { x, y });
    if (msg.t > this.remoteMax) this.remoteMax = msg.t;
    if (Number.isFinite(msg.a)) this.remoteAdv = msg.a;
    if (Array.isArray(msg.c) && msg.c.length) this._addCmds(msg.t, this.remote, msg.c);
  }

  /**
   * Насколько мой тик впереди последнего известного тика напарника (его тик = последний ввод - delay).
   * При равных часах это задержка сети в тиках у обоих; разница с напарником — рассинхрон часов.
   * @return {number}
   */
  advantage() {
    return this.tick - (this.remoteMax - this.delay);
  }

  /**
   * На сколько тиков мои часы впереди напарника: (моё опережение - его) / 2. Больше нуля — мне притормозить,
   * иначе я упираюсь в его ввод и стою (рывки), а он потом догоняет.
   * @return {number}
   */
  drift() {
    return (this.advantage() - this.remoteAdv) / 2;
  }

  /**
   * Сдвиг своего игрока за ввод, который уже отправлен, но ещё не применён (delay тиков вперёд). Рендер
   * рисует своего героя с этим сдвигом: управление откликается сразу, сим не меняется (при применении
   * ввода сим приходит туда же, расходится только в упоре в напарника).
   * @param {number} speed px/с
   * @param {number} dt шаг тика
   * @return {{x: number, y: number, face: number}} face: 1 / -1 по последнему вводу с горизонталью, 0 — нет
   */
  predictOffset(speed, dt) {
    let x = 0;
    let y = 0;
    let face = 0;
    const mine = this.inputs[this.local];
    for (let t = this.tick; t < this.tick + this.delay; t++) {
      const inp = mine.get(t);
      if (!inp) continue;
      const len = Math.sqrt(inp.x * inp.x + inp.y * inp.y);
      if (len <= 0.05) continue;
      const k = (len > 1 ? 1 / len : 1) * speed * dt;
      x += inp.x * k;
      y += inp.y * k;
      if (inp.x > 0.05) face = 1; else if (inp.x < -0.05) face = -1;
    }
    return { x, y, face };
  }

  /** Сколько секунд напарник молчит. */
  silence(now) {
    return now - this.lastRemoteT;
  }
}
