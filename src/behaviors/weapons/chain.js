// Storm Chain: молния бьёт ближайшую цель и перескакивает на соседей. Цель — враг или разрушаемый объект
// (sim.nearestTarget, объект наравне с врагом): объект на конце звена ломается, и молния прыгает дальше от него.
// Урон мгновенный, снаряды только для вида, поэтому объекты молния ломает сама: и на пути звена тоже.
import { WEAPON_BEHAVIOR } from '../../data/weapons.js';

const { visualLife: VISUAL_LIFE, propWidth: PROP_WIDTH } = WEAPON_BEHAVIOR.chain;

// Картинка прыжка: снаряд без урона, fx 'bolt' (render/zones.js рисует рваную ломаную от (x, y) до (a, b)).
// first — первое звено (из героя): картинка начнёт его из FX.weaponOrigin (p.c = 1), удар не меняется.
function segment(sim, x0, y0, x1, y1, sprite, first = false) {
  const p = sim.addProjectile('player', sprite);
  p.x = x0; p.y = y0;
  p.a = x1; p.b = y1;
  p.angle = Math.atan2(y1 - y0, x1 - x0);
  p.fx = 'bolt';
  p.c = first ? 1 : 0;
  p.life = p.life0 = VISUAL_LIFE;
}

export const chain = {
  init(w) { w.cooldown = 0.4; },
  update(w, sim, dt) {
    w.cooldown -= dt;
    if (w.cooldown > 0) return;
    const P = w.params;
    const pl = w.owner;
    const stamp = sim.nextStamp();
    const first = sim.nearestTarget(pl.x, pl.y, P.range, stamp);
    if (!first) { w.cooldown = 0.15; return; }
    w.cooldown = P.cooldown;
    for (let b = 0; b < P.amount; b++) {
      let cur = b === 0 ? first : sim.nearestTarget(pl.x, pl.y, P.range, stamp);
      if (!cur) break;
      let x = pl.x;
      let y = pl.y;
      for (let j = 0; j <= P.jumps && cur; j++) {
        segment(sim, x, y, cur.x, cur.y, w.def.sprite, j === 0);
        sim.hitPropsOnSegment(x, y, cur.x, cur.y, PROP_WIDTH, stamp); // объект-цель на конце звена тоже
        cur.mark = stamp;
        if (!cur.breakable) {
          sim.damageEnemy(cur, P.damage, w.id, P.knockback || 0, x, y, w.owner, `chain:${w.slot}`,
              P.status);
        }
        x = cur.x; y = cur.y;
        cur = sim.nearestTarget(x, y, P.area, stamp);
      }
    }
    sim.events.push({ type: 'weaponFire', weapon: w.id });
  },
};
