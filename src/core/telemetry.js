// Балансная телеметрия v2. Старые picks/snaps/end остаются читаемыми.
// Наблюдатель не расходует RNG и не меняет игровое состояние. Ника и IP нет.
import { BUILD } from '../data/build.js';
import { SIM } from '../data/constants.js';
import { TELEMETRY } from '../data/telemetry.js';

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const cardStr = (c) => (c ? `${c.kind}:${c.id || ''}:${c.level || ''}` : '');
const build = (p) => ({
  w: p.weapons.map((w) => [w.id, w.level]),
  p: p.passives.map((it) => [it.id, it.level]),
});

export function createTelemetry(o = {}) {
  return new Telemetry(o);
}

class Telemetry {
  constructor({ sim, local = 0, coop = false, sessionId = '', fingerprint = '',
    clock = () => null } = {}) {
    this.sim = sim;
    this.clock = clock;
    this.startedAt = clock();
    this.offerTimes = new Map();
    this.local = local;
    this.coop = !!coop;
    this.sessionId = sessionId;
    this.fingerprint = fingerprint;
    this.snaps = [];
    this.next = TELEMETRY.every;
    this.kills = 0;
    this.killsBy = {};
    this.combat = {};
    this.economy = { generatedXP: 0, pickedXP: 0 };
    this.blocks = {};
    this.targetHistory = new WeakMap();
    this.hurt = {};
    this.lastHurt = '';
    this.bosses = [];
    this.picks = [];
    this.decisions = [];
    this.offers = [];
    this.applications = [];
    this.inputs = [];
    this.movement = [];
    this.magnets = [];
    this.events = [];
    this.dropped = {};
    this.lastInput = '';
    this.nextMovement = 0;
    this.seq = 0;
    this.offerIds = new Map();
    this.levels = [0, 0];
    this.finished = false;
    this.initial = sim ? this.context(sim, local) : null;
    if (sim) sim.telemetryObservers.add(this);
  }

  append(key, value, limit) {
    if (this[key].length < limit) this[key].push(value);
    else this.dropped[key] = (this.dropped[key] || 0) + 1;
  }

  context(sim, who) {
    const p = sim.players[who];
    const lu = p.levelUp;
    return {
      ...build(p), hp: r1(p.hp), mhp: r1(p.maxHp), dead: p.dead,
      lv: sim.player.level, xp: r1(sim.player.xp), xpNext: sim.player.xpNext,
      budgets: [lu.rerolls, lu.skips, lu.banishes], banished: [...lu.banished],
    };
  }

  offer(sim, who, kind, cards) {
    if (this.finished) return;
    const id = ++this.seq;
    this.offerIds.set(`${who}:${kind}`, id);
    this.offerTimes.set(`${who}:${kind}`, this.clock());
    if (who !== this.local) return;
    this.append('offers', {
      id, t: r1(sim.time), tick: sim.frame, kind,
      cards: cards.map(cardStr), context: this.context(sim, who),
    }, TELEMETRY.maxOffers);
  }

  decision(sim, pk) {
    if (this.finished || pk.player !== this.local) return;
    const legacy = [r1(sim.time), pk.act, cardStr(pk.card), pk.offered.map(cardStr)];
    this.append('picks', legacy, TELEMETRY.maxDecisions);
    const kind = pk.act === 'evo' || pk.act === 'evoSkip' ? 'chest' : 'levelup';
    const offeredAt = this.offerTimes.get(`${this.local}:${kind}`);
    const now = this.clock();
    const voluntary = ['take', 'reroll', 'skip', 'banish', 'evo', 'evoSkip'].includes(pk.act);
    this.append('decisions', {
      id: ++this.seq, tick: sim.frame, pick: legacy,
      decisionMs: voluntary && now != null && offeredAt != null ?
        Math.max(0, Math.round(now - offeredAt)) : null,
      offerId: voluntary ?
        this.offerIds.get(`${this.local}:${kind}`) ?? null : null,
      // chest — уведомление ПОСЛЕ применения; application содержит состояние ДО выдачи.
      phase: pk.act === 'chest' ? 'after' : 'before',
      context: this.context(sim, this.local),
    }, TELEMETRY.maxDecisions);
  }

