// Slash (Blade Arc, Crimson Arc): росчерк клинка через самую плотную группу врагов рядом с героем.
// Раз в cooldown серия из amount слэшей с паузой WEAPON_BEHAVIOR.slash.gap. Перед каждым слэшем: среди врагов в
// радиусе searchRange от героя (не больше candidates кандидатов, равномерно по списку сетки) выбирается центр с
// наибольшим числом врагов в круге clusterR (при равенстве ближе к герою); слэш идёт через центр масс этой группы.
// Ориентация — вдоль главной оси группы (ковариация позиций): вытянутую толпу (поток к герою, дуга вокруг него)
// линия режет вдоль и задевает больше врагов, чем линия от героя. Круглая группа (оси почти равны) режется
// поперёк направления от героя — взмах перед собой. Следующие слэши серии берут группы, центр которых дальше
// apart × clusterR от уже взятых; если таких нет, слэш идёт крест-накрест через ту же группу (поворот на π / amount).
// Врагов нет: слэш через ближайший объект, иначе поперёк движения впереди героя. Слэш никогда не начинается у
// героя и не проходит через него (spawn отодвигает и разворачивает); враги с двух сторон при amount ≥ 2 — два
// росчерка (вторая группа дальше apart × clusterR от первой).
// Слэш — отрезок длиной area и шириной width (полоса, враг задет краем тела), «проявляется» от начала к концу за
// sweep с: враг получает удар, когда голова полосы проходит его проекцию на отрезок, поэтому каждого бьёт один
// раз. Отбрасывание от линии (перпендикулярно), статус оружия (bleeding) как у прочих ударов. Без Math.random:
// выбор группы зависит только от позиций и порядка сетки. Рисует render/zones.js (fx 'slash').
// Поля снаряда: x, y — начало отрезка, angle — направление, radius — длина, c — полуширина, a — sweep,
// b — пройденная головой длина, life0 — полная жизнь (sweep + fade), pierce — штамп для объектов.
import { WEAPON_BEHAVIOR } from '../../data/weapons.js';

const S = WEAPON_BEHAVIOR.slash;
const buf = new Int32Array(4096);
const near = new Int32Array(4096);
const EPS = 1e-9;

// Ширина с учётом стата area: width уровня растёт так же, как длина.
function widthOf(w) {
  const lv = w.def.levels[Math.min(w.level, w.def.levels.length) - 1];
  return (w.params.width || S.width) * (lv.area ? w.params.area / lv.area : 1);
}

// Лучшая группа: { x, y, ang, n } или null. taken — центры уже взятых групп серии (x0, y0, x1, y1, ...).
function bestGroup(w, sim, taken, nTaken) {
  const pl = w.owner;
  const en = sim.enemies;
  const R = S.searchRange;
  const cr = S.clusterR;
  const cr2 = cr * cr;
  const far2 = (S.apart * cr) * (S.apart * cr);
  const cnt = sim.grid.query(pl.x, pl.y, R + sim.maxSize, buf);
  // кандидаты: живые враги в радиусе поиска
  let m = 0;
  for (let i = 0; i < cnt; i++) {
    const e = en[buf[i]];
    if (e.dead) continue;
    const dx = e.x - pl.x;
    const dy = e.y - pl.y;
    if (dx * dx + dy * dy > R * R) continue;
    near[m++] = buf[i];
  }
  if (m === 0) return null;
  const step = m > S.candidates ? m / S.candidates : 1;
  let best = -1;
  let bestN = 0;
  let bestD = 0;
  for (let f = 0; f < m; f += step) {
    const c = en[near[Math.floor(f)]];
    let skip = false;
    for (let k = 0; k < nTaken; k++) {
      const dx = c.x - taken[2 * k];
      const dy = c.y - taken[2 * k + 1];
      if (dx * dx + dy * dy < far2) { skip = true; break; }
    }
    if (skip) continue;
    let n = 0;
    for (let j = 0; j < m; j++) {
      const e = en[near[j]];
      const dx = e.x - c.x;
      const dy = e.y - c.y;
      if (dx * dx + dy * dy <= cr2) n++;
    }
    const d = (c.x - pl.x) * (c.x - pl.x) + (c.y - pl.y) * (c.y - pl.y);
    if (n > bestN || (n === bestN && d < bestD)) { best = Math.floor(f); bestN = n; bestD = d; }
  }
  if (best < 0) return null;
  // центр масс и ковариация группы
  const c = en[near[best]];
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let j = 0; j < m; j++) {
    const e = en[near[j]];
    if ((e.x - c.x) * (e.x - c.x) + (e.y - c.y) * (e.y - c.y) > cr2) continue;
    sx += e.x; sy += e.y; n++;
  }
  const gx = sx / n;
  const gy = sy / n;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (let j = 0; j < m; j++) {
    const e = en[near[j]];
    if ((e.x - c.x) * (e.x - c.x) + (e.y - c.y) * (e.y - c.y) > cr2) continue;
    const dx = e.x - gx;
    const dy = e.y - gy;
    xx += dx * dx; yy += dy * dy; xy += dx * dy;
  }
  // собственные числа ковариации: вытянутость группы
  const tr = xx + yy;
  const diff = Math.sqrt((xx - yy) * (xx - yy) + 4 * xy * xy);
  const l1 = (tr + diff) / 2;
  const l2 = (tr - diff) / 2;
  let ang;
  if (n >= 2 && l1 > EPS && l2 < l1 * S.elongation) ang = 0.5 * Math.atan2(2 * xy, xx - yy);
  else ang = Math.atan2(gy - pl.y, gx - pl.x) + Math.PI / 2; // поперёк направления от героя
  return { x: gx, y: gy, ang, n };
}

