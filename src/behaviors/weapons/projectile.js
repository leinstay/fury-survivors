// Throwing Daggers: веер снарядов в ближайшего врага. pierce — сколько врагов пробьёт сверх первого.
// Необязательно: pierceAll — пробивает всех (копьё), hitRadius — радиус попадания вместо общего.
import { WEAPON_BEHAVIOR } from '../../data/weapons.js';

const SPREAD = 0.16;
const { targetRange: TARGET_RANGE, hitRadius: HIT_RADIUS } = WEAPON_BEHAVIOR.projectile;

export const projectile = {
  init(w) { w.cooldown = 0.2; },
  update(w, sim, dt) {
    w.cooldown -= dt;
    if (w.cooldown > 0) return;
    const P = w.params;
    const pl = w.owner;
    // цель — ближайший враг или разрушаемый объект (sim.nearestTarget: объект наравне с врагом)
    const t = sim.nearestTarget(pl.x, pl.y, TARGET_RANGE);
    if (!t) { w.cooldown = 0.1; return; }
    w.cooldown = P.cooldown;
    const base = Math.atan2(t.y - pl.y, t.x - pl.x);
    const n = P.amount;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * SPREAD;
      const p = sim.addProjectile('player', w.def.sprite);
      p.ws = w;
      p.x = pl.x; p.y = pl.y;
      p.angle = a;
      p.vx = Math.cos(a) * P.speed;
      p.vy = Math.sin(a) * P.speed;
      p.life = P.duration;
      p.radius = P.hitRadius || HIT_RADIUS;
      p.dmg = P.damage;
      p.kb = P.knockback || 0;
      p.pierce = P.pierceAll ? 1e9 : P.pierce || 0;
      p.wid = w.id;
      p.slot = w.slot;
    }
    sim.events.push({ type: 'weaponFire', weapon: w.id });
  },
};
