// Beam (Beam, Prism Ray): луч-«змейка». Раз в cooldown amount лучей в случайные стороны (RNG сима: i-й луч в
// своём секторе 360° / amount, лучи одного каста не слипаются) с окружности выхода оружия вокруг героя
// (FX.weaponOrigin.radius от точки героя, картинка поднята на lift: из тела луч не выходит). Луч не целится и не
// следует за героем. Голова летит со speed; тело растёт от 0 до length px (стат area на длину не влияет), потом
// длина постоянна и луч ползёт: хвост идёт по пути головы (ломаная p.pts: хвост, углы отскоков, голова; лишнее
// срезается с хвоста). Бьёт только голова (радиус hitRadius, проверка по отрезку шага, без проскока сквозь цель):
// первый задетый на пути враг или разрушаемый объект получает удар, луч поворачивает на 90° влево или вправо
// (RNG сима), урон × bounceDamageMul, длина вдвое (хвост догоняет со скоростью shrink). Враг — не больше одного
// удара за отрезок между отскоками (память p.hitUid: при отскоке в ней остаётся только задетый), объект — один
// раз за луч (штамп p.pierce, как у прочих снарядов). Отскоки кончились — следующий удар последний: голова
// встаёт, хвост догоняет её за fade с, луч гаснет. Так же луч гаснет, пролетев maxTravel px. Без Math.random и
// Date: всё от sim.rng и шага. Числа — WEAPON_BEHAVIOR.beam; рисует render/zones.js (fx 'snake').
// Поля снаряда: x, y — голова, vx, vy — единичный курс (поворот на 90° точный), angle — курс в радианах,
// pts — ломаная [x, y, ...] от хвоста к голове, len — длина тела сейчас, c — длина, к которой тело стремится,
// dmg0 — урон следующего удара (p.dmg 0: общий удар снарядов сима этот луч не трогает), spd — скорость,
// bl — отскоков осталось, dist — путь головы, end — гаснет, endLen — длина в момент угасания.
import { WEAPON_BEHAVIOR } from '../../data/weapons.js';
import { FX } from '../../data/constants.js';

const B = WEAPON_BEHAVIOR.beam;
const WO = FX.weaponOrigin; // луч выходит с окружности вокруг героя, не из тела
const TAU = Math.PI * 2;
const EPS = 1e-9;
const buf = new Int32Array(4096);

function cast(w, sim) {
  const P = w.params;
  const pl = w.owner;
  const n = Math.max(1, P.amount || 1);
  // на экране не больше B.maxAlive змеек этого оружия: залп добирает только свободные места
  let live = 0;
  for (const q of sim.projectiles) if (q.fx === 'snake' && q.ws === w && q.life > 0) live++;
  const free = Math.min(n, B.maxAlive - live);
  if (free <= 0) return;
  for (let i = 0; i < free; i++) {
    const a = ((i + sim.rng.next()) * TAU) / n;
    const p = sim.addProjectile('player', w.def.sprite);
    p.vx = Math.cos(a);
    p.vy = Math.sin(a);
    p.x = pl.x + p.vx * WO.radius;
    p.y = pl.y + p.vy * WO.radius;
    p.angle = a;
    p.radius = B.hitRadius;
    p.fx = 'snake';
    if (!Array.isArray(p.pts)) p.pts = [];
    p.pts.length = 0;
    p.pts.push(p.x, p.y, p.x, p.y);
    p.len = 0;
    p.c = P.length;
    p.dmg0 = P.damage;
    p.spd = P.speed;
    p.bl = P.bounces || 0;
    p.dist = 0;
    p.end = false;
    p.endLen = 0;
    // запас жизни: луч гасит путь maxTravel или последний удар, life — только страховка
    p.life = p.life0 = B.maxTravel / Math.max(1, P.speed) + B.fade + 1;
    p.pierce = sim.nextStamp();
    p.hitN = 0;
    p.wid = w.id;
    p.slot = w.slot;
    p.ws = w;
    p.bk = beam;
    if (w.def.tint) p.tint = w.def.tint;
  }
  sim.events.push({ type: 'weaponFire', weapon: w.id });
}

function seen(p, uid) {
  const n = Math.min(p.hitN, p.hitUid.length);
  for (let i = 0; i < n; i++) if (p.hitUid[i] === uid) return true;
  return false;
}

function remember(p, uid) {
  p.hitUid[p.hitN % p.hitUid.length] = uid;
  p.hitN++;
}

// Длина ломаной не больше p.len: лишнее срезается с хвоста.
function trim(p) {
  const pts = p.pts;
  let total = 0;
  for (let i = 2; i < pts.length; i += 2) {
    const dx = pts[i] - pts[i - 2];
    const dy = pts[i + 1] - pts[i - 1];
    total += Math.sqrt(dx * dx + dy * dy);
  }
  let excess = total - p.len;
  while (excess > EPS && pts.length >= 4) {
    const dx = pts[2] - pts[0];
    const dy = pts[3] - pts[1];
    const s = Math.sqrt(dx * dx + dy * dy);
    if (s <= excess && pts.length > 4) {
      pts.splice(0, 2);
      excess -= s;
      continue;
    }
    const k = s > EPS ? Math.min(1, excess / s) : 1;
    pts[0] += dx * k;
    pts[1] += dy * k;
    break;
  }
}

