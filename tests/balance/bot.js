// Балансный бот: играет на core/sim без рендера. Кайтит от ближайших врагов, жадно выбирает карточки.
import { createSim } from '../../src/core/sim.js';

const CARD_SCORE = {
  'weapon:new': 6, 'weapon:new3': 2,
  'weapon:up': 5,
  'passive:attack': 4,
  'passive:haste': 3.5,
  'passive:max_hp': 3,
  'passive:armor': 3,
  'passive:regen': 2.5,
  'passive:speed': 2.5,
  'passive:crit': 2.5,
  'passive:pickup': 2,
  'passive:luck': 1,
  heal: 0,
};

// Лёгкое предпочтение оружия: части супероружия первыми (бот проверяет и слияние).
const WEAPON_PREF = { blade_arc: 1, storm_chain: 0.9, throwing_daggers: 0.8, guardian_shields: 0.7, war_axe: 0.5, firebomb: 0.5, holy_ground: 0.1 };

function score(c, nW) {
  if (c.kind === 'heal') return CARD_SCORE.heal;
  if (c.kind === 'weapon') return (c.isNew ? (nW >= 4 ? CARD_SCORE['weapon:new3'] : CARD_SCORE['weapon:new']) : CARD_SCORE['weapon:up'] + (c.evolved ? 5 : 0)) + (WEAPON_PREF[c.id] || 0);
  return CARD_SCORE['passive:' + c.id] ?? (c.isNew ? 2 : 2.5);
}

export function pickBest(cards, nW = 0) {
  let best = 0;
  for (let i = 1; i < cards.length; i++) if (score(cards[i], nW) > score(cards[best], nW)) best = i;
  return best;
}

// Вектор движения: уйти от ближайших врагов, иначе собрать кристаллы, иначе кружить.
function steer(sim, out, t) {
  const p = sim.player;
  let ax = 0;
  let ay = 0;
  let threat = 0;
  for (const e of sim.enemies) {
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 90 * 90) continue;
    const d = Math.sqrt(d2) + 1;
    const w = 1 / (d * d) * (e.elite || e.boss ? 3 : 1);
    ax += (dx / d) * w;
    ay += (dy / d) * w;
    // тангенциальная составляющая, чтобы не застревать в кольце
    ax += (-dy / d) * w * 0.35;
    ay += (dx / d) * w * 0.35;
    threat += w;
  }
  for (const pr of sim.projectiles) {
    if (pr.owner !== 'enemy') continue;
    const dx = p.x - pr.x;
    const dy = p.y - pr.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 80 * 80) continue;
    const d = Math.sqrt(d2) + 1;
    ax += (-dy / d) * 0.001;
    ay += (dx / d) * 0.001;
  }
  if (threat < 0.0003) {
    let best = null;
    let bd = 220 * 220;
    for (const pk of sim.pickups) {
      if (pk.kind !== 'xp' && pk.kind !== 'heal' && pk.kind !== 'chest') continue;
      const dx = pk.x - p.x;
      const dy = pk.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = pk; }
    }
    if (best) {
      ax = best.x - p.x; ay = best.y - p.y;
    } else {
      const en = sim.nearestEnemy(p.x, p.y, 300);
      if (en) { ax = en.x - p.x; ay = en.y - p.y; } else { ax = Math.cos(t * 0.5); ay = Math.sin(t * 0.5); }
    }
  }
  const l = Math.sqrt(ax * ax + ay * ay) || 1;
  out.x = ax / l;
  out.y = ay / l;
}

// opts: { seed, upgrades (bool), until (с), dt, hero, onSecond(sim), onEvents(events) }
export function runBot(opts) {
  const { seed = 1, upgrades = true, until = 910, dt = 1 / 60 } = opts;
  const sim = createSim({ hero: 'heroine', stage: 'forest', seed });
  if (!upgrades) sim.levelUp.skips = 1e9;
  const input = { x: 0, y: 0 };
  const res = {
    sim, levelAt: {}, maxEnemies: 0, deathTime: null, victoryTime: null, levelTimes: [], evolutions: 0,
  };
  let step = 0;
  let lastLevel = 1;
  const marks = [60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 720, 840];
  let mi = 0;
  let nextSecond = 1;
  while (sim.time < until && (sim.state === 'running' || sim.state === 'levelup')) {
    if (sim.state === 'levelup') {
      if (upgrades) sim.chooseCard(pickBest(sim.levelUp.cards, sim.player.weapons.length));
      else sim.skip();
      continue;
    }
    if (step % 3 === 0) steer(sim, input, sim.time);
    sim.step(dt, input);
    step++;
    if (opts.onSecond && sim.time >= nextSecond) { opts.onSecond(sim); nextSecond++; }
    if (sim.enemies.length > res.maxEnemies) res.maxEnemies = sim.enemies.length;
    if (sim.player.level !== lastLevel) {
      lastLevel = sim.player.level;
      res.levelTimes[lastLevel] = sim.time;
    }
    while (mi < marks.length && sim.time >= marks[mi]) { res.levelAt[marks[mi]] = sim.player.level; (res.trace ||= []).push([marks[mi], sim.enemies.length, Math.round(sim.player.hp), sim.kills]); mi++; }
    if (opts.onEvents && sim.events.length) opts.onEvents(sim.events);
    for (const ev of sim.events) if (ev.type === 'chest' && ev.items.some((i) => i.evolved)) res.evolutions++;
  }
  if (sim.state === 'gameover') res.deathTime = sim.time;
  if (sim.state === 'victory') res.victoryTime = sim.time;
  res.time = sim.time;
  res.state = sim.state;
  return res;
}
