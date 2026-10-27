// Итог забега для ачивок: чистая логика без Phaser и DOM. Трекер смотрит на sim так же, как трекер
// кодекса (src/core/codex.js): onEvents — события каждого тика, observe — раз в кадр, finish — итог.
// Sim не меняется и не подписывается: всё, для чего нет события, считается по состоянию в кадре.
// Проверка ачивок по итогу — src/core/achievements.js (evaluateRun).
//
// Итог забега (RunSummary), всё про своего игрока (local), кроме anyoneFell:
// {
//   won: boolean,             // победа (в т.ч. смерть в овертайме)
//   time: number,             // с сима
//   hero: string, coop: boolean, stage: string, difficulty: string,
//   bossesKilled: [{id, hp}], // боссы, убитые в забеге (кем угодно), по порядку; hp — доля HP своего
//                             //   героя в момент убийства (0, если лежит в гробу)
//   reaperKilled: boolean,    // убита Жница (ACHIEVEMENTS.reaper_slayer.boss)
//   foodPicked: number,       // своя подобранная еда (kind heal)
//   weaponsAtDryadKill: number,  // своё оружие и пассивки в момент убийства ACHIEVEMENTS.monogamy.boss;
//   passivesAtDryadKill: number, //   −1, если не убита
//   untouchableMax: number,   // с: самая длинная серия без урона по себе, пока живых врагов ≥
//                             //   ACHIEVEMENTS.untouchable.enemies (время с меньшим числом врагов и в гробу
//                             //   серию не обрывает, но и не идёт; обрывает только удар)
//   xpPickedBefore120: number,   // свои подобранные кристаллы опыта до ACHIEVEMENTS.ascetic.seconds
//   rerolls, skips, banishes: number,  // свои использованные на карточках уровня
//   revives: number,          // напарник встал из гроба, пока свой герой стоял рядом (COOP.allyRadius)
//   anyoneFell: boolean,      // кто-то лёг в гроб или забег кончился смертью
//   maxMagnetGems: number,    // больше всего кристаллов опыта на земле в момент своего подбора магнита
//   maxKillsPerMinute: number,   // свои убийства в скользящем окне ACHIEVEMENTS.meat_grinder.seconds
//   evolutionsGot: [id],      // эволюции (evolved в weapons.js), что были у своего героя
// }
import { ACHIEVEMENTS } from '../data/achievements.js';
import { WEAPONS } from '../data/weapons.js';
import { COOP } from '../data/coop.js';

const REAPER = ACHIEVEMENTS.reaper_slayer.boss;
const DRYAD = ACHIEVEMENTS.monogamy.boss;
const CROWD = ACHIEVEMENTS.untouchable.enemies;
const ASCETIC_T = ACHIEVEMENTS.ascetic.seconds;
const KILL_WINDOW = Math.max(1, Math.round(ACHIEVEMENTS.meat_grinder.seconds));

const isEvolved = (id) => typeof id === 'string' &&
  Object.prototype.hasOwnProperty.call(WEAPONS, id) && !!WEAPONS[id].evolved;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const int = (v) => Math.floor(num(v));
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const r4 = (v) => Math.round(v * 1e4) / 1e4;

/** Пустой итог забега (все поля на месте). */
export function emptyRunSummary() {
  return {
    won: false, time: 0, hero: '', coop: false, stage: '', difficulty: '',
    bossesKilled: [], reaperKilled: false, foodPicked: 0,
    weaponsAtDryadKill: -1, passivesAtDryadKill: -1,
    untouchableMax: 0, xpPickedBefore120: 0,
    rerolls: 0, skips: 0, banishes: 0, revives: 0, anyoneFell: false,
    maxMagnetGems: 0, maxKillsPerMinute: 0, evolutionsGot: [],
  };
}

/**
 * Итог забега из чего угодно: неизвестное отброшено, битое обнулено.
 * @param {*} raw
 * @return {!Object} RunSummary
 */
