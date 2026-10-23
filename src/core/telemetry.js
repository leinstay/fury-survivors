// Телеметрия забега для баланса: срез раз в TELEMETRY.every секунд сима, все выборы и итог. Без Phaser и DOM.
// Числа в срезах накопительные с начала забега (разницу между срезами считает разбор). По каждому оружию
// своего героя: [id, уровень, нанесено, замах, ударов, добил]. «Нанесено» — урон до нуля HP цели, «замах» —
// полный урон удара с перебором (оружие, которое не успело добить, не выглядит пустым).
// Выборы (picks): [время, действие, карточка, предложенные]; действие take | skip | reroll | banish
// (уровень), evo | evoSkip (сундук с супероружием), chest (что выпало из сундука), heal (лечение само).
// Карточка строкой 'kind:id:level'. levels[n] — время (с), когда достигнут уровень n.
import { TELEMETRY } from '../data/telemetry.js';

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const cardStr = (c) => (c ? `${c.kind}:${c.id || ''}:${c.level || ''}` : '');

export function createTelemetry(o = {}) {
  return new Telemetry(o);
}

class Telemetry {
  constructor({ local = 0, coop = false } = {}) {
    this.local = local;
    this.coop = !!coop;
    this.snaps = [];
    this.next = TELEMETRY.every;
    this.kills = 0;
    this.killsBy = {};
    this.hurt = {};
    this.lastHurt = '';
    this.bosses = [];
    this.picks = [];
    this.levels = [0, 0];
    this.finished = false;
  }

  onEvents(events, sim) {
    if (this.finished) return;
    const me = this.local;
    const t = r1(sim.time);
    for (const ev of events) {
      switch (ev.type) {
        case 'kill':
          if (ev.boss) {
            const b = this.bosses.find((x) => x[0] === ev.enemy && x[2] < 0);
            if (b) b[2] = t;
          }
          if (ev.by !== me) break;
          this.kills++;
          if (ev.weapon) this.killsBy[ev.weapon] = (this.killsBy[ev.weapon] || 0) + 1;
          break;
        case 'playerHurt':
          if (ev.player !== me) break;
          this.hurt[ev.src || '?'] = r1((this.hurt[ev.src || '?'] || 0) + (ev.amount || 0));
          this.lastHurt = ev.src || '?';
          break;
        case 'bossSpawn':
          this.bosses.push([ev.boss, t, -1]);
          break;
        default:
          break;
      }
    }
  }

  // Каждый кадр после шага сима: выборы из sim.pickLog, время новых уровней, срез раз в минуту.
  observe(sim) {
    if (this.finished) return;
    const t = r1(sim.time);
    for (const pk of sim.pickLog || []) {
      if (pk.player !== this.local) continue;
      this.picks.push([t, pk.act, cardStr(pk.card), pk.offered.map(cardStr)]);
    }
    if (sim.pickLog) sim.pickLog.length = 0;
    for (let lv = this.levels.length; lv <= sim.player.level; lv++) this.levels[lv] = t;
    while (sim.time >= this.next) {
      this.snaps.push(this.snap(sim, this.next));
      this.next += TELEMETRY.every;
    }
  }

  snap(sim, t) {
    const p = sim.players[this.local] || sim.player;
    const st = p.stats || {};
    const dealt = p.damageByWeapon || {};
    const raw = p.rawByWeapon || {};
    const hits = p.hitsByWeapon || {};
    return {
      t: Math.round(t), lv: sim.player.level, xp: Math.round(sim.player.xp),
      hp: Math.round(p.hp), mhp: Math.round(p.maxHp), dead: !!p.dead,
      en: sim.enemies.length - (sim.deadN || 0), k: this.kills,
      w: p.weapons.map((w) => [w.id, w.level, Math.round(dealt[w.id] || 0),
        Math.round(raw[w.id] || 0), hits[w.id] || 0, this.killsBy[w.id] || 0]),
      p: p.passives.map((it) => [it.id, it.level]),
      // atk, crit, haste, speed, luck, pickup, armor, regen
      s: [r2(st.atk ?? 1), r2(st.crit ?? 0), r2(st.haste ?? 1), Math.round(st.speed ?? 0),
        r2(st.luck ?? 1), r2(st.pickup ?? 1), r1(st.armor ?? 0), r1(st.regen ?? 0)],
    };
  }

  /**
   * Итог забега (один раз). null: уже закончен или забег короче TELEMETRY.minTime.
   * @param {!Object} sim
   * @param {{status: string, score: number}} o
   * @return {?Object}
   */
  finish(sim, { status, score = 0 }) {
    if (this.finished) return null;
    this.observe(sim);
    this.finished = true;
    if (sim.time < TELEMETRY.minTime) return null;
    const p = sim.players[this.local] || sim.player;
    return {
      mode: this.coop ? 'duo' : 'solo', hero: p.hero, heroes: sim.players.map((x) => x.hero),
      stage: sim.stage || 'forest', difficulty: sim.difficulty, status, time: r1(sim.time),
      level: sim.player.level, kills: this.kills, score,
      overtime: sim.overtime >= 0 ? r1(sim.overtime) : -1,
      killedBy: status === 'dead' ? this.lastHurt : '', hurt: this.hurt, bosses: this.bosses,
      levels: this.levels, picks: this.picks, snaps: this.snaps, end: this.snap(sim, sim.time),
    };
  }
}
