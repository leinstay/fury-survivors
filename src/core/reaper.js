// Жница овертайма (docs/META.md, 4): освящённые круги, песочные часы, фазы. Числа в BOSSES.reaper
// (holy, hourglass, summon, teleport). Чистая логика без Phaser: случайность только sim.rng, время только sim.time.
// Состояние в sim: sim.reaper (таймеры), sim.holy (круги), sim.hourglasses (часы). Рендер читает их как есть.
//   круг: { uid, x, y, radius, t, life, warn }  — действует, когда t >= warn
//   часы: { uid, x, y, t, life, breakRadius } — таймер life с: не разбили, пока t < life, — пропуск
//   sim.reaper.stunT — с оглушения от разбитых часов (стоит, касание смертельно); pl.overtimeSlow — минус скорости
//   игрока от пропущенных часов
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
    stunT: 0, // с оглушения: разбитые часы (hourglass.stun), стоит на месте; фазы и телепорт ждут
    age: 0,   // с с появления: без Библии от него растёт скорость (chase.accel)
  };
  e.speed = d.speed;
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

/**
 * Скорость движения игрока с штрафом пропущенных часов (pl.overtimeSlow) поверх статов: stats.speed не трогаем,
 * чтобы панели статов не прыгали. Не ниже hourglass.minPlayerSpeed (и не выше своей скорости, если та ниже).
 */
export function playerSpeed(sim, pl) {
  const base = pl.stats.speed;
  if (!(pl.overtimeSlow > 0)) return base;
  const r = sim.reaper;
  const floor = r && r.e.def.hourglass ? r.e.def.hourglass.minPlayerSpeed : 0;
  return Math.max(Math.min(base, floor), base - pl.overtimeSlow);
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
  r.age += dt;
  age(sim.holy, dt);
  if (sim.hasBible && d.holy) {
    r.holyT -= dt;
    if (r.holyT <= 0) {
      r.holyT += d.holy.every;
      spawnHoly(sim, e, d.holy);
    }
  }
  if (d.hourglass && sim.hasBible) {
    r.hourT -= dt;
    if (r.hourT <= 0) {
      r.hourT += d.hourglass.every;
      spawnHourglasses(sim, e, d.hourglass);
    }
    breakHourglasses(sim, d.hourglass);
    expireHourglasses(sim, d.hourglass, dt);
  }
  e.vuln = reaperVulnerable(sim, e);
  if (r.stunT > 0) {
    // оглушена: стоит (касание остаётся смертельным), фазы ждут; скорость вернётся, когда стан кончится
    r.stunT -= dt;
    e.speed = 0;
    e.pose = 'idle';
    if (r.stunT > 0) return;
    r.stunT = 0;
  }
  if (!r.tp) e.speed = sim.hasBible || !d.chase ? d.speed : d.speed + d.chase.accel * r.age;
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

// Часы падают впереди по ходу живого игрока (на его пути), далеко от Жницы. Соло — одни; в коопе
// COOP.hourglassPerPlayer — по одним у каждого живого игрока, иначе у случайного; лимит max × COOP.hourglassMaxMul.
function spawnHourglasses(sim, e, cfg) {
  const alive = sim.alive;
  if (!alive.length) return;
  const max = sim.coop ? Math.round(cfg.max * COOP.hourglassMaxMul) : cfg.max;
  const list = sim.coop && COOP.hourglassPerPlayer ? alive :
      [alive.length > 1 ? alive[sim.rng.int(alive.length)] : alive[0]];
  for (const pl of list) {
    if (sim.hourglasses.length >= max) return;
    // случайная точка в кольце near..far вокруг игрока (любое направление), не ближе minFromReaper к Жнице
    const ring = { ...cfg, jitter: (cfg.far - cfg.near) / 2 };
    const p = place(sim, e, pl.x, pl.y, 0, TAU, ring, (cfg.near + cfg.far) / 2);
    sim.hourglasses.push({
      uid: ++sim.uid, x: p.x, y: p.y, t: 0, life: cfg.life, breakRadius: cfg.breakRadius,
    });
    sim.events.push({ type: 'hourglass', x: p.x, y: p.y, life: cfg.life, player: pl.id });
  }
}

// Таймер часов: не разбили за life с — пропуск, все живые игроки теряют missSpeed скорости до конца овертайма
// (в коопе × COOP.hourglassMissMul: часов там вдвое больше).
function expireHourglasses(sim, cfg, dt) {
  const list = sim.hourglasses;
  const miss = cfg.missSpeed * (sim.coop ? COOP.hourglassMissMul : 1);
  for (let i = list.length - 1; i >= 0; i--) {
    const h = list[i];
    h.t += dt;
    if (h.t < h.life) continue;
    list[i] = list[list.length - 1];
    list.pop();
    for (const pl of sim.players) {
      if (!pl.dead) pl.overtimeSlow = (pl.overtimeSlow || 0) + miss;
    }
    sim.events.push({ type: 'hourglassMiss', x: h.x, y: h.y, speed: miss });
  }
}

// Наступил на часы — разбил: Жница оглушена на stun с (новые часы продлевают до stun, не складываются).
function breakHourglasses(sim, cfg) {
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
      const r = sim.reaper;
      if (r) {
        r.stunT = Math.max(r.stunT, cfg.stun);
        sim.events.push({ type: 'reaperStun', x: r.e.x, y: r.e.y, duration: cfg.stun });
      }
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
