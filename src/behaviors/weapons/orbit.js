// Guardian Shields: щиты вращаются вокруг игрока duration секунд, потом пауза cooldown. Щиты бьют врагов и
// ловят вражеские снаряды (и у эволюций и коллабов со щитами: они собраны из того же behavior).
// Для супероружия duration огромный, щиты не гаснут.
// Необязательно: slow, slowTime — враги, которых касается шар, замедляются (скорость × slow на slowTime с,
// behaviors/status.js; frost_orb); blocks: false — не ловит вражеские снаряды.
import { WEAPON_BEHAVIOR } from '../../data/weapons.js';
import { applySlow } from '../status.js';

const TAU = Math.PI * 2;
const { hitRadius: SHIELD_RADIUS, rehit: REHIT } = WEAPON_BEHAVIOR.orbit;
const buf = new Int32Array(4096);

// Замедлить всех врагов, которых касается шар p.
function chill(p, w, sim) {
  const P = w.params;
  const en = sim.enemies;
  const cnt = sim.grid.query(p.x, p.y, p.radius + sim.maxSize, buf);
  for (let c = 0; c < cnt; c++) {
    const e = en[buf[c]];
    if (e.dead) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const r = p.radius + e.size;
    if (dx * dx + dy * dy <= r * r) applySlow(e, sim, P.slow, P.slowTime);
  }
}

function addShield(w, sim) {
  const p = sim.addProjectile('player', w.def.sprite);
  p.life = 1e9;
  p.radius = w.params.hitRadius ?? SHIELD_RADIUS;
  p.scale = w.params.size ?? 1;
  p.dmg = w.params.damage;
  p.kb = w.params.knockback || 0;
  p.pierce = 1e9;
  p.rehit = REHIT;
  p.rehitOwn = true; // каждый щит бьёт цель по своему таймеру, как книги в VS
  p.blocks = w.params.blocks !== false; // ловит вражеские снаряды (sim._updateProjectiles)
  p.ySort = true;    // над своим героем щит проходит за ним, в остальном поверх всего (render/world.js)
  p.wid = w.id;
  p.slot = w.slot;
  p.ws = w;
  p.bk = orbit;
  p.a = w.shields.length;
  w.shields.push(p);
}

export const orbit = {
  init(w) { w.shields = []; w.active = false; w.timer = 0.2; w.t = 0; },
  update(w, sim, dt) {
    const P = w.params;
    w.t += P.speed * dt;
    w.timer -= dt;
    if (w.active) {
      while (w.shields.length < P.amount) addShield(w, sim);
      while (w.shields.length > P.amount) w.shields.pop().life = 0;
      if (w.timer <= 0) {
        for (let i = 0; i < w.shields.length; i++) w.shields[i].life = 0;
        w.shields.length = 0;
        w.active = false;
        w.timer = P.cooldown;
      }
    } else if (w.timer <= 0) {
      w.active = true;
      w.timer = P.duration;
      sim.events.push({ type: 'weaponFire', weapon: w.id });
    }
  },
  moveProjectile(p, w, sim) {
    if (w.removed) { p.life = 0; return; }
    const n = w.shields.length || 1;
    const a = w.t + (p.a * TAU) / n;
    p.x = w.owner.x + Math.cos(a) * w.params.area;
    p.y = w.owner.y + Math.sin(a) * w.params.area;
    p.angle = a + Math.PI / 2;
    p.dmg = w.params.damage;
    p.kb = w.params.knockback || 0;
    if (w.params.slow && !w.owner.dead) chill(p, w, sim);
  },
};
