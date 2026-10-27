// Wisp: amount огоньков держатся за героем каждый на своём месте окружности orbitR (WEAPON_BEHAVIOR.summon),
// слегка блуждая вокруг него (wander), догоняют с силой follow, и
// каждый сам стреляет в ближайшего к себе врага (или объект, если врагов нет) раз в cooldown секунд.
// Выстрел — снаряд w.def.shot: speed, duration (время полёта), pierce, knockback. У самих огоньков урона нет.
// Выстрел доворачивает на свою цель (shotTurn рад/с), пока не долетит до неё, затем летит прямо; бьёт любого
// врага на пути (общие попадания снарядов sim._projectileHits), не только цель.
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
  const t = sim.nearestTarget(p.x, p.y, S.targetRange); // враг или разрушаемый объект
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
  s.tgt = t;
  s.b = t.uid; // объект цели из пула мог смениться: доворот только пока uid тот же
  s.bk = shot;
  return true;
}

// Полёт выстрела: доворот к живой цели не больше shotTurn·dt за тик, у цели — дальше прямо.
const shot = {
  moveProjectile(p, w, sim, dt) {
    const t = p.tgt;
    if (t && !t.dead && t.uid === p.b) {
      const dx = t.x - p.x;
      const dy = t.y - p.y;
      const r = p.radius + (t.size || t.radius || 0);
      if (dx * dx + dy * dy <= r * r) {
        p.tgt = null;
      } else {
        let d = Math.atan2(dy, dx) - p.angle;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const m = S.shotTurn * dt;
        p.angle += d > m ? m : d < -m ? -m : d;
        const v = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(p.angle) * v;
        p.vy = Math.sin(p.angle) * v;
      }
    } else {
      p.tgt = null;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  },
};

export const summon = {
  init(w) { w.wisps = []; w.t = 0; },
  update(w, sim, dt) {
    const P = w.params;
    w.t += dt;
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
    const a = S.slotAngle + (p.a * TAU) / n;
    // блуждание: сумма синусов с разными частотами и фазами по номеру огонька (детерминировано, время сима)
    const t = w.t * S.wanderSpeed;
    const f = p.a * 1.7;
    const wx = S.wander * (0.6 * Math.sin(t * 1.1 + f) + 0.4 * Math.sin(t * 2.3 + f * 2));
    const wy = S.wander * (0.6 * Math.sin(t * 1.4 + f + 1) + 0.4 * Math.sin(t * 2.9 - f));
    const tx = pl.x + Math.cos(a) * S.orbitR + wx;
    const ty = pl.y - S.lift + Math.sin(a) * S.orbitR * S.flatten + wy;
    const k = Math.min(1, S.follow * dt);
    p.x += (tx - p.x) * k;
    p.y += (ty - p.y) * k;
  },
};
