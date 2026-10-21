// Blade Arc: серия взмахов рядом с игроком. Взмахи чередуют стороны; первый целится в ближайшего врага.
const SWING_GAP = 0.18;
const SWING_LIFE = 0.16;

function swing(w, sim) {
  const P = w.params;
  const pl = sim.player;
  if (w.n === 0) {
    const t = sim.nearestEnemy(pl.x, pl.y, P.area * 2.2);
    w.base = t ? Math.atan2(t.y - pl.y, t.x - pl.x) : (pl.facing > 0 ? 0 : Math.PI);
  }
  const dir = w.base + ((w.n & 1) ? Math.PI : 0);
  w.n++;
  const off = P.area * 0.55;
  const p = sim.addProjectile('player', w.def.sprite);
  p.x = pl.x + Math.cos(dir) * off;
  p.y = pl.y + Math.sin(dir) * off;
  p.angle = dir;
  p.scale = (P.area * 1.3) / 64;
  p.alpha = 0.9;
  p.life = SWING_LIFE;
  p.radius = P.area * 0.65;
  p.dmg = P.damage;
  p.kb = P.knockback || 0;
  p.once = true;
  p.pierce = 1e9;
  p.wid = w.id;
  p.ws = w;
  p.bk = meleeArc;
  p.a = dir;
  p.b = off;
}

const meleeArc = {
  init(w) { w.q = 0; w.n = 0; w.t = 0; w.base = 0; w.cooldown = 0.2; },
  update(w, sim, dt) {
    if (w.q > 0) {
      w.t -= dt;
      if (w.t <= 0) { swing(w, sim); w.q--; w.t = SWING_GAP; }
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
    p.x = sim.player.x + Math.cos(p.a) * p.b;
    p.y = sim.player.y + Math.sin(p.a) * p.b;
  },
};
export default meleeArc;
