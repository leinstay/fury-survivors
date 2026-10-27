// Эффекты на врагах от оружия. Пока только замедление (frost_orb): множитель скорости ходьбы до момента
// sim.time. Детерминировано: только время сима и поля врага. Объекты врагов переиспользуются из пула,
// поэтому эффект привязан к uid: у нового врага в том же объекте uid другой и замедления нет.
import { WEAPON_BEHAVIOR } from '../data/weapons.js';

const SLOW = WEAPON_BEHAVIOR.slow;

// Замедлить врага: скорость × mul на time секунд. Сильнее и дольше из действующего и нового.
// Босс поддаётся слабее: доля замедления × (1 - SLOW.bossResist).
export function applySlow(e, sim, mul, time) {
  if (e.dead || !(mul < 1) || !(time > 0)) return;
  const m = e.boss ? 1 - (1 - mul) * (1 - SLOW.bossResist) : mul;
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

// Множитель скорости ходьбы врага сейчас (1 без замедления). Его читают behaviors врагов.
export function moveMul(e, sim) {
  return e.slowUid === e.uid && e.slowEnd > sim.time ? e.slowMul : 1;
}

// Замедлен ли враг сейчас (для рендера и тестов).
export function isSlowed(e, sim) {
  return moveMul(e, sim) < 1;
}
