// Прямой курс: враг летит по заданному углу (e.a, рад) со своей скоростью, не гонится за игроком.
// Так ходят стена (director: wall) и пролёт стаи (flyby); e.transient = true: за краем мира (SIM.despawnDistance)
// враг исчезает, а не переносится вперёд. Поведение назначается директором поверх def.behavior.
export const drift = {
  update(e, sim, dt) {
    const cx = Math.cos(e.a);
    e.x += cx * e.speed * dt;
    e.y += Math.sin(e.a) * e.speed * dt;
    e.facing = cx >= 0 ? 1 : -1;
    e.moving = true;
  },
};
