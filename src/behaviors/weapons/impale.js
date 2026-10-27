// Spear: копьё-пронзание. Раз в cooldown amount копий веером в ближайшего врага (или объект). Копьё пробивает
// первых 1 + pierce врагов и пригвождает каждого: враг стоит на месте pin с (корень applyRoot, свой таймер,
// боссы поддаются наполовину, behaviors/status.js). Когда пробивать больше некого или кончилось время полёта
// (duration), копьё втыкается в землю и торчит WEAPON_BEHAVIOR.impale.stuck с (картинка, не бьёт).
// Необязательно: burst — воткнувшееся копьё взрывается кругом радиусом burst (× стат area): урон damage всем
// в круге и пригвождение их (dragon_lance).
// Урон, отбрасывание, статусы и объекты считает sim (_projectileHits), здесь только пригвождение: оно идёт в
// moveProjectile до удара сима в том же шаге, в том же порядке обхода сетки и с тем же лимитом целей.
// Состояние снаряда: p.c 0 летит, 1 торчит в земле; p.b — сколько врагов уже пригвождено. Без RNG.
import { WEAPON_BEHAVIOR } from '../../data/weapons.js';
import { applyRoot } from '../status.js';

const I = WEAPON_BEHAVIOR.impale;
const FLYING = 0;
const STUCK = 1;
const buf = new Int32Array(4096);

// Цель уже задета этим снарядом (память сима p.hitUid, как sim._seen).
function seen(p, uid) {
  const n = Math.min(p.hitN, p.hitUid.length);
  for (let i = 0; i < n; i++) if (p.hitUid[i] === uid) return true;
  return false;
}

// Пригвоздить новых врагов, которых касается летящее копьё, пока не набран лимит 1 + pierce.
function pinTouched(p, w, sim) {
  const en = sim.enemies;
  const cnt = sim.grid.query(p.x, p.y, p.radius + sim.maxSize, buf);
  const max = (w.params.pierce || 0) + 1;
  for (let i = 0; i < cnt && p.b < max; i++) {
    const e = en[buf[i]];
    if (e.dead) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const r = p.radius + e.size;
    if (dx * dx + dy * dy > r * r || seen(p, e.uid)) continue;
    applyRoot(e, sim, w.params.pin);
    p.b++;
  }
}

// Взрыв воткнувшегося копья (burst): удар кругом и пригвождение всех в круге.
function burst(p, w, sim) {
  const P = w.params;
  const r = P.burst * (w.owner.stats.area || 1);
  const b = sim.addProjectile('player', w.def.sprite);
  b.x = p.x; b.y = p.y;
  b.life = b.life0 = I.burstLife;
  b.radius = r;
  b.fx = 'boom';
  b.tint = p.tint;
  b.dmg = P.damage;
  b.kb = 0;
  b.once = true;
  b.pierce = 1e9;
  b.wid = w.id;
  b.slot = w.slot;
  b.ws = w;
  const en = sim.enemies;
  const cnt = sim.grid.query(p.x, p.y, r + sim.maxSize, buf);
  for (let i = 0; i < cnt; i++) {
    const e = en[buf[i]];
    if (e.dead) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const rr = r + e.size;
    if (dx * dx + dy * dy <= rr * rr) applyRoot(e, sim, P.pin);
  }
}

export const impale = {
  init(w) { w.cooldown = I.first; },
  update(w, sim, dt) {
    w.cooldown -= dt;
    if (w.cooldown > 0) return;
    const P = w.params;
    const pl = w.owner;
    const t = sim.nearestTarget(pl.x, pl.y, I.targetRange);
    if (!t) { w.cooldown = I.retry; return; }
    w.cooldown = P.cooldown;
    const base = Math.atan2(t.y - pl.y, t.x - pl.x);
    const n = P.amount;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * I.spread;
      const p = sim.addProjectile('player', w.def.sprite);
      p.x = pl.x; p.y = pl.y;
      p.angle = a;
      p.vx = Math.cos(a) * P.speed;
      p.vy = Math.sin(a) * P.speed;
      p.life = P.duration;
      p.radius = P.hitRadius || I.hitRadius;
      p.dmg = P.damage;
      p.kb = P.knockback || 0;
      p.pierce = P.pierce || 0;
      p.wid = w.id;
      p.slot = w.slot;
      p.ws = w;
      p.bk = impale;
      p.c = FLYING;
      p.b = 0;
    }
    sim.events.push({ type: 'weaponFire', weapon: w.id });
  },
  moveProjectile(p, w, sim, dt) {
    if (p.c === STUCK) {
      if (w.removed) { p.life = 0; return; }
      p.alpha = I.stuckAlpha * Math.min(1, p.life / I.fadeOut);
      return;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (!w.owner.dead) pinTouched(p, w, sim);
  },
  expire(p, w, sim) {
    if (p.c !== FLYING || w.removed) return;
    // копьё втыкается в землю там, где остановилось
    const s = sim.addProjectile('player', w.def.sprite);
    s.x = p.x; s.y = p.y;
    s.angle = p.angle;
    s.tint = p.tint;
    s.life = s.life0 = I.stuck;
    s.alpha = I.stuckAlpha;
    s.wid = w.id;
    s.slot = w.slot;
    s.ws = w;
    s.bk = impale;
    s.c = STUCK;
    if (w.params.burst > 0 && !w.owner.dead) burst(p, w, sim);
  },
};
