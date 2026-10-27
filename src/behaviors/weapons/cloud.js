// Poison Cloud: облако ложится в точку героя и стоит на месте duration секунд (как святая земля, но не ходит
// за героем), бьёт каждого врага внутри раз в tick и вешает статус оружия (яд). amount облаков: у каждого свой
// таймер cooldown, первые разнесены на cooldown / amount, поэтому облака выходят по очереди, а не пачкой.
// Врагов в propRange нет, а разрушаемый объект есть — облако ложится на объект (как первая бомба area_drop).
// Облака одного оружия делят таймер повторного удара (e.hitAt[slot]): в двух облаках сразу враг бьётся раз в tick.
// Картинка — спрайт w.def.sprite на размер облака, проявляется и гаснет (WEAPON_BEHAVIOR.cloud).
import { WEAPON_BEHAVIOR } from '../../data/weapons.js';

const C = WEAPON_BEHAVIOR.cloud;

function drop(w, sim) {
  const P = w.params;
  const pl = w.owner;
  const foe = sim.nearestEnemy(pl.x, pl.y, C.propRange);
  const prop = foe ? null : sim.nearestProp(pl.x, pl.y, C.propRange);
  const p = sim.addProjectile('player', w.def.sprite);
  p.x = prop ? prop.x : pl.x;
  p.y = prop ? prop.y : pl.y;
  p.life = p.life0 = P.duration;
  p.radius = P.area;
  p.scale = (P.area * 2) / C.spriteWorld;
  p.alpha = 0;
  p.dmg = P.damage;
  p.rehit = P.tick;
  p.kb = P.knockback || 0;
  p.pierce = 1e9;
  p.wid = w.id;
  p.slot = w.slot;
  p.ws = w;
  p.bk = cloud;
  sim.events.push({ type: 'weaponFire', weapon: w.id });
}

// Таймеры по числу облаков (amount мог вырасти с уровнем): новое облако встаёт со своим сдвигом.
function sync(w) {
  const P = w.params;
  const n = Math.max(1, P.amount || 1);
  while (w.timers.length < n) {
    const k = w.timers.length;
    w.timers.push(C.first + (k * P.cooldown) / n);
  }
  w.timers.length = n;
}

export const cloud = {
  init(w) { w.timers = []; sync(w); },
  update(w, sim, dt) {
    sync(w);
    const ts = w.timers;
    for (let k = 0; k < ts.length; k++) {
      ts[k] -= dt;
      if (ts[k] > 0) continue;
      drop(w, sim);
      ts[k] = w.params.cooldown;
    }
  },
  moveProjectile(p, w) {
    if (w.removed) { p.life = 0; return; }
    const age = p.life0 - p.life;
    p.alpha = C.alpha * Math.max(0, Math.min(1, age / C.fadeIn, p.life / C.fadeOut));
  },
};
