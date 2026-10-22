// Балансный бот: играет на core/sim без рендера. Пресеты (opts.preset):
//   greedy — кайтит от ближайших врагов, жадно берёт любые карточки (прежний бот, по умолчанию);
//   idle   — стоит на месте, берёт Holy Ground, Storm Chain и защитные пассивки (max_hp, armor, regen):
//            проверка, что «встал в чеснок и победил» не работает;
//   kite   — кайтит с осмысленным билдом: Blade Arc + Throwing Daggers + War Axe, атака, скорострельность, HP;
//   tank   — кайтит с билдом на выживание: Storm Chain + Holy Ground, реген, броня, криты (оценка рекордов).
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
const WEAPON_PREF = {
  blade_arc: 1, storm_chain: 0.9, throwing_daggers: 0.8, guardian_shields: 0.7,
  war_axe: 0.5, firebomb: 0.5, holy_ground: 0.1,
};

// Билды пресетов: weapons — какие оружия брать (остальные новые оружия не берёт), passives — очки пассивок.
const BUILDS = {
  idle: {
    weapons: { holy_ground: 10, storm_chain: 9, blade_arc: 6 },
    passives: { max_hp: 5, armor: 5, regen: 4.5, attack: 3, haste: 3 },
  },
  kite: {
    weapons: { blade_arc: 10, throwing_daggers: 9, war_axe: 8 },
    passives: { attack: 5, haste: 4.5, max_hp: 4, armor: 3.5, speed: 3, regen: 2.5 },
  },
  tank: {
    weapons: { storm_chain: 10, holy_ground: 9, blade_arc: 6 },
    passives: { regen: 5, armor: 5, crit: 4.5, attack: 4, haste: 3.5, max_hp: 3 },
  },
};

function buildScore(c, b) {
  if (c.kind === 'heal') return 0;
  if (c.kind === 'weapon') {
    if (c.evolved) return 20;
    const w = b.weapons[c.id];
    if (!w) return -1;
    return c.isNew ? w : 5 + w / 10;
  }
  return b.passives[c.id] ?? -1;
}

function score(c, nW, preset) {
  if (BUILDS[preset]) return buildScore(c, BUILDS[preset]);
  if (c.kind === 'heal') return CARD_SCORE.heal;
  if (c.kind === 'weapon') return (c.isNew ? (nW >= 4 ? CARD_SCORE['weapon:new3'] : CARD_SCORE['weapon:new']) : CARD_SCORE['weapon:up'] + (c.evolved ? 5 : 0)) + (WEAPON_PREF[c.id] || 0);
  return CARD_SCORE['passive:' + c.id] ?? (c.isNew ? 2 : 2.5);
}

export function pickBest(cards, nW = 0, preset = 'greedy') {
  let best = 0;
  for (let i = 1; i < cards.length; i++) {
    if (score(cards[i], nW, preset) > score(cards[best], nW, preset)) best = i;
  }
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
      if (en) {
        ax = en.x - p.x;
        ay = en.y - p.y;
      } else {
        ax = Math.cos(t * 0.5);
        ay = Math.sin(t * 0.5);
      }
    }
  }
  const l = Math.sqrt(ax * ax + ay * ay) || 1;
  out.x = ax / l;
  out.y = ay / l;
}

// opts: { seed, preset ('greedy' | 'idle' | 'kite'), upgrades (bool), until (с), dt, onSecond(sim), onEvents(events) }
// res.bosses: { id: { at, hp, level, killed } } — время появления, HP и уровень игрока при появлении, время убийства.
// res.victoryTime — убийство финального босса (начало овертайма); забег после него идёт до смерти или until.
export function runBot(opts) {
  const { seed = 1, preset = 'greedy', upgrades = true, until = 910, dt = 1 / 60 } = opts;
  const idle = preset === 'idle';
  const sim = createSim({ hero: 'heroine', stage: 'forest', seed });
  if (!upgrades) sim.levelUp.skips = 1e9;
  const input = { x: 0, y: 0 };
  const res = {
    sim, levelAt: {}, maxEnemies: 0, deathTime: null, victoryTime: null,
    levelTimes: [], evolutions: 0, bosses: {},
  };
  let step = 0;
  let lastLevel = 1;
  const marks = [60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 720, 840];
  let mi = 0;
  let nextSecond = 1;
  while (sim.time < until && (sim.state === 'running' || sim.state === 'levelup')) {
    if (sim.state === 'levelup') {
      if (upgrades) sim.chooseCard(pickBest(sim.levelUp.cards, sim.player.weapons.length, preset));
      else sim.skip();
      continue;
    }
    if (idle) { input.x = 0; input.y = 0; } else if (step % 3 === 0) steer(sim, input, sim.time);
    sim.step(dt, input);
    step++;
    if (opts.onSecond && sim.time >= nextSecond) { opts.onSecond(sim); nextSecond++; }
    if (sim.enemies.length > res.maxEnemies) res.maxEnemies = sim.enemies.length;
    if (sim.player.level !== lastLevel) {
      lastLevel = sim.player.level;
      res.levelTimes[lastLevel] = sim.time;
    }
    while (mi < marks.length && sim.time >= marks[mi]) {
      res.levelAt[marks[mi]] = sim.player.level;
      (res.trace ||= [])
          .push([marks[mi], sim.enemies.length, Math.round(sim.player.hp), sim.kills]);
      mi++;
    }
    if (opts.onEvents && sim.events.length) opts.onEvents(sim.events);
    for (const ev of sim.events) {
      if (ev.type === 'chest' && ev.items.some((i) => i.evolved)) res.evolutions++;
      if (ev.type === 'bossSpawn' && sim.boss) {
        res.bosses[ev.boss] = {
          at: sim.time, hp: sim.boss.maxHp, level: sim.player.level, killed: null,
        };
      }
      if (ev.type === 'kill' && ev.boss && res.bosses[ev.enemy]) res.bosses[ev.enemy].killed = sim.time;
      if (ev.type === 'overtime') res.victoryTime = sim.time;
    }
  }
  if (sim.state === 'gameover') res.deathTime = sim.time;
  if (sim.state === 'victory' && res.victoryTime === null) res.victoryTime = sim.time;
  res.time = sim.time;
  res.state = sim.state;
  return res;
}
