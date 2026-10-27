// Призрак: летит по прямой туда, где был игрок на момент прицеливания (раз в aimEvery с).
// Не расталкивается с другими врагами, поэтому кольцо призраков сходится к игроку.
import { moveMul } from '../status.js';
export const phase = {
  init(e) { e.a = 0; },
  update(e, sim, dt) {
    e.a -= dt;
    if (e.a <= 0) {
      const pl = sim.target(e.x, e.y);
      const dx = pl.x - e.x;
      const dy = pl.y - e.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      e.a = e.params.aimEvery;
      e.vx = (dx / d) * e.speed;
      e.vy = (dy / d) * e.speed;
    }
    const m = moveMul(e, sim);
    e.x += e.vx * m * dt;
    e.y += e.vy * m * dt;
    e.facing = e.vx >= 0 ? 1 : -1;
    e.moving = true;
  },
};