export function normalizeRunSummary(raw) {
  const s = emptyRunSummary();
  if (!raw || typeof raw !== 'object') return s;
  s.won = raw.won === true;
  s.time = num(raw.time);
  s.hero = str(raw.hero, 40);
  s.coop = raw.coop === true;
  s.stage = str(raw.stage, 40);
  s.difficulty = str(raw.difficulty, 40);
  s.bossesKilled = (Array.isArray(raw.bossesKilled) ? raw.bossesKilled : [])
      .filter((b) => b && typeof b === 'object' && typeof b.id === 'string')
      .slice(0, 16).map((b) => ({ id: b.id.slice(0, 40), hp: Math.min(1, num(b.hp)) }));
  s.reaperKilled = raw.reaperKilled === true;
  s.foodPicked = int(raw.foodPicked);
  const atKill = (v) => (Number.isInteger(v) && v >= 0 ? v : -1);
  s.weaponsAtDryadKill = atKill(raw.weaponsAtDryadKill);
  s.passivesAtDryadKill = atKill(raw.passivesAtDryadKill);
  s.untouchableMax = num(raw.untouchableMax);
  s.xpPickedBefore120 = int(raw.xpPickedBefore120);
  s.rerolls = int(raw.rerolls);
  s.skips = int(raw.skips);
  s.banishes = int(raw.banishes);
  s.revives = int(raw.revives);
  s.anyoneFell = raw.anyoneFell === true;
  s.maxMagnetGems = int(raw.maxMagnetGems);
  s.maxKillsPerMinute = int(raw.maxKillsPerMinute);
  s.evolutionsGot = [...new Set((Array.isArray(raw.evolutionsGot) ? raw.evolutionsGot : [])
      .filter(isEvolved))];
  return s;
}

/**
 * Трекер итога забега для ачивок.
 * @param {{local: (number|undefined), coop: (boolean|undefined)}=} o local — индекс своего игрока
 * @return {!RunSummaryTracker}
 */
export function createRunSummaryTracker(o = {}) {
  return new RunSummaryTracker(o);
}

class RunSummaryTracker {
  constructor({ local = 0, coop = false } = {}) {
    this.local = local;
    this.coop = !!coop;
    this.s = emptyRunSummary();
    this.s.coop = this.coop;
    this.t = 0;            // время сима последнего кадра или тика
    this.hpFrac = 1;       // доля HP своего героя в последнем кадре
    this.streak = 0;       // текущая серия без урона в толпе
    this.last = null;      // остатки reroll/skip/banish в прошлом кадре
    this.helped = {};      // id напарника → свой герой стоял у его гроба
    this.evo = new Set();
    // скользящее окно своих убийств: ring[сек % окно], sum — сумма за окно
    this.ring = new Array(KILL_WINDOW).fill(0);
    this.ringSec = -1;
    this.ringSum = 0;
    this.finished = false;
  }

  me(sim) {
    return sim ? sim.players[this.local] || null : null;
  }

  // Время события: sim.time, если sim передан, иначе последний кадр.
  now(sim) {
    return sim && typeof sim.time === 'number' ? sim.time : this.t;
  }

  addKill(t) {
    const sec = Math.floor(t);
    if (this.ringSec < 0) this.ringSec = sec;
    if (sec > this.ringSec) {
      const steps = Math.min(sec - this.ringSec, KILL_WINDOW);
      for (let i = 1; i <= steps; i++) {
        const k = (this.ringSec + i) % KILL_WINDOW;
        this.ringSum -= this.ring[k];
        this.ring[k] = 0;
      }
      this.ringSec = sec;
    }
    this.ring[this.ringSec % KILL_WINDOW]++;
    this.ringSum++;
    if (this.ringSum > this.s.maxKillsPerMinute) this.s.maxKillsPerMinute = this.ringSum;
  }

  noteWeapons(p) {
    for (const w of p.weapons) if (isEvolved(w.id)) this.evo.add(w.id);
  }