  application(sim, who, card) {
    if (this.finished || who !== this.local) return;
    const p = sim.players[who];
    this.append('applications', {
      id: ++this.seq, t: r1(sim.time), tick: sim.frame, card: cardStr(card),
      from: card.from ? card.from.slice() : [], before: this.context(sim, who),
      // Счётчики непосредственно перед заменой: урон исчезнувшей пушки не теряется.
      damage: this.damage(p),
    }, TELEMETRY.maxApplications);
  }

  hit(sim, target, by, weapon, raw, dealt, knockback) {
    if (this.finished) return;
    let history = this.targetHistory.get(target);
    if (!history || history.uid !== target.uid) {
      history = { uid: target.uid, attackers: new Set() };
      this.targetHistory.set(target, history);
    }
    if (target.hp <= 0 && by.id === this.local) this.economy.generatedXP += target.xp;
    const source = `${by.id}:${weapon}`;
    if (by.id === this.local) {
      const row = this.combat[weapon] || (this.combat[weapon] = {
        hits: 0, firstHits: 0, finishes: 0, dealt: 0, raw: 0, bossDamage: 0,
        knockbacks: 0, distanceHits: TELEMETRY.distanceBins.map(() => 0).concat(0),
        finishesAfter: {},
      });
      row.hits++;
      if (!history.attackers.size) row.firstHits++;
      row.dealt += dealt;
      row.raw += raw;
      if (target.boss) row.bossDamage += dealt;
      if (knockback > 0) row.knockbacks++;
      const distance = Math.hypot(target.x - by.x, target.y - by.y);
      const bin = TELEMETRY.distanceBins.findIndex((d) => distance <= d);
      row.distanceHits[bin < 0 ? TELEMETRY.distanceBins.length : bin]++;
      if (target.hp <= 0) {
        row.finishes++;
        for (const prior of history.attackers) {
          if (prior !== source) row.finishesAfter[prior] = (row.finishesAfter[prior] || 0) + 1;
        }
      }
    }
    history.attackers.add(source);
  }

  pickup(sim, pickup, by) {
    if (!this.finished && by.id === this.local && pickup.kind === 'magnet') {
      this.append('magnets', { t: r1(sim.time), tick: sim.frame, level: sim.player.level,
        groundXP: sim.pickups.filter((x) => x.kind === 'xp').reduce((n, x) => n + x.value, 0),
        pickedXP: this.economy.pickedXP }, TELEMETRY.maxEvents);
    }
    if (!this.finished && by.id === this.local && pickup.kind === 'xp') {
      this.economy.pickedXP += pickup.value;
    }
  }

  block(sim, projectile, shield) {
    if (this.finished || shield.ws?.owner?.id !== this.local) return;
    const weapon = shield.wid;
    const row = this.blocks[weapon] || (this.blocks[weapon] = { count: 0, interceptedRaw: 0 });
    row.count++;
    row.interceptedRaw = r1(row.interceptedRaw + projectile.dmg);
  }

  input(sim, input) {
    if (this.finished) return;
    const inputs = input && input.players ? input.players : [input];
    const vectors = sim.players.map((_, i) => {
      const v = inputs[i] || inputs[0] || {};
      return [v.x || 0, v.y || 0];
    });
    const key = JSON.stringify(vectors);
    if (key !== this.lastInput) {
      this.lastInput = key;
      // Номер активного тика, на котором ввод будет применён; значения не квантуются.
      this.append('inputs', [sim.frame + 1, ...vectors.flat()], TELEMETRY.maxInputChanges);
    }
  }

