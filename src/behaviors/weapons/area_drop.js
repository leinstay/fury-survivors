// Firebomb: бомба летит в ближайшего врага, взрывается и оставляет огонь на земле.
import { WEAPON_BEHAVIOR } from '../../data/weapons.js';

const { targetRange: TARGET_RANGE, flight: FLIGHT, fireTick: TICK } = WEAPON_BEHAVIOR.area_drop;

export const areaDrop = {
  init(w) { w.cooldown = 0.5; },
  update(w, sim, dt) {
    w.cooldown -= dt;
    if (w.cooldown > 0) return;
    const P = w.params;
    const pl = w.owner;
    if (!sim.nearestEnemy(pl.x, pl.y, TARGET_RANGE)) { w.cooldown = 0.15; return; }
    w.cooldown = P.cooldown;
    const stamp = sim.nextStamp();
    for (let i = 0; i < P.amount; i++) {
      const t = sim.nearestEnemy(pl.x, pl.y, TARGET_RANGE, stamp);
      let tx;
      let ty;
      if (t) { t.mark = stamp; tx = t.x; ty = t.y; }
      else { tx = pl.x + (sim.rng.next() - 0.5) * 200; ty = pl.y + (sim.rng.next() - 0.5) * 200; }
      const p = sim.addProjectile('player', w.def.sprite);
      p.x = pl.x; p.y = pl.y;
      p.vx = (tx - pl.x) / FLIGHT;
      p.vy = (ty - pl.y) / FLIGHT;
      p.life = FLIGHT;
      p.scale = 0.8;
      p.wid = w.id;
      p.ws = w;
      p.bk = areaDrop;
      p.a = tx; p.b = ty;
    }
    sim.events.push({ type: 'weaponFire', weapon: w.id });
  },
  moveProjectile(p, w, sim, dt) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle += 8 * dt;
  },
  expire(p, w, sim) {
    if (w.removed) return;
    const P = w.params;
    const boom = sim.addProjectile('player', w.def.sprite);
    boom.x = p.a; boom.y = p.b;
    boom.life = boom.life0 = 0.3;
    boom.radius = P.area;
    boom.fx = 'boom';
    boom.tint = p.tint;
    boom.dmg = P.damage;
    boom.kb = P.knockback || 0;
    boom.once = true;
    boom.pierce = 1e9;
    boom.wid = w.id;
    boom.ws = w;
    const fire = sim.addProjectile('player', w.def.sprite);
    fire.x = p.a; fire.y = p.b;
    fire.life = fire.life0 = P.duration;
    fire.radius = P.area * 0.85;
    fire.fx = 'fire';
    fire.tint = p.tint;
    fire.dmg = P.damage * (P.fireDamage || 0.3);
    fire.rehit = TICK;
    fire.pierce = 1e9;
    fire.wid = w.id;
    fire.slot = w.slot;
    fire.ws = w;
  },
};