  /**
   * События тика (sim.events). sim необязателен, но с ним точнее: HP в момент убийства босса,
   * оружие при убийстве Дриады, кристаллы на земле при магните, рядом ли свой герой при оживлении.
   */
  onEvents(events, sim = null) {
    if (this.finished) return;
    const me = this.local;
    const s = this.s;
    for (const ev of events) {
      switch (ev.type) {
        case 'kill': {
          if (ev.by === me) this.addKill(this.now(sim));
          if (!ev.boss) break;
          const p = this.me(sim);
          const hp = p ? (p.dead || !(p.maxHp > 0) ? 0 : p.hp / p.maxHp) : this.hpFrac;
          s.bossesKilled.push({ id: String(ev.enemy), hp: r4(Math.max(0, Math.min(1, hp))) });
          if (ev.enemy === REAPER) s.reaperKilled = true;
          if (ev.enemy === DRYAD && p && s.weaponsAtDryadKill < 0) {
            s.weaponsAtDryadKill = p.weapons.length;
            s.passivesAtDryadKill = p.passives.length;
          }
          break;
        }
        case 'playerHurt':
          if (ev.player === me) this.streak = 0;
          break;
        case 'playerDown':
        case 'gameover':
          s.anyoneFell = true;
          break;
        case 'revive': {
          if (ev.player === me) break;
          const p = this.me(sim);
          let near = !!this.helped[ev.player];
          if (!near && p && !p.dead) {
            const dx = p.x - ev.x;
            const dy = p.y - ev.y;
            near = dx * dx + dy * dy <= COOP.allyRadius * COOP.allyRadius;
          }
          if (near) s.revives++;
          this.helped[ev.player] = false;
          break;
        }
        case 'pickup':
          if (ev.player !== me) break;
          if (ev.kind === 'heal') s.foodPicked++;
          else if (ev.kind === 'xp' && this.now(sim) < ASCETIC_T) s.xpPickedBefore120++;
          else if (ev.kind === 'magnet' && sim) {
            let n = 0;
            for (const pk of sim.pickups) if (pk.kind === 'xp' && !pk.gone) n++;
            if (n > s.maxMagnetGems) s.maxMagnetGems = n;
          }
          break;
        default:
          break;
      }
    }
  }

  /** Раз в кадр: серия без урона, reroll/skip/banish, гробы напарников, эволюции. */
  observe(sim) {
    if (this.finished) return;
    const p = this.me(sim);
    if (!p) return;
    const dt = Math.max(0, sim.time - this.t);
    this.t = sim.time;
    this.hpFrac = p.dead || !(p.maxHp > 0) ? 0 : p.hp / p.maxHp;
    const alive = sim.enemies.length - (sim.deadN || 0);
    if (!p.dead && alive >= CROWD) {
      this.streak += dt;
      if (this.streak > this.s.untouchableMax) this.s.untouchableMax = this.streak;
    }
    const lu = p.levelUp;
    if (lu) {
      if (this.last) {
        this.s.rerolls += Math.max(0, this.last.rerolls - lu.rerolls);
        this.s.skips += Math.max(0, this.last.skips - lu.skips);
        this.s.banishes += Math.max(0, this.last.banishes - lu.banishes);
      }
      this.last = { rerolls: lu.rerolls, skips: lu.skips, banishes: lu.banishes };
    }
    if (!p.dead) {
      const r2 = COOP.allyRadius * COOP.allyRadius;
      for (const o of sim.players) {
        if (o === p || !o.dead) continue;
        const dx = o.x - p.x;
        const dy = o.y - p.y;
        if (dx * dx + dy * dy <= r2) this.helped[o.id] = true;
      }
    }
    this.noteWeapons(p);
  }

  /**
   * Итог забега (один раз; дальше null).
   * @param {!Object} sim
   * @param {{status: (string|undefined)}=} o status как у кодекса ('victory' | 'dead' | ...)
   * @return {?Object} RunSummary
   */
  finish(sim, { status = '' } = {}) {
    if (this.finished) return null;
    this.observe(sim);
    this.finished = true;
    const p = this.me(sim) || sim.player;
    const s = this.s;
    s.won = status === 'victory' || sim.state === 'victory';
    s.time = num(sim.time);
    s.hero = (p && p.hero) || '';
    s.stage = sim.stage || '';
    s.difficulty = sim.difficulty || '';
    if (sim.state === 'gameover') s.anyoneFell = true;
    s.untouchableMax = Math.round(s.untouchableMax * 10) / 10;
    if (p) this.noteWeapons(p);
    s.evolutionsGot = [...this.evo];
    return normalizeRunSummary(s);
  }
}
