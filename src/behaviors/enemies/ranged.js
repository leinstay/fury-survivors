// Суккуба: держит дистанцию keep и стреляет в игрока каждые cooldown секунд.
export const ranged = {
  init(e, sim) {
    e.a = 0.5 + sim.rng.next() * e.params.cooldown;
  },
  update(e, sim, dt) {
    const P = e.params;
    const pl = sim.target(e.x, e.y);
    const dx = pl.x - e.x;
    const dy = pl.y - e.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    let move = 0;
    if (d > P.keep) move = 1;
    else if (d < P.keep * 0.7) move = -0.6;
    e.moving = move !== 0;
    const k = (move * e.speed * dt) / d;
    e.x += dx * k;
    e.y += dy * k;
    e.facing = dx >= 0 ? 1 : -1;
    e.a -= dt;
    if (e.a <= 0 && d < P.range) {
      e.a = P.cooldown;
      const dmg = P.projDamage * (e.damage / e.def.damage);
      sim.spawnEnemyProjectile(e.x, e.y, Math.atan2(dy, dx), P.projSpeed, dmg, P.projLife, e.type);
    }
  },
};
