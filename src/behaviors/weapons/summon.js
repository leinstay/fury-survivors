// Wisp: amount огоньков летают за героем по кругу (WEAPON_BEHAVIOR.summon.orbitR px, догоняют с силой follow) и
// каждый сам стреляет в ближайшего к себе врага (или объект, если врагов нет) раз в cooldown секунд.
// Выстрел — снаряд w.def.shot: speed, duration (время полёта), pierce, knockback. У самих огоньков урона нет.
// p.c у огонька — таймер до его выстрела; огоньки разнесены по фазе, чтобы не стрелять залпом.
import { WEAPON_BEHAVIOR } from '../../data/weapons.js';

const S = WEAPON_BEHAVIOR.summon;
const TAU = Math.PI * 2;

function addWisp(w, sim) {
  const pl = w.owner;
  const p = sim.addProjectile('player', w.def.sprite);
  p.life = 1e9;
  p.x = pl.x; p.y = pl.y - S.lift;
  p.wid = w.id;
  p.slot = w.slot;
  p.ws = w;
  p.bk = summon;
  p.a = w.wisps.length;
  p.c = (w.params.cooldown * (w.wisps.length + 1)) / (w.params.amount + 1);
  w.wisps.push(p);
}

function shoot(p, w, sim) {
  const P = w.params;
  const t = sim.nearestEnemy(p.x, p.y, S.targetRange) || sim.nearestProp(p.x, p.y, S.targetRange);
  if (!t) return false;
  const a = Math.atan2(t.y - p.y, t.x - p.x);
  const s = sim.addProjectile('player', w.def.shot);
  s.ws = w;
  s.x = p.x; s.y = p.y;
  s.angle = a;
  s.vx = Math.cos(a) * P.speed;
  s.vy = Math.sin(a) * P.speed;
  s.life = P.duration;
  s.radius = S.hitRadius;
  s.dmg = P.damage;
  s.kb = P.knockback || 0;
  s.pierce = P.pierce || 0;
  s.wid = w.id;
  s.slot = w.slot;
  return true;
}

export const summon = {
  init(w) { w.wisps = []; w.t = 0; },
  update(w, sim, dt) {
    const P = w.params;
    w.t += S.orbitSpeed * dt;
    while (w.wisps.length < P.amount) addWisp(w, sim);
    while (w.wisps.length > P.amount) w.wisps.pop().life = 0;
    let fired = false;
    for (let i = 0; i < w.wisps.length; i++) {
      const p = w.wisps[i];
      p.c -= dt;
      if (p.c > 0) continue;
      if (shoot(p, w, sim)) { p.c = P.cooldown; fired = true; } else p.c = S.retry;
    }
    if (fired) sim.events.push({ type: 'weaponFire', weapon: w.id });
  },
  moveProjectile(p, w, sim, dt) {
    if (w.removed) { p.life = 0; return; }
    const pl = w.owner;
    const n = w.wisps.length || 1;
    const a = w.t + (p.a * TAU) / n;
    const tx = pl.x + Math.cos(a) * S.orbitR;
    const ty = pl.y - S.lift + Math.sin(a) * S.orbitR * S.flatten;
    const k = Math.min(1, S.follow * dt);
    p.x += (tx - p.x) * k;
    p.y += (ty - p.y) * k;
  },
};
