import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { COMBAT, SIM } from '../../src/data/constants.js';
import { WEAPONS, WEAPON_BEHAVIOR } from '../../src/data/weapons.js';
import * as UP from '../../src/core/upgrades.js';

export function sourceHash() {
  const hash = createHash('sha256');
  const visit = (path) => {
    for (const item of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name))) {
      const file = `${path}/${item.name}`;
      if (item.isDirectory()) visit(file);
      else if (/\.(js|mjs)$/.test(file)) hash.update(file).update(readFileSync(file));
    }
  };
  visit('src/core'); visit('src/data'); visit('src/behaviors'); visit('tools/simulation');
  return hash.digest('hex');
}

// Detailed replay checksum, including individual entities and timers. Grid/pools are derived caches.
export function stateHash(sim) {
  const skip = new Set(['telemetryObservers', 'grid', 'pgrid', 'qbuf', 'qbuf2', 'events',
    'pickLog', 'enemyPool', 'projPool', 'heroDef', 'stageDef', 'def', 'beh', 'bk', 'params',
    'roads', 'stats']);
  const seen = new Map();
  const walk = (x, path) => {
    if (typeof x === 'function' || x === undefined) return null;
    if (!x || typeof x !== 'object') return x;
    if (seen.has(x)) return { ref: seen.get(x) };
    seen.set(x, path);
    if (x instanceof Set) return [...x].map((v, i) => walk(v, `${path}/${i}`));
    if (x instanceof Map) return [...x].map(([k, v], i) => [k, walk(v, `${path}/${i}`)]);
    if (ArrayBuffer.isView(x)) return [...x];
    if (Array.isArray(x)) return x.map((v, i) => walk(v, `${path}/${i}`));
    const result = {};
    for (const k of Object.keys(x).sort()) if (!skip.has(k)) result[k] = walk(x[k], `${path}/${k}`);
    if (path === '$/rng') result.state = x.state;
    return result;
  };
  return createHash('sha256').update(JSON.stringify(walk(sim, '$'))).digest('hex');
}

export function installImmortality(sim, mask = []) {
  const interventions = [];
  const hurt = sim.hurtPlayer.bind(sim);
  sim.hurtPlayer = (raw, p = sim.player, src = '') => {
    const eligible = mask[p.id] && sim.state === 'running' && !p.dead && p.iframes <= 0;
    const lethal = eligible && Math.max(COMBAT.armorMinDamage, raw - p.stats.armor) >= p.hp;
    const state = sim.state;
    const hp = p.hp;
    const eventStart = sim.events.length;
    hurt(raw, p, src);
    if (!lethal) return;
    const restored = Math.max(1, p.maxHp * 0.3);
    interventions.push({ tick: sim.frame, t: sim.time, player: p.id, hpBefore: hp,
      raw, src, restored });
    p.hp = restored;
    p.dead = false;
    p.coffinT = 0;
    if (['gameover', 'victory'].includes(sim.state)) sim.state = state;
    sim.events.splice(eventStart, sim.events.length - eventStart,
        ...sim.events.slice(eventStart).filter((e) => !['playerDown', 'gameover', 'victory'].includes(e.type)));
  };
  return interventions;
}

export function remainingOptions(p) {
  return UP.buildPool(p, p.levelUp.banished).length;
}

