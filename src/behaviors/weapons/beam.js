// Beam: луч из героя по направлению его движения (последний ввод, pl.dirX/dirY). Горит duration секунд, потом
// гаснет на cooldown. Пока горит, каждые tick секунд бьёт всех врагов на отрезке длиной area и полушириной width
// (плюс размер врага) и ломает объекты на нём. Тики по таймеру оружия, без случайности.
// amount лучей расходятся поровну по кругу от направления движения (2 — вперёд и назад).
// Картинка — звенья спрайта w.def.sprite вдоль луча (WEAPON_BEHAVIOR.beam.segment px на звено), урона у звеньев нет.
import { WEAPON_BEHAVIOR } from '../../data/weapons.js';

const B = WEAPON_BEHAVIOR.beam;
const TAU = Math.PI * 2;
const buf = new Int32Array(4096);

function dirOf(w, i) {
  const pl = w.owner;
  return Math.atan2(pl.dirY, pl.dirX) + (i * TAU) / w.params.amount;
}

function light(w, sim) {
  const P = w.params;
  const per = Math.max(1, Math.ceil(P.area / B.segment));
  for (let i = 0; i < P.amount; i++) {
    for (let j = 0; j < per; j++) {
      const p = sim.addProjectile('player', w.def.sprite);
      p.life = 1e9;
      p.alpha = B.alpha;
      p.wid = w.id;
      p.slot = w.slot;
      p.ws = w;
      p.bk = beam;
      p.a = i;
      p.b = (j + 0.5) / per; // доля длины луча до середины звена
      beam.moveProjectile(p, w, sim);
      w.segs.push(p);
    }
  }
}

function douse(w) {
  for (let i = 0; i < w.segs.length; i++) w.segs[i].life = 0;
  w.segs.length = 0;
}

// Удар по всем врагам и объектам на лучах.
function burn(w, sim) {
  const P = w.params;
  const pl = w.owner;
  const en = sim.enemies;
  const stamp = sim.nextStamp();
  const half = P.area / 2;
  for (let i = 0; i < P.amount; i++) {
    const a = dirOf(w, i);
    const cx = Math.cos(a);
    const cy = Math.sin(a);
    const x1 = pl.x + cx * P.area;
    const y1 = pl.y + cy * P.area;
    const reach = half + P.width + sim.maxSize;
    const cnt = sim.grid.query(pl.x + cx * half, pl.y + cy * half, reach, buf);
    for (let c = 0; c < cnt; c++) {
      const e = en[buf[c]];
      if (e.dead) continue;
      const rx = e.x - pl.x;
      const ry = e.y - pl.y;
      let k = rx * cx + ry * cy;
      k = k < 0 ? 0 : k > P.area ? P.area : k;
      const ex = rx - cx * k;
      const ey = ry - cy * k;
      const r = P.width + e.size;
      if (ex * ex + ey * ey > r * r) continue;
      sim.damageEnemy(e, P.damage, w.id, P.knockback || 0, pl.x, pl.y, pl, `beam:${w.slot}`);
    }
    sim.hitPropsOnSegment(pl.x, pl.y, x1, y1, P.width, stamp);
  }
}

export const beam = {
  init(w) { w.segs = []; w.active = false; w.timer = 0.3; w.t = 0; },
  update(w, sim, dt) {
    const P = w.params;
    w.timer -= dt;
    if (w.active) {
      // смена уровня на ходу (число лучей или длина): звенья пересобираются
      const per = Math.max(1, Math.ceil(P.area / B.segment));
      if (w.segs.length !== per * P.amount) { douse(w); light(w, sim); }
      w.t -= dt;
      while (w.t <= 0) { w.t += P.tick; burn(w, sim); }
      if (w.timer <= 0) {
        douse(w);
        w.active = false;
        w.timer = P.cooldown;
      }
    } else if (w.timer <= 0) {
      w.active = true;
      w.timer = P.duration;
      w.t = 0;
      light(w, sim);
      sim.events.push({ type: 'weaponFire', weapon: w.id });
    }
  },
  moveProjectile(p, w) {
    if (w.removed || !w.active) { p.life = 0; return; }
    // лежащий в гробу герой луч не держит; после оживания update соберёт звенья заново
    if (w.owner.dead) { p.life = 0; w.segs.length = 0; return; }
    const a = dirOf(w, p.a);
    const d = p.b * w.params.area;
    p.x = w.owner.x + Math.cos(a) * d;
    p.y = w.owner.y + Math.sin(a) * d;
    p.angle = a;
  },
};
