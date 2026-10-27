// Эффекты на врагах от оружия: замедление и ДоТы (poison, burning, bleeding, chill — замедление без урона;
// src/data/status.js).
// Детерминировано: только время сима, его RNG и поля врага. Объекты врагов переиспользуются из пула, поэтому
// эффект привязан к uid: у нового врага в том же объекте uid другой, и эффектов на нём нет.
import { STATUS, STATUS_ORDER, DOT } from '../data/status.js';

const EPS = 1e-9;

// Замедлить врага: скорость × mul на time секунд. Сильнее и дольше из действующего и нового.
// Боссы иммунны ко всем эффектам (замедление, корень, ДоТы, отталкивание): решение владельца.
export function applySlow(e, sim, mul, time) {
  if (e.dead || e.boss || !(mul < 1) || !(time > 0)) return;
  const m = mul;
  const end = sim.time + time;
  if (e.slowUid === e.uid && e.slowEnd > sim.time) {
    if (m < e.slowMul) e.slowMul = m;
    if (end > e.slowEnd) e.slowEnd = end;
    return;
  }
  e.slowUid = e.uid;
  e.slowMul = m;
  e.slowEnd = end;
}

// Пригвоздить врага (копьё, impale): стоит на месте time секунд, свой таймер, отдельно от замедления (не
// склеивается с ним: после корня враг снова под своим замедлением, если оно ещё идёт). Продлевается, если дольше.
// Босс не пригвождается и не замедляется.
export function applyRoot(e, sim, time) {
  if (e.dead || !(time > 0)) return;
  if (e.boss) return;
  const end = sim.time + time;
  if (e.rootUid === e.uid && e.rootEnd > end) return;
  e.rootUid = e.uid;
  e.rootEnd = end;
}

// Пригвождён ли враг сейчас.
export function isRooted(e, sim) {
  return e.rootUid === e.uid && e.rootEnd > sim.time;
}

// Множитель скорости ходьбы врага сейчас (1 без замедления, 0 под корнем). Его читают behaviors врагов.
export function moveMul(e, sim) {
  if (e.rootUid === e.uid && e.rootEnd > sim.time) return 0;
  return e.slowUid === e.uid && e.slowEnd > sim.time ? e.slowMul : 1;
}

// Замедлен ли враг сейчас (для рендера и тестов).
export function isSlowed(e, sim) {
  return moveMul(e, sim) < 1;
}

// ---------- ДоТы ----------
// Поля врага: dotUid — uid, для которого они действуют; dotNext — время следующего тика (общие часы);
// pz — стаки яда [{per, left, wid, by}], pzN — сколько из них живых; burn, bleed — {per, left, wid, by}.
// per — урон за тик, left — сколько тиков осталось, wid — оружие, by — игрок-владелец.

function slot() {
  return { per: 0, left: 0, wid: '', by: null, seen: false };
}

// Состояние ДоТов врага для его текущего uid (сброс, если объект достался новому врагу).
function own(e) {
  if (e.dotUid === e.uid) return;
  e.dotUid = e.uid;
  e.dotNext = 0;
  if (!e.pz) e.pz = [];
  e.pzN = 0;
  if (!e.burn) e.burn = slot();
  if (!e.bleed) e.bleed = slot();
  e.burn.left = 0;
  e.bleed.left = 0;
}

/** Есть ли на враге действующий ДоТ. */
export function hasDots(e) {
  return e.dotUid === e.uid && (e.pzN > 0 || e.burn.left > 0 || e.bleed.left > 0);
}

/**
 * Число тиков и урон за тик ДоТа типа def от удара hit.
 * @return {{n: number, per: number}}
 */
export function dotTicks(def, hit, share) {
  const n = Math.max(1, Math.round(def.duration / DOT.tick));
  return { n, per: (hit * share) / n };
}

/**
 * Наложить статус оружия после удара. status — поле оружия { type, chance, share? }, hit — урон удара до крита.
 * Шанс тянется из RNG сима, только если chance < 1 (ход сима без статусов прежний).
 * @return {boolean} наложен ли
 */
