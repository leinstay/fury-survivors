// Holy Ground: постоянная зона вокруг игрока, бьёт каждого врага внутри раз в cooldown.
export const aura = {
  init(w) { w.p = null; },
  update(w, sim) {
    const P = w.params;
    let p = w.p;
    if (!p) {
      p = sim.addProjectile('player', w.def.sprite);
      p.life = 1e9;
      p.pierce = 1e9;
      p.fx = 'aura';
      p.wid = w.id;
      p.slot = w.slot;
      p.ws = w;
      p.bk = aura;
      w.p = p;
    }
    p.radius = P.area;
    p.scale = (P.area * 2) / 64;
    p.dmg = P.damage;
    p.rehit = P.cooldown;
    p.kb = P.knockback || 0;
  },
  moveProjectile(p, w, sim) {
    if (w.removed) { p.life = 0; return; }
    p.x = w.owner.x;
    p.y = w.owner.y;
  },
};
