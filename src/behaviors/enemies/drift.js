// Прямой курс: враг летит по заданному углу (e.a, рад) со своей скоростью, не гонится за игроком.
// Так ходят стена (director: wall) и пролёт стаи (flyby); e.transient = true: за краем мира (SIM.despawnDistance)
// враг исчезает, а не переносится вперёд. Поведение назначается директором поверх def.behavior.
import { moveMul } from '../status.js';
export const drift = {
  update(e, sim, dt) {
    const cx = Math.cos(e.a);
    const v = e.speed * moveMul(e, sim);
    e.x += cx * v * dt;
    e.y += Math.sin(e.a) * v * dt;
    e.facing = cx >= 0 ? 1 : -1;
    e.moving = true;
  },
};