  afterStep(sim) {
    this.onEvents(sim.events, sim);
    this.observe(sim);
    if (this.finished || sim.time < this.nextMovement) return;
    this.nextMovement = sim.time + TELEMETRY.movementEvery;
    const p = sim.players[this.local];
    const near = (items, filter) => {
      let best = null;
      let distance = Infinity;
      for (const x of items) {
        if (!filter(x)) continue;
        const d = Math.hypot(x.x - p.x, x.y - p.y);
        if (d < distance) { best = x; distance = d; }
      }
      return best ? [best.type || best.kind || '', r1(best.x - p.x), r1(best.y - p.y),
        r1(best.vx || 0), r1(best.vy || 0)] : null;
    };
    this.append('movement', {
      tick: sim.frame, t: r1(sim.time), x: r1(p.x), y: r1(p.y),
      hp: r1(p.hp), dead: p.dead, lv: sim.player.level, xp: r1(sim.player.xp),
      enemy: near(sim.enemies, (e) => !e.dead && e.hp > 0),
      shot: near(sim.projectiles, (s) => s.owner === 'enemy'),
      xpDrop: near(sim.pickups, (s) => s.kind === 'xp'),
      heal: near(sim.pickups, (s) => s.kind === 'heal'),
      chest: near(sim.pickups, (s) => s.kind === 'chest'),
      threats: sim.telegraphs.map((x) => [r1(x.x - p.x), r1(x.y - p.y), x.radius, r2(x.t || 0)])
        .slice(0, 8),
      allies: sim.players.filter((x) => x.id !== this.local)
        .map((x) => [r1(x.x - p.x), r1(x.y - p.y), r1(x.hp), x.dead, r1(x.coffinT)]),
    }, TELEMETRY.maxMovementSamples);
  }

  onEvents(events, sim) {
    if (this.finished) return;
    const t = r1(sim.time);
    for (const ev of events) {
      if (ev.type === 'kill') {
        if (ev.boss) {
          const b = this.bosses.find((x) => x[0] === ev.enemy && x[2] < 0);
          if (b) b[2] = t;
        }
        if (ev.by === this.local) {
          this.kills++;
          if (ev.weapon) this.killsBy[ev.weapon] = (this.killsBy[ev.weapon] || 0) + 1;
        }
      } else if (ev.type === 'playerHurt' && ev.player === this.local) {
        this.hurt[ev.src || '?'] = r1((this.hurt[ev.src || '?'] || 0) + (ev.amount || 0));
        this.lastHurt = ev.src || '?';
      } else if (ev.type === 'bossSpawn') {
        this.bosses.push([ev.boss, t, -1]);
      }
      if (['playerHurt', 'playerDown', 'gameover', 'victory', 'revive',
        'bossSpawn', 'overtime', 'pickup'].includes(ev.type) ||
          (ev.type === 'kill' && ev.boss)) {
        if (ev.type === 'pickup' && ev.kind === 'xp') continue;
        this.append('events', {
          t, tick: sim.frame, type: ev.type, player: ev.player ?? ev.by ?? null,
          src: ev.src || ev.enemy || ev.boss || ev.kind || '', amount: ev.amount ?? null,
        }, TELEMETRY.maxEvents);
      }
    }
  }

  observe(sim) {
    if (this.finished) return;
    for (let lv = this.levels.length; lv <= sim.player.level; lv++) {
      this.levels[lv] = r1(sim.time);
    }
    while (sim.time >= this.next) {
      this.append('snaps', this.snap(sim, this.next), TELEMETRY.maxSnapshots);
      this.next += TELEMETRY.every;
    }
  }

  damage(p) {
    const ids = new Set([...Object.keys(p.damageByWeapon), ...Object.keys(p.rawByWeapon),
      ...Object.keys(p.hitsByWeapon), ...Object.keys(this.killsBy)]);
    return [...ids].map((id) => [id, Math.round(p.damageByWeapon[id] || 0),
      Math.round(p.rawByWeapon[id] || 0), p.hitsByWeapon[id] || 0, this.killsBy[id] || 0]);
  }