// Вход головы (круг радиусом R вокруг цели (tx, ty)) на шаге от (x0, y0) вдоль (ux, uy) длиной d:
// расстояние до касания или -1. Цель, в которой голова уже стоит, — касание сразу (0).
function contact(x0, y0, ux, uy, d, tx, ty, R) {
  const rx = tx - x0;
  const ry = ty - y0;
  const r2 = rx * rx + ry * ry;
  if (r2 <= R * R) return 0;
  const k = rx * ux + ry * uy;
  if (k < 0) return -1;
  const h2 = r2 - k * k;
  if (h2 > R * R) return -1;
  const at = k - Math.sqrt(R * R - h2);
  return at <= d ? Math.max(0, at) : -1;
}

// Голова встаёт, хвост догоняет её за fade с.
function finish(p) {
  p.end = true;
  p.endLen = p.len;
  p.life = B.fade;
}

// Удар головы по врагу e (или объекту, e — null) и отскок: поворот на 90° (RNG сима), урон × bounceDamageMul,
// длина вдвое. Отскоков нет — луч гаснет.
function strike(p, w, sim, e) {
  if (e) {
    sim.damageEnemy(e, p.dmg0, w.id, 0, p.x, p.y, w.owner, `beam:${w.slot}`, w.params.status);
  } else {
    sim.hitPropsOnSegment(p.x, p.y, p.x, p.y, p.radius + 0.5, p.pierce);
  }
  if (p.bl <= 0) { finish(p); return; }
  p.bl--;
  const turn = sim.rng.next() < 0.5 ? -1 : 1;
  const vx = p.vx;
  p.vx = -turn * p.vy;
  p.vy = turn * vx;
  p.angle += (turn * Math.PI) / 2;
  p.dmg0 *= B.bounceDamageMul;
  p.c *= 0.5;
  p.pts.push(p.x, p.y); // угол: прежняя голова остаётся точкой ломаной, новая голова — копия
  p.hitN = 0;
  if (e) remember(p, e.uid);
}

// Первая цель на шаге головы: { at, e } (e — враг или null у объекта) в out; false — никого.
function firstHit(p, sim, x0, y0, d, out) {
  let best = -1;
  let be = null;
  const ux = p.vx;
  const uy = p.vy;
  const en = sim.enemies;
  const h = d * 0.5;
  const cnt = sim.grid.query(x0 + ux * h, y0 + uy * h, h + p.radius + sim.maxSize, buf);
  for (let c = 0; c < cnt; c++) {
    const e = en[buf[c]];
    if (e.dead || seen(p, e.uid)) continue;
    const at = contact(x0, y0, ux, uy, d, e.x, e.y, e.size + p.radius);
    if (at >= 0 && (best < 0 || at < best)) { best = at; be = e; }
  }
  const props = sim.props;
  for (let i = 0; i < props.length; i++) {
    const o = props[i];
    if (o.dead || o.mark === p.pierce) continue;
    const at = contact(x0, y0, ux, uy, d, o.x, o.y, o.radius + p.radius);
    if (at >= 0 && (best < 0 || at < best)) { best = at; be = null; }
  }
  if (best < 0) return false;
  out.at = best;
  out.e = be;
  return true;
}

const hit = { at: 0, e: null };

function moveProjectile(p, w, sim, dt) {
  if (w.removed) { p.life = 0; return; }
  if (p.end) {
    const k = Math.max(0, (p.life - dt) / B.fade);
    p.len = p.endLen * k;
    p.alpha = k;
    trim(p);
    return;
  }
  let d = p.spd * dt;
  if (p.dist + d > B.maxTravel) d = Math.max(0, B.maxTravel - p.dist);
  const x0 = p.x;
  const y0 = p.y;
  const struck = !w.owner.dead && d > 0 && firstHit(p, sim, x0, y0, d, hit);
  const move = struck ? hit.at : d;
  p.x = x0 + p.vx * move;
  p.y = y0 + p.vy * move;
  p.dist += move;
  const pts = p.pts;
  pts[pts.length - 2] = p.x;
  pts[pts.length - 1] = p.y;
  // тело растёт, пока короче длины; длиннее (после отскока) — хвост догоняет быстрее головы на shrink
  p.len += move;
  if (p.len > p.c) p.len = Math.max(p.c, p.len - move - B.shrink * dt);
  if (struck) strike(p, w, sim, hit.e);
  hit.e = null;
  trim(p);
  if (!p.end && p.dist >= B.maxTravel - EPS) finish(p);
}

export const beam = {
  init(w) { w.timer = B.first; },
  update(w, sim, dt) {
    w.timer -= dt;
    if (w.timer <= 0) {
      w.timer = w.params.cooldown;
      cast(w, sim);
    }
  },
  moveProjectile,
};
