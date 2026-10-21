// Директор: спавн врагов и событий по таймлайну этапа.
import { SIM } from '../data/constants.js';

export function createDirector(stage, rng) {
  const events = stage.timeline;
  const end = stage.duration;
  let idx = 0;
  let warned = false;
  const active = []; // активные spawn-события { ev, acc, check }

  function start(ev, sim) {
    switch (ev.type) {
      case 'spawn':
        active.push({ ev, acc: 0, check: 0 });
        break;
      case 'ring': {
        const n = ev.count || 20;
        const radius = ev.radius || SIM.spawnDistance - 60;
        const p = sim.player;
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
        const p = sim.player;
        sim.spawnEnemy(ev.enemy, p.x + Math.cos(a) * SIM.spawnDistance, p.y + Math.sin(a) * SIM.spawnDistance, true);
        break;
      }
      case 'burst': {
        const a = rng.next() * Math.PI * 2;
        const p = sim.player;
        const cx = p.x + Math.cos(a) * SIM.spawnDistance;
        const cy = p.y + Math.sin(a) * SIM.spawnDistance;
        for (let i = 0; i < ev.count; i++) {
          if (!sim.canSpawn()) break;
          sim.spawnEnemy(ev.enemy, cx + (rng.next() - 0.5) * 80, cy + (rng.next() - 0.5) * 80, false);
        }
        break;
      }
      case 'boss':
        sim.spawnBoss(ev.boss);
        break;
      default:
        break;
    }
  }

  return {
    update(sim, dt) {
      const t = sim.time;
      if (!warned && stage.bossWarning) {
        for (const ev of events) {
          if (ev.type === 'boss' && t >= ev.at - stage.bossWarning) {
            warned = true;
            sim.events.push({ type: 'bossWarning', boss: ev.boss, seconds: Math.max(0, ev.at - t) });
            break;
          }
        }
      }
      while (idx < events.length && events[idx].at <= t) start(events[idx++], sim);
      const p = sim.player;
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
        a.acc += rate * dt;
        // Минимум как в Vampire Survivors: раз в полсекунды досыпаем группы, пока живых этого вида меньше min.
        a.check -= dt;
        if (ev.min !== undefined && a.check <= 0) {
          a.check = 0.5;
          const min = ev.minEnd === undefined ? ev.min : ev.min + (ev.minEnd - ev.min) * k;
          let alive = 0;
          for (let j = 0; j < sim.enemies.length; j++) if (sim.enemies[j].type === ev.enemy) alive++;
          const missing = Math.ceil((min - alive) / (ev.group || 1));
          if (missing > 0) a.acc += Math.min(missing, 6);
        }
        while (a.acc >= 1) {
          a.acc -= 1;
          const ang = rng.next() * Math.PI * 2;
          const cx = p.x + Math.cos(ang) * SIM.spawnDistance;
          const cy = p.y + Math.sin(ang) * SIM.spawnDistance;
          const g = ev.group || 1;
          for (let j = 0; j < g; j++) {
            if (!sim.canSpawn()) break;
            sim.spawnEnemy(ev.enemy, cx + (rng.next() - 0.5) * 36, cy + (rng.next() - 0.5) * 36, false);
          }
        }
      }
    },
  };
}
