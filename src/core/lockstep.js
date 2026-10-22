// Lockstep для сетевого коопа. Оба клиента крутят одинаковую детерминированную симуляцию (core/sim.js, общий seed)
// по тикам фиксированного шага. Ввод каждого игрока на тик T применяется на тике T + delay у обоих, поэтому тик
// нельзя посчитать, пока не пришёл ввод напарника на него (advance возвращает false — «ждём»). Команды экранов
// (выбор карточки, сундук, пауза) идут тем же путём и применяются на одном тике у обоих. Раз в hashEvery тиков
// клиенты сравнивают хеш состояния: расхождение — событие onDesync. Без Phaser и DOM (тесты в Node).
import { NET } from '../data/constants.js';

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
 * Хеш состояния симуляции: всё, что влияет на дальнейший ход (позиции, HP, RNG, враги).
 * @param {!Object} sim
 * @return {number}
 */
export function hashSim(sim) {
  const r = (v) => Math.round(v * 1000);
  const parts = [sim.frame, r(sim.time), sim.kills, sim.coins, sim.state, sim.rng.state, sim.uid,
    sim.enemies.length, sim.projectiles.length, sim.pickups.length, sim.pendingLevels,
    sim.levelTurn, sim.levelUp.rerolls, sim.levelUp.skips, sim.levelUp.banishes, sim.banished.size,
    r(sim.overtime)];
  for (const p of sim.players) {
    parts.push(r(p.x), r(p.y), r(p.hp), p.level, r(p.xp), p.dead ? 1 : 0, r(p.coffinT));
    for (const w of p.weapons) parts.push(w.id, w.level);
    for (const q of p.passives) parts.push(q.id, q.level);
  }
  let ex = 0;
  let ey = 0;
  let eh = 0;
  for (const e of sim.enemies) {
    if (e.dead) continue;
    ex += e.x; ey += e.y; eh += e.hp;
  }
  parts.push(r(ex), r(ey), r(eh));
  return fnv(parts.join(','));
}

/**
 * Применить команду экрана к симуляции. who — индекс игрока, отправившего её: карточки выбирает только тот,
 * чей ход, сундук — тот, кому он достался; остальные команды общие.
 * @param {!Object} sim
 * @param {number} who
 * @param {{k: string, i: (number|undefined)}} cmd
 * @return {boolean} применена ли
 */
export function applyCommand(sim, who, cmd) {
  switch (cmd.k) {
    case 'card':
      if (sim.state !== 'levelup' || sim.levelUp.player !== who) return false;
      sim.chooseCard(cmd.i);
      return true;
    case 'reroll':
      if (sim.state !== 'levelup' || sim.levelUp.player !== who) return false;
      return sim.reroll();
    case 'skip':
      if (sim.state !== 'levelup' || sim.levelUp.player !== who) return false;
      return sim.skip();
    case 'banish':
      if (sim.state !== 'levelup' || sim.levelUp.player !== who) return false;
      return sim.banish(cmd.i);
    case 'chest':
      if (sim.state !== 'chest' || sim.chest.player !== who) return false;
      sim.chooseChest(cmd.i);
      return true;
    case 'skipChest':
      if (sim.state !== 'chest' || sim.chest.player !== who) return false;
      sim.skipChest();
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
    this.onDesync = o.onDesync || null;
    this.tick = 0;                 // следующий тик к расчёту
    this.inputs = [new Map(), new Map()]; // по игрокам: тик -> { x, y }
    this.cmds = new Map();         // тик -> [{ who, cmd }]
    this.hashes = new Map();       // тик -> хеш: свой, пока не пришёл чужой, или чужой, пока не посчитан свой
    this.paused = false;           // пауза общая: тики идут (нужны команде resume), сим не шагает
    this.desynced = false;
    this.waitT = 0;                // с подряд в ожидании ввода напарника
    this.lastRemoteT = 0;          // время по монотонным часам (сек), когда пришло последнее сообщение
    this.pendingCmds = [];         // свои команды, ждущие отправки с ближайшим вводом
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
      const msg = { t: at, x: inp.x, y: inp.y };
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
        if (c.cmd.k === 'pause') this.paused = true;
        else if (c.cmd.k === 'resume') this.paused = false;
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
    const h = hashSim(this.sim);
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
    if (mine === theirs || this.desynced) return;
    this.desynced = true;
    if (this.onDesync) this.onDesync(t, mine, theirs);
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
    if (Array.isArray(msg.c) && msg.c.length) this._addCmds(msg.t, this.remote, msg.c);
  }

  /** Сколько секунд напарник молчит. */
  silence(now) {
    return now - this.lastRemoteT;
  }
}