export function createMetrics(sim, { detailed = false } = {}) {
  const minutes = [];
  const recipes = [];
  const hits = [];
  const combat = {};
  const economy = { generatedXP: 0, pickedXP: 0 };
  const magnets = [];
  const players = sim.players.map(() => ({ takes: 0, heals: 0, rerolls: 0, banishes: 0,
    skips: 0, useful: 0, weaponUpgrades: 0, passiveUpgrades: 0, firstMaxAt: null,
    autoHealAt: null }));
  let next = 60;
  let nextOpportunity = 0;
  let lastOpportunity = 0;
  const opportunities = {};
  const blocks = {};
  const incoming = sim.players.map(() => ({ damage: 0, hits: 0, sources: {} }));
  const targetHistory = new WeakMap();
  const shots = { sum: 0, n: 0, max: 0 }; // снаряды обычных врагов на экране за минуту
  const recorder = {
    hit(s, e, p, weapon, raw, dealt, kb, component) {
      if (e.hp <= 0) economy.generatedXP += e.xp;
      const key = `${p.id}:${weapon}`;
      const row = combat[key] || (combat[key] = { raw: 0, dealt: 0, hits: 0,
        first: 0, finishes: 0, knockbacks: 0, distances: [0, 0, 0, 0, 0],
        finishesAfter: {}, boss: 0, components: {} });
      let hist = targetHistory.get(e);
      if (!hist || hist.uid !== e.uid) {
        hist = { uid: e.uid, sources: new Set() }; targetHistory.set(e, hist);
      }
      if (!hist.sources.size) row.first++;
      if (e.hp <= 0) {
        row.finishes++;
        for (const source of hist.sources) {if (source !== key) {
          row.finishesAfter[source] = (row.finishesAfter[source] || 0) + 1;
        }}
      }
      hist.sources.add(key);
      row.raw += raw; row.dealt += dealt; row.hits++;
      if (e.boss) row.boss += dealt;
      if (kb > 0) row.knockbacks++;
      const distance = Math.hypot(e.x - p.x, e.y - p.y);
      row.distances[[32, 64, 128, 256].filter((d) => distance > d).length]++;
      row.components[component || 'unknown'] = (row.components[component || 'unknown'] || 0) + dealt;
      if (detailed) {hits.push({ tick: s.frame, target: e.uid, weapon, player: p.id,
        hpBefore: e.hp + raw, hpAfter: Math.max(0, e.hp), raw, dealt, kb, distance,
        component, boss: e.boss, elite: e.elite });}
    },
    block(s, projectile, shield) {
      if (!shield.ws?.owner) return;
      const key = `${shield.ws.owner.id}:${shield.wid}`;
      const row = blocks[key] || (blocks[key] = { count: 0, interceptedRaw: 0 });
      row.count++; row.interceptedRaw += projectile.dmg;
    },
    pickup(s, pk, by) {
      if (pk.kind === 'xp') economy.pickedXP += pk.value;
      if (pk.kind === 'magnet') {magnets.push({ t: s.time, player: by.id, level: s.player.level,
        groundXP: s.pickups.filter((x) => x.kind === 'xp').reduce((n, x) => n + x.value, 0),
        pickedXP: economy.pickedXP });}
    },
    application(s, who, card) {
      if (card.kind === 'heal') return;
      const p = players[who]; p.useful++;
      if (card.kind === 'weapon') p.weaponUpgrades++;
      else if (card.kind === 'passive') p.passiveUpgrades++;
      if (card.kind === 'weapon' && !card.evolved && card.level === WEAPONS[card.id].maxLevel &&
          p.firstMaxAt === null) p.firstMaxAt = s.time;
    },
    decision(s, pk) {
      const p = players[pk.player];
      const keys = { take: 'takes', heal: 'heals', reroll: 'rerolls', banish: 'banishes', skip: 'skips' };
      if (keys[pk.act]) p[keys[pk.act]]++;
      if (pk.act === 'heal' && p.autoHealAt === null) p.autoHealAt = s.time;
      if (pk.act === 'evo') recipes.push({ t: s.time, player: pk.player, id: pk.card.id });
    },
    afterStep(s) {
      for (const e of s.events) {if (e.type === 'playerHurt') {
        const row = incoming[e.player]; row.damage += e.amount; row.hits++;
        row.sources[e.src || '?'] = (row.sources[e.src || '?'] || 0) + e.amount;
      }}
      if (s.time >= nextOpportunity) {
        const shotsNow = s.enemyShots();
        shots.sum += shotsNow; shots.n++; shots.max = Math.max(shots.max, shotsNow);
        const elapsed = s.time - lastOpportunity;
        lastOpportunity = s.time;
        nextOpportunity += 0.25;
        for (const p of s.players) {for (const w of p.weapons) {
          const key = `${p.id}:${w.id}`;
          const row = opportunities[key] ||
            (opportunities[key] = { held: 0, eligible: 0, targetSeconds: 0 });
          const def = WEAPONS[w.id];
          const parts = def.parts || [{ behavior: def.behavior, ...w.params }];
          let n = 0;
          for (const e of s.enemies) {if (!e.dead) {
            const d = Math.hypot(e.x - p.x, e.y - p.y);
            if (parts.some((part) => {
              if (part.behavior === 'orbit') {return Math.abs(d - part.area) <=
                (part.hitRadius || WEAPON_BEHAVIOR.orbit.hitRadius) + e.size;}
              const range = part.range || WEAPON_BEHAVIOR[part.behavior]?.targetRange || part.area;
              return d <= range + e.size;
            })) n++;
          }}
          row.held += elapsed;
          if (n) row.eligible += elapsed;
          row.targetSeconds += n * elapsed;
        }}
      }
      if (s.time >= next) {
        minutes.push({ t: next, level: s.player.level, xp: s.player.xp,
          enemyShots: { mean: shots.n ? shots.sum / shots.n : 0, max: shots.max },
          generatedXP: economy.generatedXP, pickedXP: economy.pickedXP,
          groundXP: s.pickups.filter((x) => x.kind === 'xp').reduce((sum, x) => sum + x.value, 0),
          players: s.players.map((p) => ({ hp: p.hp, maxHp: p.maxHp, dead: p.dead,
            remaining: remainingOptions(p), choices: structuredClone(players[p.id]),
            weapons: p.weapons.map((w) => [w.id, w.level]),
            passives: p.passives.map((x) => [x.id, x.level]) })) });
        next += 60;
        shots.sum = 0; shots.n = 0; shots.max = 0;
      }
    },
  };
  sim.telemetryObservers.add(recorder);
  return { minutes, recipes, hits, combat, economy, players, opportunities, blocks,
    incoming, magnets,
    detach: () => sim.telemetryObservers.delete(recorder) };
}
export const FIXED_STEP = 1 / SIM.tickRate;
