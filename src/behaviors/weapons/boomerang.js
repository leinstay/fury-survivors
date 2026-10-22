// War Axe: топор летит на дальность area и возвращается к игроку, пробивая всех на пути.
import { WEAPON_BEHAVIOR } from '../../data/weapons.js';

const SPREAD = 0.35;
const { targetRange: TARGET_RANGE, hitRadius: HIT_RADIUS } = WEAPON_BEHAVIOR.boomerang;
const SPIN = 14;
const RETURN_BOOST = 1.15;

export const boomerang = {
  init(w) { w.cooldown = 0.3; },
  update(w, sim, dt) {
    w.cooldown -= dt;
    if (w.cooldown > 0) return;
    const P = w.params;
    const pl = w.owner;
    const t = sim.nearestEnemy(pl.x, pl.y, TARGET_RANGE);
    if (!t) { w.cooldown = 0.1; return; }
    w.cooldown = P.cooldown;
    const base = Math.atan2(t.y - pl.y, t.x - pl.x);
    const n = P.amount;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * SPREAD;
      const p = sim.addProjectile('player', w.def.sprite);
      p.x = pl.x; p.y = pl.y;
      p.angle = a;
      p.vx = Math.cos(a) * P.speed;
      p.vy = Math.sin(a) * P.speed;
      p.life = P.duration;
      p.radius = HIT_RADIUS;
      p.dmg = P.damage;
      p.kb = P.knockback || 0;
      p.pierce = 1e9;
      p.wid = w.id;
      p.slot = w.slot;
      p.ws = w;
      p.bk = boomerang;
      p.a = 0;   // пройденный путь
      p.c = 0;   // 0 - летит вперёд, 1 - возвращается
    }
    sim.events.push({ type: 'weaponFire', weapon: w.id });
  },
  moveProjectile(p, w, sim, dt) {
    if (w.removed) { p.life = 0; return; }
    const sp = w.params.speed;
    p.dmg = w.params.damage;
    if (p.c === 0) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.a += sp * dt;
      if (p.a >= w.params.area) { p.c = 1; p.hitN = 0; }
    } else {
      const pl = w.owner;
      const dx = pl.x - p.x;
      const dy = pl.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 10) { p.life = 0; return; }
      const k = (sp * RETURN_BOOST * dt) / d;
      p.x += dx * k;
      p.y += dy * k;
    }
    p.angle += SPIN * dt;
  },
};
