// Жница овертайма (docs/META.md, 4): освящённые круги, песочные часы, фазы. Числа в BOSSES.reaper
// (holy, hourglass, summon, teleport). Чистая логика без Phaser: случайность только sim.rng, время только sim.time.
// Состояние в sim: sim.reaper (таймеры), sim.holy (круги), sim.hourglasses (часы). Рендер читает их как есть.
//   круг: { uid, x, y, radius, t, life, warn }  — действует, когда t >= warn
//   часы: { uid, x, y, radius, t, life, slow, breakRadius }
//   sim.reaper.tp: { x, y, t, delay } — метка телепорта (телеграф), null без неё
import { COOP } from '../data/coop.js';

const TAU = Math.PI * 2;

/** Жница появилась: HP при Библии и таймеры. Без holy в данных ничего не делает. */
export function initReaper(sim, e) {
  const d = e.def;
  if (!d.holy && !d.hourglass) return;
  if (sim.hasBible && d.holy) {
    e.maxHp = d.holy.hpPerLevel * sim.player.level * (sim.coop ? COOP.bossHpMul : 1);
    e.hp = e.maxHp;
  }
  sim.holy.length = 0;
  sim.hourglasses.length = 0;
  sim.reaper = {
    e, uid: e.uid,
    holyT: d.holy ? d.holy.first : 0,
    hourT: d.hourglass ? d.hourglass.first : 0,
    summoned: false,
    tpT: 0,
    tp: null,
  };
}

/** Может ли Жница сейчас получить урон: Библия у кого-то и она в действующем круге. */
export function reaperVulnerable(sim, e) {
  return !!(sim.hasBible && e.def.holy && inHoly(sim, e.x, e.y));
}

/** Точка (x, y) в действующем освящённом круге. */
export function inHoly(sim, x, y) {
  const list = sim.holy;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.t < c.warn) continue;
    const dx = x - c.x;
    const dy = y - c.y;
    if (dx * dx + dy * dy <= c.radius * c.radius) return true;
  }
  return false;
}

/** Множитель скорости игрока от песочных часов (1 вне их радиуса). Перекрытие не складывается. */
export function groundMul(sim, pl) {
  const list = sim.hourglasses;
  let m = 1;
  for (let i = 0; i < list.length; i++) {
    const h = list[i];
    const dx = pl.x - h.x;
    const dy = pl.y - h.y;
    if (dx * dx + dy * dy <= h.radius * h.radius && h.slow < m) m = h.slow;
  }
  return m;
}

/** Шаг Жницы: круги, часы, фазы. Вызывается из sim.step после движения врагов. */
export function updateReaper(sim, dt) {
  const r = sim.reaper;
  if (!r) return;
  const e = r.e;
  if (e.dead || e.uid !== r.uid) {
    sim.reaper = null;
    sim.holy.length = 0;
    sim.hourglasses.length = 0;
    return;
  }
  const d = e.def;
  age(sim.holy, dt);
  age(sim.hourglasses, dt);
  if (sim.hasBible && d.holy) {
    r.holyT -= dt;
    if (r.holyT <= 0) {
      r.holyT += d.holy.every;
      spawnHoly(sim, e, d.holy);
    }
  }
  if (d.hourglass) {
    r.hourT -= dt;
    if (r.hourT <= 0) {
      r.hourT += d.hourglass.every;
      if (sim.hourglasses.length < d.hourglass.max) spawnHourglass(sim, e, d.hourglass);
    }
    breakHourglasses(sim);
  }
  e.vuln = reaperVulnerable(sim, e);
  if (sim.hasBible) phases(sim, r, e, d, dt);
}

function age(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const o = list[i];
    o.t += dt;
    if (o.t >= o.life) {
      list[i] = list[list.length - 1];
      list.pop();
    }
  }
}