// Слэш через (cx, cy) под углом ang; dir — с какого конца он проводится (±1).
// Слэш никогда не выходит из героя (как Victory Sword): если отрезок проходит ближе minD = полуширина + радиус
// героя + S.clear: если хватает сдвига вдоль оси не больше slide × длины — сдвигается от героя, иначе
// разворачивается поперёк направления от героя к центру (ближайшая к герою точка — центр), а центр, если он сам
// ближе minD, отодвигается от героя на minD.
function spawn(w, sim, cx, cy, ang, dir) {
  const P = w.params;
  const len = P.area;
  const pl = w.owner;
  const minD = widthOf(w) / 2 + (pl.radius || 0) + S.clear;
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const k = (pl.x - cx) * ux + (pl.y - cy) * uy;  // проекция героя на ось слэша
  const side = Math.abs((pl.x - cx) * uy - (pl.y - cy) * ux); // расстояние от героя до прямой
  const room = Math.abs(k) - len / 2; // от конца отрезка до проекции героя
  const need = side < minD ? Math.sqrt(minD * minD - side * side) : -Infinity;
  if (room >= need) {
    // отрезок и так не ближе minD к герою
  } else if (need - room <= len * S.slide) {
    // конец отрезка задевает героя чуть-чуть: сдвинуть отрезок вдоль оси от героя
    const s = (k > 0 ? -1 : 1) * (need - room);
    cx += ux * s; cy += uy * s;
  } else {
    // отрезок проходит через героя: поперёк направления от героя к центру
    let rx = cx - pl.x;
    let ry = cy - pl.y;
    let d = Math.sqrt(rx * rx + ry * ry);
    if (d < EPS) {
      rx = pl.dirX || (pl.facing > 0 ? 1 : -1);
      ry = pl.dirY || 0;
      d = Math.sqrt(rx * rx + ry * ry);
    }
    rx /= d; ry /= d;
    if (d < minD) { cx = pl.x + rx * minD; cy = pl.y + ry * minD; }
    ang = Math.atan2(ry, rx) + Math.PI / 2;
  }
  const a = dir > 0 ? ang : ang + Math.PI;
  const p = sim.addProjectile('player', w.def.sprite);
  p.x = cx - Math.cos(a) * len / 2;
  p.y = cy - Math.sin(a) * len / 2;
  p.angle = a;
  p.radius = len;
  p.c = widthOf(w) / 2;
  p.a = P.sweep || S.sweep;
  p.b = 0;
  p.life = p.life0 = p.a + S.fade;
  p.fx = 'slash';
  p.kb = P.knockback || 0;
  p.pierce = sim.nextStamp();
  p.wid = w.id;
  p.slot = w.slot;
  p.ws = w;
  p.bk = slash;
  if (w.def.tint) p.tint = w.def.tint;
}

