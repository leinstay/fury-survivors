// Beam: раз в cooldown amount лучей из точки, где стоял герой в момент каста, в случайные стороны (RNG сима:
// i-й луч в своём секторе 360° / amount, поэтому лучи одного каста не слипаются). Луч не целится и не следует
// за героем: стоит на месте duration секунд и каждые tick секунд (первый удар сразу) бьёт всех врагов на отрезке
// длиной area и полушириной width (плюс размер врага) и ломает объекты на нём. Тики по времени сима.
// Картинка — звенья спрайта w.def.sprite вдоль луча (WEAPON_BEHAVIOR.beam.segment px на звено) от окружности выхода
// оружия (FX.weaponOrigin: radius от центра тела) до конца, подняты на lift px: луч не выходит из тела героя. Урона у звеньев нет, двигать их не нужно.
import { WEAPON_BEHAVIOR } from '../../data/weapons.js';
import { FX } from '../../data/constants.js';

const B = WEAPON_BEHAVIOR.beam;
const WO = FX.weaponOrigin; // картинка луча — с окружности вокруг героя, не из тела
const TAU = Math.PI * 2;
const EPS = 1e-9;
const buf = new Int32Array(4096);

function cast(w, sim) {
  const P = w.params;
  const pl = w.owner;
  const n = Math.max(1, P.amount || 1);
  const vis = Math.max(B.segment, P.area - WO.radius); // видимая часть: от окружности до конца луча
  const per = Math.max(1, Math.ceil(vis / B.segment));
  for (let i = 0; i < n; i++) {
    const a = ((i + sim.rng.next()) * TAU) / n;
    const b = {
      x: pl.x, y: pl.y, a, cx: Math.cos(a), cy: Math.sin(a), len: P.area, width: P.width,
      dmg: P.damage, kb: P.knockback || 0, tick: P.tick, next: sim.time, end: sim.time + P.duration,
    };
    w.beams.push(b);
    for (let j = 0; j < per; j++) {
      const p = sim.addProjectile('player', w.def.sprite);
      const d = WO.radius + ((j + 0.5) / per) * vis; // середина звена
      p.x = b.x + b.cx * d;
      p.y = b.y + b.cy * d;
      p.angle = a;
      p.life = P.duration;
      p.alpha = B.alpha;
      p.drawLift = WO.lift;
      p.wid = w.id;
      p.slot = w.slot;
    }
  }
  sim.events.push({ type: 'weaponFire', weapon: w.id });
}

// Удар одного луча по врагам и объектам.
function burn(w, sim, b) {
  const en = sim.enemies;
  const half = b.len / 2;
  const reach = half + b.width + sim.maxSize;
  const cnt = sim.grid.query(b.x + b.cx * half, b.y + b.cy * half, reach, buf);
  for (let c = 0; c < cnt; c++) {
    const e = en[buf[c]];
    if (e.dead) continue;
    const rx = e.x - b.x;
    const ry = e.y - b.y;
    let k = rx * b.cx + ry * b.cy;
    k = k < 0 ? 0 : k > b.len ? b.len : k;
    const ex = rx - b.cx * k;
    const ey = ry - b.cy * k;
    const r = b.width + e.size;
    if (ex * ex + ey * ey > r * r) continue;
    sim.damageEnemy(e, b.dmg, w.id, b.kb, b.x, b.y, w.owner, `beam:${w.slot}`, w.params.status);
  }
  sim.hitPropsOnSegment(b.x, b.y, b.x + b.cx * b.len, b.y + b.cy * b.len, b.width, sim.nextStamp());
}

export const beam = {
  init(w) { w.beams = []; w.timer = B.first; w.seenAt = -1; },
  update(w, sim, dt) {
    // оружие не обновлялось (герой лежал в гробу): старые лучи не добирают пропущенные тики
    if (w.seenAt >= 0 && sim.time - w.seenAt > dt + 0.25) w.beams.length = 0;
    w.seenAt = sim.time;
    w.timer -= dt;
    if (w.timer <= 0) {
      w.timer = w.params.cooldown;
      cast(w, sim);
    }
    const bs = w.beams;
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      while (b.next <= sim.time + EPS && b.next < b.end - EPS) {
        b.next += b.tick;
        burn(w, sim, b);
      }
      if (b.next >= b.end - EPS || b.end <= sim.time) {
        bs[i] = bs[bs.length - 1];
        bs.pop();
      }
    }
  },
};