// Точка у (cx, cy) на расстоянии dist ± jitter, не ближе minFrom к Жнице. tries попыток, иначе по другую
// сторону от игроков, чем Жница.
function place(sim, e, cx, cy, baseAngle, spread, cfg, dist) {
  const rng = sim.rng;
  const min2 = cfg.minFromReaper * cfg.minFromReaper;
  for (let i = 0; i < cfg.tries; i++) {
    const a = baseAngle + (rng.next() - 0.5) * spread;
    const k = dist + (rng.next() - 0.5) * 2 * cfg.jitter;
    const x = cx + Math.cos(a) * k;
    const y = cy + Math.sin(a) * k;
    const dx = x - e.x;
    const dy = y - e.y;
    if (dx * dx + dy * dy >= min2) return { x, y };
  }
  const away = Math.atan2(cy - e.y, cx - e.x);
  return { x: cx + Math.cos(away) * dist, y: cy + Math.sin(away) * dist };
}

function spawnHoly(sim, e, cfg) {
  const v = sim.view;
  const p = place(sim, e, v.x, v.y, 0, TAU, cfg, cfg.distance);
  const c = {
    uid: ++sim.uid, x: p.x, y: p.y, radius: cfg.radius, t: 0, life: cfg.life, warn: cfg.warn,
  };
  sim.holy.push(c);
  sim.events.push({ type: 'holyCircle', x: c.x, y: c.y, radius: c.radius });
}

// Часы падают впереди по ходу случайного живого игрока (на его пути), далеко от Жницы.
function spawnHourglass(sim, e, cfg) {
  const alive = sim.alive;
  if (!alive.length) return;
  const pl = alive.length > 1 ? alive[sim.rng.int(alive.length)] : alive[0];
  const a = Math.atan2(pl.dirY, pl.dirX);
  const p = place(sim, e, pl.x, pl.y, a, 1.2, cfg, cfg.ahead);
  sim.hourglasses.push({
    uid: ++sim.uid, x: p.x, y: p.y, radius: cfg.radius, t: 0, life: cfg.life,
    slow: cfg.slow, breakRadius: cfg.breakRadius,
  });
  sim.events.push({ type: 'hourglass', x: p.x, y: p.y });
}

function breakHourglasses(sim) {
  const list = sim.hourglasses;
  for (let i = list.length - 1; i >= 0; i--) {
    const h = list[i];
    for (const pl of sim.players) {
      if (pl.dead) continue;
      const dx = pl.x - h.x;
      const dy = pl.y - h.y;
      if (dx * dx + dy * dy > h.breakRadius * h.breakRadius) continue;
      list[i] = list[list.length - 1];
      list.pop();
      sim.events.push({ type: 'hourglassBreak', x: h.x, y: h.y, player: pl.id });
      break;
    }
  }
}

function phases(sim, r, e, d, dt) {
  const frac = e.maxHp > 0 ? e.hp / e.maxHp : 1;
  const s = d.summon;
  if (s && !r.summoned && frac <= s.hpFraction) {
    r.summoned = true;
    const off = sim.rng.next() * TAU;
    for (let i = 0; i < s.count; i++) {
      const a = off + (i / s.count) * TAU;
      sim.spawnEnemy(s.enemy, e.x + Math.cos(a) * s.radius, e.y + Math.sin(a) * s.radius, false);
    }
    sim.events.push({ type: 'reaperSummon', x: e.x, y: e.y, enemy: s.enemy });
  }
  const tp = d.teleport;
  if (!tp || frac > tp.hpFraction) return;
  const m = r.tp;
  if (m) {
    m.t += dt;
    e.alpha = 1 - tp.fade * Math.min(1, m.t / m.delay);
    if (m.t < m.delay) return;
    e.x = m.x; e.y = m.y;
    e.kx = 0; e.ky = 0;
    e.speed = d.speed;
    e.alpha = 1;
    e.pose = 'idle';
    r.tp = null;
    r.tpT = tp.cooldown;
    sim.events.push({ type: 'reaperBlink', x: e.x, y: e.y });
    return;
  }
  r.tpT -= dt;
  if (r.tpT > 0) return;
  // за спину ближайшего игрока: против его направления движения; место фиксируется в начале телеграфа
  const pl = sim.target(e.x, e.y);
  r.tp = {
    x: pl.x - pl.dirX * tp.distance, y: pl.y - pl.dirY * tp.distance, t: 0, delay: tp.telegraph,
  };
  e.speed = 0;
  e.pose = 'cast';
  sim.events.push({ type: 'reaperTeleport', x: r.tp.x, y: r.tp.y, delay: tp.telegraph });
}
