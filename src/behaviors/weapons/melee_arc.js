// Blade Arc: серия ударов конусом из героя. Взмахи чередуют стороны; первый целится в ближайшего врага.
// Дуга рисуется по краю конуса, центр её окружности — середина тела героя.
import { WEAPON_BEHAVIOR } from '../../data/weapons.js';

const ARC = WEAPON_BEHAVIOR.melee_arc;

function swing(w, sim) {
  const P = w.params;
  const pl = w.owner;
  if (w.n === 0) {
    const t = sim.nearestEnemy(pl.x, pl.y, P.area * ARC.aimRange);
    w.base = t ? Math.atan2(t.y - pl.y, t.x - pl.x) : (pl.facing > 0 ? 0 : Math.PI);
  }
  const dir = w.base + ((w.n & 1) ? Math.PI : 0);
  w.n++;
  const reach = P.area * ARC.arcRadius;
  const p = sim.addProjectile('player', w.def.sprite);
  p.x = pl.x;
  p.y = pl.y;
  p.angle = dir;
  // внешняя дуга кадра (texRadius) ложится на окружность длины удара вокруг героя
  p.scale = (reach * ARC.tex) / (ARC.texRadius * ARC.spriteWorld);
  p.drawOff = ((ARC.tex / 2 - ARC.texCenterX) / ARC.tex) * ARC.spriteWorld * p.scale;
  p.drawLift = ARC.bodyLift;
  p.alpha = 0.9;
  p.life = ARC.swingLife;
  p.radius = reach;
  p.cone = Math.cos((ARC.arcSpan * Math.PI) / 180);
  p.dmg = P.damage;
  p.kb = P.knockback || 0;
  p.once = true;
  p.pierce = 1e9;
  p.wid = w.id;
  p.ws = w;
  p.bk = meleeArc;
  p.a = dir;
  p.b = 0;   // вершина конуса идёт за героем
}

export const meleeArc = {
  init(w) { w.q = 0; w.n = 0; w.t = 0; w.base = 0; w.cooldown = 0.2; },
  update(w, sim, dt) {
    if (w.q > 0) {
      w.t -= dt;
      if (w.t <= 0) { swing(w, sim); w.q--; w.t = ARC.swingGap; }
    }
    w.cooldown -= dt;
    if (w.cooldown <= 0 && w.q === 0) {
      w.cooldown = w.params.cooldown;
      w.q = w.params.amount;
      w.n = 0;
      w.t = 0;
      sim.events.push({ type: 'weaponFire', weapon: w.id });
    }
  },
  moveProjectile(p, w, sim) {
    p.x = w.owner.x + Math.cos(p.a) * p.b;
    p.y = w.owner.y + Math.sin(p.a) * p.b;
  },
};
