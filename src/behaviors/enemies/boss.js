// Босс: медленно идёт на игрока и по очереди применяет атаки из def.attacks (dash, summon).
// st: 0 ходьба, 1 замах рывка, 2 рывок. e.b — индекс текущей атаки, e.cd — таймеры атак.
export default {
  init(e) {
    e.cd = e.def.attacks.map((a) => a.cooldown * 0.5);
    e.st = 0;
    e.b = 0;
  },
  update(e, sim, dt) {
    const attacks = e.def.attacks;
    const pl = sim.player;
    const dx = pl.x - e.x;
    const dy = pl.y - e.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (e.st === 0) {
      const k = (e.speed * dt) / d;
      e.x += dx * k;
      e.y += dy * k;
      e.moving = true;
      e.facing = dx >= 0 ? 1 : -1;
      for (let i = 0; i < attacks.length; i++) {
        e.cd[i] -= dt;
        if (e.cd[i] > 0) continue;
        const a = attacks[i];
        e.cd[i] = a.cooldown;
        if (a.type === 'dash') {
          e.st = 1; e.a = a.windup; e.b = i;
          break;
        }
        if (a.type === 'summon') {
          for (let j = 0; j < a.count; j++) {
            if (!sim.canSpawn()) break;
            const ang = (j / a.count) * Math.PI * 2;
            sim.spawnEnemy(a.enemy, e.x + Math.cos(ang) * a.radius, e.y + Math.sin(ang) * a.radius, false);
          }
        }
      }
    } else if (e.st === 1) {
      e.moving = false;
      e.facing = dx >= 0 ? 1 : -1;
      e.a -= dt;
      if (e.a <= 0) {
        const a = attacks[e.b];
        e.st = 2;
        e.a = a.time;
        e.vx = (dx / d) * a.speed;
        e.vy = (dy / d) * a.speed;
      }
    } else {
      e.moving = true;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.a -= dt;
      if (e.a <= 0) e.st = 0;
    }
  },
};