  snap(sim, t) {
    const p = sim.players[this.local] || sim.player;
    const st = p.stats || {};
    return {
      t: Math.round(t), tick: sim.frame, lv: sim.player.level, xp: Math.round(sim.player.xp),
      hp: Math.round(p.hp), mhp: Math.round(p.maxHp), dead: !!p.dead,
      economy: { ...this.economy,
        groundXP: sim.pickups.filter((x) => x.kind === 'xp').reduce((n, x) => n + x.value, 0) },
      en: sim.enemies.length - (sim.deadN || 0), k: this.kills,
      w: p.weapons.map((w) => [w.id, w.level, Math.round(p.damageByWeapon[w.id] || 0),
        Math.round(p.rawByWeapon[w.id] || 0), p.hitsByWeapon[w.id] || 0,
        this.killsBy[w.id] || 0]),
      p: p.passives.map((it) => [it.id, it.level]), damage: this.damage(p),
      combat: JSON.parse(JSON.stringify(this.combat)),
      blocks: JSON.parse(JSON.stringify(this.blocks)),
      // статы: первые 8 мест как в старых забегах (место 0 было atk, теперь steel), новые в конце
      s: [r2(st.steel ?? 1), r2(st.crit ?? 0), r2(st.haste ?? 1), Math.round(st.speed ?? 0),
        r2(st.luck ?? 1), r2(st.pickup ?? 1), r1(st.armor ?? 0), r1(st.regen ?? 0),
        r2(st.magic ?? 1), r2(st.critDmg ?? 0), r2(st.area ?? 1), r2(st.duration ?? 1),
        r2(st.xpGain ?? 1), r2(st.dodge ?? 0), r1(st.thorns ?? 0)],
    };
  }

  finish(sim, { status, score = 0, diagnostics = null }) {
    if (this.finished) return null;
    this.observe(sim);
    this.finished = true;
    if (this.sim) this.sim.telemetryObservers.delete(this);
    if (sim.time < TELEMETRY.minTime) return null;
    const p = sim.players[this.local] || sim.player;
    return {
      v: TELEMETRY.version, source: BUILD.source, sessionId: this.sessionId, local: this.local,
      seed: sim.seed, fingerprint: this.fingerprint, tickRate: SIM.tickRate,
      capture: { input: 'active-tick-changes', movementEvery: TELEMETRY.movementEvery,
        distanceBins: TELEMETRY.distanceBins.slice(),
        exactReplay: false, dropped: { ...this.dropped } },
      elapsedMs: this.startedAt == null ? null : Math.round(this.clock() - this.startedAt),
      initial: this.initial, mode: this.coop ? 'duo' : 'solo', hero: p.hero,
      heroes: sim.players.map((x) => x.hero), stage: sim.stage || 'forest',
      difficulty: sim.difficulty, status, time: r1(sim.time),
      terminal: { state: sim.state, picker: sim.picker, pendingLevels: sim.pendingLevels,
        resumeT: sim.resumeT, diagnostics: diagnostics ? structuredClone(diagnostics) : null },
      level: sim.player.level, kills: this.kills, score,
      economy: { ...this.economy }, won: sim.won, revives: p.revives, distance: r1(p.dist),
      overtime: sim.overtime >= 0 ? r1(sim.overtime) : -1,
      killedBy: status === 'dead' ? this.lastHurt : '', hurt: this.hurt, bosses: this.bosses,
      levels: this.levels, picks: this.picks, snaps: this.snaps, end: this.snap(sim, sim.time),
      decisions: this.decisions, offers: this.offers, applications: this.applications,
      inputs: this.inputs, movement: this.movement, events: this.events, magnets: this.magnets,
    };
  }
}
