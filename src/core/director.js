// Директор: спавн врагов и событий по таймлайну этапа.
import { SIM, DIRECTOR } from '../data/constants.js';
import { ENEMY_BEHAVIORS } from '../behaviors/index.js';

/**
 * Директор: спавн врагов и событий по таймлайну этапа.
 * @param {!Object} stage описание этапа (timeline, duration, bossWarning)
 * @param {{next: function(): number}} rng сидируемый RNG
 * @return {{update: function(!Object, number)}} update(sim, dt) вызывается каждый шаг
 */
export function createDirector(stage, rng) {
  const events = stage.timeline;
  const end = stage.duration;
  let idx = 0;
  const warned = new Set(); // боссы, о которых уже предупредили
  const active = []; // активные spawn-события { ev, acc, check }
  const ot = stage.overtime || null;
  // овертайм: накопитель групп, индекс типа, таймеры кольца и элиты, предупреждение и приход жницы
  const otState = { acc: 0, next: 0, ring: 0, elite: 0, reaperWarned: false, reaper: false };

  // Сложность и кооп (sim.spawnMul): частота, минимумы и размеры разовых событий умножаются.
  const mul = (sim, n) => Math.round(n * sim.spawnMul);

  function start(ev, sim) {
    switch (ev.type) {
      case 'spawn':
        active.push({ ev, acc: 0, check: 0 });
        break;
      case 'ring': {
        const n = mul(sim, ev.count || DIRECTOR.ringCount);
        const radius = ev.radius || SIM.spawnDistance - DIRECTOR.ringInset;
        const p = sim.view;
        const off = rng.next() * Math.PI * 2;
        for (let i = 0; i < n; i++) {
          if (!sim.canSpawn()) break;
          const a = off + (i / n) * Math.PI * 2;
          sim.spawnEnemy(ev.enemy, p.x + Math.cos(a) * radius, p.y + Math.sin(a) * radius, false);
        }
        break;
      }
      case 'elite': {
        const a = rng.next() * Math.PI * 2;
        const p = sim.view;
        sim.spawnEnemy(ev.enemy,
            p.x + Math.cos(a) * SIM.spawnDistance, p.y + Math.sin(a) * SIM.spawnDistance, true);
        break;
      }
      case 'burst': {
        const a = rng.next() * Math.PI * 2;
        const p = sim.view;
        const cx = p.x + Math.cos(a) * SIM.spawnDistance;
        const cy = p.y + Math.sin(a) * SIM.spawnDistance;
        for (let i = 0, n = mul(sim, ev.count); i < n; i++) {
          if (!sim.canSpawn()) break;
          sim.spawnEnemy(ev.enemy,
              cx + (rng.next() - 0.5) * DIRECTOR.burstJitter,
              cy + (rng.next() - 0.5) * DIRECTOR.burstJitter, false);
        }
        break;
      }
      case 'boss':
        sim.spawnBoss(ev.boss);
        break;
      case 'wall': {
        // Стена (как в VS): шеренга врагов во весь экран за краем, идёт сквозь игрока прямым курсом и исчезает.
        const n = mul(sim, ev.count || DIRECTOR.wallCount);
        const a = rng.next() * Math.PI * 2;          // откуда идёт
        const dist = SIM.spawnDistance + DIRECTOR.wallInset;
        const len = ev.length || DIRECTOR.wallLength;
        const p = sim.view;
        for (let i = 0; i < n; i++) {
          const s = (i / (n - 1 || 1) - 0.5) * len;
          const e = sim.spawnEnemy(ev.enemy,
              p.x + Math.cos(a) * dist - Math.sin(a) * s,
              p.y + Math.sin(a) * dist + Math.cos(a) * s, false);
          if (!e) break;
          drift(e, a + Math.PI, ev.speed);
        }
        break;
      }
      case 'flyby': {
        // Пролёт стаи: кучка у края летит по случайному курсу мимо игрока (через точку рядом с ним) и улетает.
        const n = mul(sim, ev.count || DIRECTOR.ringCount);
        const a = rng.next() * Math.PI * 2;
        const p = sim.view;
        const cx = p.x + Math.cos(a) * SIM.spawnDistance;
        const cy = p.y + Math.sin(a) * SIM.spawnDistance;
        const miss = (rng.next() - 0.5) * DIRECTOR.flybyMiss;
        const tx = p.x - Math.sin(a) * miss;
        const ty = p.y + Math.cos(a) * miss;
        const course = Math.atan2(ty - cy, tx - cx);
        for (let i = 0; i < n; i++) {
          const e = sim.spawnEnemy(ev.enemy,
              cx + (rng.next() - 0.5) * DIRECTOR.burstJitter,
              cy + (rng.next() - 0.5) * DIRECTOR.burstJitter, false);
          if (!e) break;
          drift(e, course, ev.speed);
        }
        break;
      }
      default:
        break;
    }
  }

  // Прямой курс для стены и пролёта: поведение drift поверх родного, за краем мира враг исчезает.
  function drift(e, angle, speed) {
    e.beh = ENEMY_BEHAVIORS.drift;
    e.a = angle;
    e.transient = true;
    if (speed) e.speed = speed;
  }

  // Группа врагов типа type у края экрана.
  function group(sim, type, count) {
    const p = sim.view;
    const ang = rng.next() * Math.PI * 2;
    const cx = p.x + Math.cos(ang) * SIM.spawnDistance;
    const cy = p.y + Math.sin(ang) * SIM.spawnDistance;
    for (let j = 0; j < count; j++) {
      if (!sim.canSpawn()) break;
      sim.spawnEnemy(type,
          cx + (rng.next() - 0.5) * DIRECTOR.groupJitter,
          cy + (rng.next() - 0.5) * DIRECTOR.groupJitter, false);
    }
  }

  // Овертайм: группы всех типов по кругу с растущей частотой, кольцо призраков и элита по таймерам.
  function overtime(sim, dt) {
    const s = sim.time - sim.overtime;
    const o = otState;
    o.acc += (ot.rate + ot.rateRamp * s) * sim.spawnMul * dt;
    while (o.acc >= 1) {
      o.acc -= 1;
      group(sim, ot.enemies[o.next++ % ot.enemies.length], ot.group || 1);
    }
    o.ring += dt;
    if (ot.ringEvery && o.ring >= ot.ringEvery) {
      o.ring = 0;
      start({ type: 'ring', enemy: ot.ringEnemy, count: ot.ringCount }, sim);
    }
    o.elite += dt;
    if (ot.eliteEvery && o.elite >= ot.eliteEvery) {
      o.elite = 0;
      start({ type: 'elite', enemy: ot.enemies[rng.int(ot.enemies.length)] }, sim);
    }
    if (ot.reaper && !o.reaper) {
      const warn = stage.bossWarning || 0;
      if (!o.reaperWarned && s >= ot.reaperAt - warn) {
        o.reaperWarned = true;
        sim.events.push({ type: 'bossWarning', boss: ot.reaper, seconds: Math.max(0, ot.reaperAt - s) });
      }
      if (s >= ot.reaperAt) {
        o.reaper = true;
        sim.spawnBoss(ot.reaper);
      }
    }
  }

  return {
    update(sim, dt) {
      const t = sim.time;
      if (ot && sim.overtime >= 0) overtime(sim, dt);
      if (stage.bossWarning) {
        for (const ev of events) {
          if (ev.type === 'boss' && !warned.has(ev) && t >= ev.at - stage.bossWarning && t < ev.at) {
            warned.add(ev);
            sim.events.push({ type: 'bossWarning', boss: ev.boss, seconds: Math.max(0, ev.at - t) });
          }
        }
      }
      while (idx < events.length && events[idx].at <= t) start(events[idx++], sim);
      for (let i = active.length - 1; i >= 0; i--) {
        const a = active[i];
        const ev = a.ev;
        const until = ev.until === undefined ? end : ev.until;
        if (t >= until) {
          active[i] = active[active.length - 1];
          active.pop();
          continue;
        }
        const k = (t - ev.at) / Math.max(0.001, until - ev.at);
        const rate = ev.rateEnd === undefined ? ev.rate : ev.rate + (ev.rateEnd - ev.rate) * k;
        a.acc += rate * sim.spawnMul * dt;
        // Минимум как в Vampire Survivors: раз в полсекунды досыпаем группы, пока живых этого вида меньше min.
        a.check -= dt;
        if (ev.min !== undefined && a.check <= 0) {
          a.check = DIRECTOR.minCheckInterval;
          const base = ev.minEnd === undefined ? ev.min : ev.min + (ev.minEnd - ev.min) * k;
          const min = base * sim.spawnMul;
          let alive = 0;
          for (let j = 0; j < sim.enemies.length; j++) {
            const o = sim.enemies[j];
            if (o.type === ev.enemy && !o.transient && !o.dead) alive++; // стена и пролёт не в счёт
          }
          const missing = Math.ceil((min - alive) / (ev.group || 1));
          if (missing > 0) a.acc += Math.min(missing, DIRECTOR.minGroupsCap);
        }
        while (a.acc >= 1) {
          a.acc -= 1;
          group(sim, ev.enemy, ev.group || 1);
        }
      }
    },
  };
}
