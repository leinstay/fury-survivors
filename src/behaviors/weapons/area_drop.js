// Firebomb: бомба летит в ближайшего врага, взрывается и оставляет огонь на земле.
// Необязательные поля уровня (src/data/weapons.js):
//   fireDamage > 0 — огонь на земле duration секунд (без него только взрыв);
//   delay — время полёта вместо WEAPON_BEHAVIOR.area_drop.flight; fall — снаряд падает сверху с высоты fall px
//     (метеор), на земле на всё время delay лежит круг-предупреждение, точка удара упреждает врага (lead);
//   mine — мина: ложится в случайную точку не дальше spread px от героя (первая на объект, если врагов нет),
//     ждёт до duration секунд и взрывается, когда враг или объект подходит на trigger px (или по истечении);
//     первые arm секунд на земле (WEAPON_BEHAVIOR.area_drop.mineArm) не срабатывает: мина всегда ложится.
// Состояние снаряда p.c: 0 летит, 1 мина на земле.
import { WEAPON_BEHAVIOR } from '../../data/weapons.js';

const AD = WEAPON_BEHAVIOR.area_drop;
const { targetRange: TARGET_RANGE, flight: FLIGHT, fireTick: TICK } = AD;
const FLYING = 0;
const ARMED = 1;
const buf = new Int32Array(4096);

// Точка падения для i-й бомбы залпа: ближайший ещё не выбранный враг, объект или случайная точка рядом.
function landing(w, sim, i, prop, stamp) {
  const P = w.params;
  const pl = w.owner;
  if (P.mine) {
    if (prop && i === 0) return [prop.x, prop.y];
    const a = sim.rng.next() * Math.PI * 2;
    const r = P.spread * (0.35 + 0.65 * sim.rng.next());
    return [pl.x + Math.cos(a) * r, pl.y + Math.sin(a) * r];
  }
  const t = prop ? null : sim.nearestEnemy(pl.x, pl.y, TARGET_RANGE, stamp);
  if (t) {
    t.mark = stamp;
    if (!P.fall) return [t.x, t.y];
    // метеор падает долго: точка удара сдвинута к герою на путь врага за время падения (враги идут на героя)
    const dx = pl.x - t.x;
    const dy = pl.y - t.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const k = Math.min(d * AD.leadMax, t.speed * (P.delay || FLIGHT) * AD.lead) / d;
    return [t.x + dx * k, t.y + dy * k];
  }
  if (prop && i === 0) return [prop.x, prop.y];
  return [pl.x + (sim.rng.next() - 0.5) * 200, pl.y + (sim.rng.next() - 0.5) * 200];
}

// Метеоры одного залпа не сливаются: точка удара не ближе meteorGap × area к уже выбранным. Сначала другие
// цели (landing метит взятых врагов), потом точка по кругу вокруг первой (детерминированно, без RNG).
function spaced(w, sim, i, prop, stamp, spots, tx, ty) {
  const min = AD.meteorGap * w.params.area;
  const far = (x, y) => {
    for (let k = 0; k < spots.length; k += 2) {
      const dx = x - spots[k];
      const dy = y - spots[k + 1];
      if (dx * dx + dy * dy < min * min) return false;
    }
    return true;
  };
  if (far(tx, ty)) return [tx, ty];
  for (let n = 0; n < AD.meteorTries; n++) {
    const [x, y] = landing(w, sim, i, prop, stamp);
    if (far(x, y)) return [x, y];
  }
  const cx = spots[0];
  const cy = spots[1];
  for (let ring = 1; ring <= 4; ring++) {
    for (let k = 0; k < 6 * ring; k++) {
      const a = (k / (6 * ring)) * Math.PI * 2 + i;
      const x = cx + Math.cos(a) * min * ring;
      const y = cy + Math.sin(a) * min * ring;
      if (far(x, y)) return [x, y];
    }
  }
  return [tx, ty];
}

