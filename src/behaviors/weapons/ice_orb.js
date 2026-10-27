// Frost Orb: ледяной шар как Ice Shard / ледяные сферы PoE. Раз в cooldown amount крупных медленных шаров летят
// к ближайшему врагу (или объекту), пробивают всех и живут duration с. Шар бьёт каждого врага внутри себя
// (радиус area) раз в tick на damage (таймер общий на оружие, e.hitAt[slot]) и замораживает всех, кто проходит
// сквозь него: скорость × status.slow ещё status.duration с после выхода.
// Необязательно: turn — рад/с, шар закручивает курс (спираль-смерч, blizzard); при нём шары выходят во все
// стороны поровну, начиная с направления на цель. Без turn шары идут веером по WEAPON_BEHAVIOR.ice_orb.spread.
// Картинка: спрайт w.def.sprite, видимый радиус area × visual (ORBIT_R спрайта = видимый радиус при scale 1;
// ядро меньше зоны удара, вокруг него ореол FX.projGlow), крутится.
// Заморозка — статус уровня status: { type: 'chill', chance: 1, slow, duration } (behaviors/status.js): на каждом
// шаге всем, кто внутри шара (а не только по ударам), и ещё duration с после выхода.
import { WEAPON_BEHAVIOR, ORBIT_R } from '../../data/weapons.js';
import { applyStatus } from '../status.js';

const O = WEAPON_BEHAVIOR.ice_orb;
const TAU = Math.PI * 2;
const buf = new Int32Array(4096);

// Заморозить всех врагов внутри шара.
function chill(p, w, sim) {
  const st = w.params.status;
  if (!st) return;
  const en = sim.enemies;
  const cnt = sim.grid.query(p.x, p.y, p.radius + sim.maxSize, buf);
  for (let i = 0; i < cnt; i++) {
    const e = en[buf[i]];
    if (e.dead) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const r = p.radius + e.size;
    if (dx * dx + dy * dy <= r * r) applyStatus(e, sim, st, 0, w.id, w.owner);
  }
}

export const iceOrb = {
  init(w) { w.cooldown = O.first; },
  update(w, sim, dt) {
    w.cooldown -= dt;
    if (w.cooldown > 0) return;
    const P = w.params;
    const pl = w.owner;
    const t = sim.nearestTarget(pl.x, pl.y, O.targetRange);
    if (!t) { w.cooldown = O.retry; return; }
    w.cooldown = P.cooldown;
    const base = Math.atan2(t.y - pl.y, t.x - pl.x);
    const n = Math.max(1, P.amount || 1);
    const r0 = ORBIT_R[w.def.sprite] || O.spriteR;
    for (let i = 0; i < n; i++) {
      const a = P.turn ? base + (i * TAU) / n : base + (i - (n - 1) / 2) * O.spread;
      const p = sim.addProjectile('player', w.def.sprite);
      p.x = pl.x; p.y = pl.y;
      p.angle = a;
      p.a = a;           // курс
      p.life = p.life0 = P.duration;
      p.radius = P.area;
      p.scale = (P.area * O.visual) / r0;
      p.dmg = P.damage;
      p.kb = P.knockback || 0;
      p.rehit = P.tick;
      p.pierce = 1e9;
      p.wid = w.id;
      p.slot = w.slot;
      p.ws = w;
      p.bk = iceOrb;
    }
    sim.events.push({ type: 'weaponFire', weapon: w.id });
  },
  moveProjectile(p, w, sim, dt) {
    if (w.removed) { p.life = 0; return; }
    const P = w.params;
    if (P.turn) p.a += P.turn * dt;
    p.x += Math.cos(p.a) * P.speed * dt;
    p.y += Math.sin(p.a) * P.speed * dt;
    p.angle += O.spin * dt;
    const age = p.life0 - p.life;
    p.alpha = Math.max(0, Math.min(1, age / O.fadeIn, p.life / O.fadeOut));
    if (!w.owner.dead) chill(p, w, sim);
  },
};
