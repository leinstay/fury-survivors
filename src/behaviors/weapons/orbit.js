// Guardian Shields: щиты вращаются вокруг игрока duration секунд, потом пауза cooldown.
// Для супероружия duration огромный, щиты не гаснут.
import { WEAPON_BEHAVIOR } from '../../data/weapons.js';

const TAU = Math.PI * 2;
const { hitRadius: SHIELD_RADIUS, rehit: REHIT } = WEAPON_BEHAVIOR.orbit;

function addShield(w, sim) {
  const p = sim.addProjectile('player', w.def.sprite);
  p.life = 1e9;
  p.radius = w.params.hitRadius ?? SHIELD_RADIUS;
  p.scale = w.params.size ?? 1;
  p.dmg = w.params.damage;
  p.kb = w.params.knockback || 0;
  p.pierce = 1e9;
  p.rehit = REHIT;
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
    p.x = sim.player.x + Math.cos(a) * w.params.area;
    p.y = sim.player.y + Math.sin(a) * w.params.area;
    p.angle = a + Math.PI / 2;
    p.dmg = w.params.damage;
    p.kb = w.params.knockback || 0;
  },
};
