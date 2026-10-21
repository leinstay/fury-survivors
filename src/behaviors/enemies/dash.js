// Лисодевочка: подходит, замирает (замах), рывок по прямой, пауза. st: 0 подход, 1 замах, 2 рывок.
export default {
  init(e, sim) {
    e.st = 0;
    e.b = sim.rng.next() * e.params.cooldown; // таймер до следующего рывка
  },
  update(e, sim, dt) {
    const P = e.params;
    const pl = sim.player;
    const dx = pl.x - e.x;
    const dy = pl.y - e.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (e.st === 0) {
      e.b -= dt;
      const k = (e.speed * dt) / d;
      e.x += dx * k;
      e.y += dy * k;
      e.moving = true;
      e.facing = dx >= 0 ? 1 : -1;
      if (e.b <= 0 && d < P.range) { e.st = 1; e.a = P.windup; }
    } else if (e.st === 1) {
      e.moving = false;
      e.facing = dx >= 0 ? 1 : -1;
      e.a -= dt;
      if (e.a <= 0) {
        e.st = 2;
        e.a = P.dashTime;
        e.vx = (dx / d) * P.dashSpeed;
        e.vy = (dy / d) * P.dashSpeed;
      }
    } else {
      e.moving = true;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.a -= dt;
      if (e.a <= 0) { e.st = 0; e.b = P.cooldown; }
    }
  },
};