function explode(p, w, sim) {
  const P = w.params;
  const boom = sim.addProjectile('player', w.def.sprite);
  boom.x = p.a; boom.y = p.b;
  boom.life = boom.life0 = 0.3;
  boom.radius = P.area;
  boom.fx = 'boom';
  boom.tint = p.tint;
  boom.dmg = P.damage;
  boom.kb = P.knockback || 0;
  boom.once = true;
  boom.pierce = 1e9;
  boom.wid = w.id;
  boom.ws = w;
  if (P.mine || !(P.fireDamage > 0) || !(P.duration > 0)) return;
  const fire = sim.addProjectile('player', w.def.sprite);
  fire.x = p.a; fire.y = p.b;
  fire.life = fire.life0 = P.duration;
  fire.radius = P.area * 0.85;
  fire.fx = 'fire';
  fire.tint = p.tint;
  fire.dmg = P.damage * P.fireDamage;
  fire.rehit = TICK;
  fire.pierce = 1e9;
  fire.wid = w.id;
  fire.slot = w.slot;
  fire.ws = w;
}

// Враг или целый объект в радиусе r от мины.
function touched(p, sim, r) {
  const en = sim.enemies;
  const cnt = sim.grid.query(p.x, p.y, r + sim.maxSize, buf);
  for (let c = 0; c < cnt; c++) {
    const e = en[buf[c]];
    if (e.dead) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const rr = r + e.size;
    if (dx * dx + dy * dy <= rr * rr) return true;
  }
  const props = sim.props;
  for (let i = 0; i < props.length; i++) {
    const o = props[i];
    if (o.dead) continue;
    const dx = o.x - p.x;
    const dy = o.y - p.y;
    const rr = r + o.radius;
    if (dx * dx + dy * dy <= rr * rr) return true;
  }
  return false;
}

export const areaDrop = {
  init(w) { w.cooldown = 0.5; },
  update(w, sim, dt) {
    w.cooldown -= dt;
    if (w.cooldown > 0) return;
    const P = w.params;
    const pl = w.owner;
    // врагов рядом нет: первая бомба в ближайший разрушаемый объект, остальные вокруг, как при нехватке целей
    const enemy = sim.nearestEnemy(pl.x, pl.y, TARGET_RANGE);
    const prop = enemy ? null : sim.nearestProp(pl.x, pl.y, TARGET_RANGE);
    if (!enemy && !prop) { w.cooldown = 0.15; return; }
    w.cooldown = P.cooldown;
    const stamp = sim.nextStamp();
    const flight = P.delay || FLIGHT;
    const spots = [];
    for (let i = 0; i < P.amount; i++) {
      let [tx, ty] = landing(w, sim, i, prop, stamp);
      if (P.fall && spots.length) [tx, ty] = spaced(w, sim, i, prop, stamp, spots, tx, ty);
      spots.push(tx, ty);
      const p = sim.addProjectile('player', w.def.sprite);
      if (P.fall) {
        // метеор: падает наискосок сверху, точка удара отмечена кругом
        p.x = tx + P.fall * AD.fallSlant; p.y = ty - P.fall;
        const mark = sim.addProjectile('player', w.def.sprite);
        mark.x = tx; mark.y = ty;
        mark.life = mark.life0 = flight;
        mark.radius = P.area;
        mark.fx = 'aura';
        mark.tint = AD.markTint;
        mark.wid = w.id;
        mark.ws = w;
      } else {
        p.x = pl.x; p.y = pl.y;
      }
      p.vx = (tx - p.x) / flight;
      p.vy = (ty - p.y) / flight;
      p.life = flight;
      p.scale = P.fall ? 1 : 0.8;
      p.wid = w.id;
      p.ws = w;
      p.bk = areaDrop;
      p.a = tx; p.b = ty;
      p.c = FLYING;
    }
    sim.events.push({ type: 'weaponFire', weapon: w.id });
  },
  moveProjectile(p, w, sim, dt) {
    if (p.c === ARMED) {
      if (w.removed) { p.life = 0; return; }
      // пока мина не взведена (первые mineArm с на земле), касание её не рвёт
      if (p.life <= w.params.duration - AD.mineArm && touched(p, sim, w.params.trigger)) p.life = 0;
      return;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (!w.params.fall) p.angle += 8 * dt;
  },
  expire(p, w, sim) {
    if (w.removed) return;
    const P = w.params;
    if (P.mine && p.c === FLYING) {
      // мина легла: ждёт касания
      const m = sim.addProjectile('player', w.def.sprite);
      m.x = p.a; m.y = p.b;
      m.a = p.a; m.b = p.b;
      m.life = P.duration;
      m.tint = p.tint;
      m.wid = w.id;
      m.slot = w.slot;
      m.ws = w;
      m.bk = areaDrop;
      m.c = ARMED;
      return;
    }
    explode(p, w, sim);
  },
};
