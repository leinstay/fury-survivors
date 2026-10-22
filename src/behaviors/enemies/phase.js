// Призрак: летит по прямой туда, где был игрок на момент прицеливания (раз в aimEvery с).
// Не расталкивается с другими врагами, поэтому кольцо призраков сходится к игроку.
export const phase = {
  init(e) { e.a = 0; },
  update(e, sim, dt) {
    e.a -= dt;
    if (e.a <= 0) {
      const pl = sim.player;
      const dx = pl.x - e.x;
      const dy = pl.y - e.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      e.a = e.params.aimEvery;
      e.vx = (dx / d) * e.speed;
      e.vy = (dy / d) * e.speed;
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.facing = e.vx >= 0 ? 1 : -1;
    e.moving = true;
  },
};