export function applyStatus(e, sim, status, hit, wid, by) {
  if (!status || e.dead || e.boss) return false;
  const def = STATUS[status.type];
  if (!def) return false;
  const slow = def.stacking === 'slow';
  if (!slow && !(hit > 0)) return false;
  const chance = status.chance ?? 1;
  if (!(chance > 0)) return false;
  if (chance < 1 && sim.rng.next() >= chance) return false;
  // холод: урона нет, только замедление (applySlow)
  if (slow) {
    applySlow(e, sim, status.slow ?? def.slow, status.duration ?? def.duration);
    return true;
  }
  const { n, per } = dotTicks(status.duration ? { duration: status.duration } : def, hit,
      status.share ?? def.share);
  const was = hasDots(e);
  own(e);
  if (!was) e.dotNext = sim.time + DOT.tick;
  if (def.stacking === 'stack') {
    let s;
    if (e.pzN < def.maxStacks) {
      s = e.pz[e.pzN];
      if (!s) { s = slot(); e.pz.push(s); }
      e.pzN++;
    } else {
      // полный набор: новый стак вместо того, которому осталось меньше всего
      s = e.pz[0];
      for (let i = 1; i < e.pzN; i++) if (e.pz[i].left < s.left) s = e.pz[i];
    }
    s.per = per; s.left = n; s.wid = wid; s.by = by;
    return true;
  }
  const s = status.type === 'burning' ? e.burn : e.bleed;
  // не стакается: остаётся сильнейший, таймер обновляется
  if (s.left <= 0 || per >= s.per) { s.per = per; s.wid = wid; s.by = by; }
  s.left = n;
  return true;
}

// Тик одного ожога или кровотечения.
function tickSlot(e, sim, s, type) {
  if (s.left <= 0) return;
  s.left--;
  sim.dotDamage(e, s.per, s.wid, s.by, type);
}

// Тик яда: стаки одного оружия и игрока одним ударом (одно число на экране), истёкшие уходят в конец списка.
function tickPoison(e, sim) {
  const pz = e.pz;
  const n = e.pzN;
  for (let i = 0; i < n; i++) pz[i].seen = false;
  for (let i = 0; i < n && !e.dead; i++) {
    const s = pz[i];
    if (s.seen) continue;
    let sum = 0;
    for (let j = i; j < n; j++) {
      const o = pz[j];
      if (o.seen || o.wid !== s.wid || o.by !== s.by) continue;
      o.seen = true;
      sum += o.per;
    }
    sim.dotDamage(e, sum, s.wid, s.by, 'poison');
  }
  let k = 0;
  for (let i = 0; i < n; i++) {
    const s = pz[i];
    s.left--;
    if (s.left > 0) {
      if (k !== i) { pz[i] = pz[k]; pz[k] = s; }
      k++;
    }
  }
  e.pzN = k;
}

/**
 * Тики ДоТов всех врагов до текущего времени сима. Зовётся раз за шаг (sim.step).
 * @param {!Object} sim
 */
export function updateDots(sim) {
  const en = sim.enemies;
  for (let i = 0; i < en.length; i++) {
    const e = en[i];
    if (e.dead || !hasDots(e)) continue;
    while (sim.time + EPS >= e.dotNext && !e.dead && hasDots(e)) {
      e.dotNext += DOT.tick;
      if (e.pzN > 0) tickPoison(e, sim);
      if (!e.dead) tickSlot(e, sim, e.burn, 'burning');
      if (!e.dead) tickSlot(e, sim, e.bleed, 'bleeding');
    }
  }
}

/**
 * Статус, под которым враг подкрашен (первый из STATUS_ORDER), или ''.
 * @return {string}
 */
export function shownStatus(e) {
  if (!hasDots(e)) return '';
  for (const type of STATUS_ORDER) {
    if (type === 'poison' ? e.pzN > 0 : (type === 'burning' ? e.burn : e.bleed).left > 0) return type;
  }
  return '';
}

/**
 * Состояние ДоТов врага строкой для хеша lockstep ('' без ДоТов).
 * @return {string}
 */
export function dotKey(e) {
  if (!hasDots(e)) return '';
  const r = (v) => Math.round(v * 1000);
  let s = `${e.uid}@${r(e.dotNext)}:`;
  for (let i = 0; i < e.pzN; i++) s += `${r(e.pz[i].per)}/${e.pz[i].left}.`;
  return s + `|${r(e.burn.per)}/${e.burn.left}|${r(e.bleed.per)}/${e.bleed.left}`;
}
