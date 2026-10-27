// Hammer: удар по земле. Раз в cooldown серия из amount ударов: первый под героем со сдвигом к ближайшему врагу
// (или объекту), каждый следующий дальше по той же линии (волна землетрясения идёт вперёд). Удар бьёт всех в
// радиусе area один раз и отбрасывает от центра. На месте удара остаётся трещина радиусом area × crack на
// duration с: враги внутри замедляются (скорость × slow, держится ещё slowTime с после выхода; behaviors/status.js),
// трещина медленно гаснет (alpha). Трещина сама не бьёт (dmg 0), только замедляет.
// Состояние оружия: w.q — сколько ударов серии осталось, w.n — номер удара, w.t — пауза до следующего,
// w.base — направление серии. Без RNG: цель и точки удара зависят только от позиций.
import { WEAPON_BEHAVIOR } from '../../data/weapons.js';
import { applySlow } from '../status.js';

const S = WEAPON_BEHAVIOR.slam;
const buf = new Int32Array(4096);

// Направление серии: на ближайшего врага, иначе на объект, иначе куда смотрит герой.
function aim(w, sim) {
  const pl = w.owner;
  const r = w.params.area * S.aimRange;
  const t = sim.nearestTarget(pl.x, pl.y, r);
  return t ? Math.atan2(t.y - pl.y, t.x - pl.x) : (pl.facing > 0 ? 0 : Math.PI);
}

function strike(w, sim) {
  const P = w.params;
  const pl = w.owner;
  if (w.n === 0) w.base = aim(w, sim);
  const d = P.area * (S.offset + w.n * S.step);
  w.n++;
  const x = pl.x + Math.cos(w.base) * d;
  const y = pl.y + Math.sin(w.base) * d;
  const tint = w.def.tint || S.tint;
  // ударная волна: бьёт один раз всех в радиусе
  const p = sim.addProjectile('player', w.def.sprite);
  p.x = x; p.y = y;
  p.life = p.life0 = S.ring;
  p.radius = P.area;
  p.fx = 'boom';
  p.tint = tint;
  p.dmg = P.damage;
  p.kb = P.knockback || 0;
  p.once = true;
  p.pierce = 1e9;
  p.wid = w.id;
  p.slot = w.slot;
  p.ws = w;
  // трещина: замедляет и гаснет
  const c = sim.addProjectile('player', w.def.sprite);
  c.x = x; c.y = y;
  c.angle = w.base;
  c.life = c.life0 = P.duration;
  c.radius = P.area * S.crack;
  c.fx = 'crack';
  c.tint = tint;
  c.wid = w.id;
  c.slot = w.slot;
  c.ws = w;
  c.bk = slam;
}

// Замедлить врагов внутри трещины p.
function chill(p, w, sim) {
  const P = w.params;
  const en = sim.enemies;
  const cnt = sim.grid.query(p.x, p.y, p.radius + sim.maxSize, buf);
  for (let i = 0; i < cnt; i++) {
    const e = en[buf[i]];
    if (e.dead) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const r = p.radius + e.size;
    if (dx * dx + dy * dy <= r * r) applySlow(e, sim, P.slow, P.slowTime);
  }
}

export const slam = {
  init(w) { w.q = 0; w.n = 0; w.t = 0; w.base = 0; w.cooldown = S.first; },
  update(w, sim, dt) {
    if (w.q > 0) {
      w.t -= dt;
      if (w.t <= 0) { strike(w, sim); w.q--; w.t = S.gap; }
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
  // только трещины: гаснут к концу (последние S.fade доли жизни) и замедляют врагов
  moveProjectile(p, w, sim) {
    if (w.removed) { p.life = 0; return; }
    p.alpha = Math.min(1, p.life / (p.life0 * S.fade));
    if (!w.owner.dead && w.params.slow < 1) chill(p, w, sim);
  },
};
