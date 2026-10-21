// Идёт прямо на игрока.
export default {
  update(e, sim, dt) {
    const pl = sim.player;
    const dx = pl.x - e.x;
    const dy = pl.y - e.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const k = (e.speed * dt) / d;
    e.x += dx * k;
    e.y += dy * k;
    e.facing = dx >= 0 ? 1 : -1;
    e.moving = true;
  },
};