function strike(w, sim) {
  const pl = w.owner;
  const i = w.n++;
  const dir = (i & 1) ? -1 : 1;
  const g = bestGroup(w, sim, w.taken, w.nTaken);
  if (g) {
    w.taken[2 * w.nTaken] = g.x;
    w.taken[2 * w.nTaken + 1] = g.y;
    w.nTaken++;
    w.last = g;
    spawn(w, sim, g.x, g.y, g.ang, dir);
    return;
  }
  if (w.last) {
    // другой группы нет: крест-накрест через последнюю
    const L = w.last;
    spawn(w, sim, L.x, L.y, L.ang + (i * Math.PI) / Math.max(2, w.params.amount), dir);
    return;
  }
  const len = w.params.area;
  const o = sim.nearestProp(pl.x, pl.y, S.searchRange);
  if (o) {
    spawn(w, sim, o.x, o.y, Math.atan2(o.y - pl.y, o.x - pl.x), 1);
    return;
  }
  // ни врагов, ни объектов: росчерк поперёк движения впереди героя (на idle × длины), следующие — по кругу
  const dx = pl.dirX || (pl.facing > 0 ? 1 : -1);
  const dy = pl.dirY || 0;
  const a = Math.atan2(dy, dx) + (i * 2 * Math.PI) / Math.max(1, w.params.amount);
  const d = len * S.idle;
  spawn(w, sim, pl.x + Math.cos(a) * d, pl.y + Math.sin(a) * d, a + Math.PI / 2, 1);
}

// Голова полосы прошла от b0 до b1: бьём врагов, чья проекция на отрезок попала в (b0, b1].
function cut(p, w, sim, b0, b1) {
  const en = sim.enemies;
  const ca = Math.cos(p.angle);
  const sa = Math.sin(p.angle);
  const mid = (b0 + b1) / 2;
  const reach = (b1 - b0) / 2 + p.c + sim.maxSize;
  const cnt = sim.grid.query(p.x + ca * mid, p.y + sa * mid, reach, buf);
  // концы отрезка: враг задет краем тела и за началом (первый шаг), и за концом (последний)
  const first = b0 <= 0;
  const last = b1 >= p.radius;
  const P = w.params;
  for (let c = 0; c < cnt; c++) {
    const e = en[buf[c]];
    if (e.dead) continue;
    const rx = e.x - p.x;
    const ry = e.y - p.y;
    const k = rx * ca + ry * sa;
    if (k > (last ? p.radius + e.size : b1) || (first ? k < -e.size : k <= b0)) continue;
    const kk = k < 0 ? 0 : k > p.radius ? p.radius : k;
    const ex = rx - ca * kk;
    const ey = ry - sa * kk;
    const r = p.c + e.size;
    if (ex * ex + ey * ey > r * r) continue;
    // источник отбрасывания — точка на линии под врагом (толчок перпендикулярно); на самой линии — нормаль.
    // Враг между линией и героем летит не на героя, а от него (sim.damageEnemy)
    let fx = p.x + ca * kk;
    let fy = p.y + sa * kk;
    if (ex * ex + ey * ey < 0.25) { fx += sa; fy -= ca; }
    sim.damageEnemy(e, P.damage, w.id, p.kb, fx, fy, w.owner, `slash:${w.slot}`, P.status);
  }
  const x0 = p.x + ca * Math.max(0, b0);
  const y0 = p.y + sa * Math.max(0, b0);
  sim.hitPropsOnSegment(x0, y0, p.x + ca * b1, p.y + sa * b1, p.c, p.pierce);
}

export const slash = {
  init(w) {
    w.q = 0; w.n = 0; w.t = 0; w.cooldown = S.first;
    w.taken = new Float64Array(16); w.nTaken = 0; w.last = null;
  },
  update(w, sim, dt) {
    if (w.q > 0) {
      w.t -= dt;
      if (w.t <= 0) { strike(w, sim); w.q--; w.t = S.gap; }
    }
    w.cooldown -= dt;
    if (w.cooldown <= 0 && w.q === 0) {
      w.cooldown = w.params.cooldown;
      w.q = Math.min(8, Math.max(1, w.params.amount || 1));
      w.n = 0;
      w.t = 0;
      w.nTaken = 0;
      w.last = null;
      sim.events.push({ type: 'weaponFire', weapon: w.id });
    }
  },
  // Голова полосы идёт от начала к концу за sweep; по пути бьёт. Потом полоса только гаснет (картинка).
  moveProjectile(p, w, sim, dt) {
    if (w.removed) { p.life = 0; return; }
    const el = p.life0 - p.life + dt; // время с появления после этого шага
    const head = Math.min(p.radius, (p.radius * el) / p.a);
    if (head > p.b) {
      if (!w.owner.dead) cut(p, w, sim, p.b, head);
      p.b = head;
    }
    p.alpha = el <= p.a ? 1 : Math.max(0, 1 - (el - p.a) / S.fade);
  },
};
