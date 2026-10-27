// Летучая мышь: летит на игрока с боковым покачиванием (params.wobble px/с, wobbleFreq рад/с).
import { moveMul } from '../status.js';
export const swarm = {
  update(e, sim, dt) {
    const pl = sim.target(e.x, e.y);
    const dx = pl.x - e.x;
    const dy = pl.y - e.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / d;
    const ny = dy / d;
    const w = Math.sin(sim.time * e.params.wobbleFreq + e.t) * e.params.wobble;
    const m = moveMul(e, sim);
    e.x += (nx * e.speed - ny * w) * m * dt;
    e.y += (ny * e.speed + nx * w) * m * dt;
    e.facing = dx >= 0 ? 1 : -1;
    e.moving = true;
  },
};
