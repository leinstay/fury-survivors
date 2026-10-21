// Storm Chain: молния бьёт ближайшего врага и перескакивает на соседей. Урон мгновенный, снаряды только для вида.
const VISUAL_LIFE = 0.14;

function segment(sim, x0, y0, x1, y1, sprite) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  const n = Math.min(12, Math.max(1, Math.ceil(len / 10)));
  const ang = Math.atan2(dy, dx);
  for (let i = 1; i <= n; i++) {
    const p = sim.addProjectile('player', sprite);
    p.x = x0 + (dx * i) / n;
    p.y = y0 + (dy * i) / n;
    p.angle = ang;
    p.scale = 0.7;
    p.life = VISUAL_LIFE;
  }
}

export default {
  init(w) { w.cooldown = 0.4; },
  update(w, sim, dt) {
    w.cooldown -= dt;
    if (w.cooldown > 0) return;
    const P = w.params;
    const pl = sim.player;
    const first = sim.nearestEnemy(pl.x, pl.y, P.range);
    if (!first) { w.cooldown = 0.15; return; }
    w.cooldown = P.cooldown;
    const stamp = sim.nextStamp();
    for (let b = 0; b < P.amount; b++) {
      let cur = b === 0 ? first : sim.nearestEnemy(pl.x, pl.y, P.range, stamp);
      if (!cur) break;
      let x = pl.x;
      let y = pl.y;
      for (let j = 0; j <= P.jumps && cur; j++) {
        cur.mark = stamp;
        segment(sim, x, y, cur.x, cur.y, w.def.sprite);
        sim.damageEnemy(cur, P.damage, w.id, P.knockback || 0, x, y);
        x = cur.x; y = cur.y;
        cur = sim.nearestEnemy(x, y, P.area, stamp);
      }
    }
    sim.events.push({ type: 'weaponFire', weapon: w.id });
  },
};
