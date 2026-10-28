// Сложность забега, выбирается при нажатии Play. Строки интерфейса: difficulty.<id>.name / .short.
// Порядок записей — порядок кнопок и ступеней: каждая следующая сложнее.
// Формат записи:
// id: {
//   spawnMul,   // множитель частоты спавна, минимумов и размеров колец, стен, пролётов и орд (как Curse в VS)
//   xpMul,      // множитель опыта с врагов
//   hpMul,      // множитель HP обычных врагов и элит (не боссов), в соло и коопе
//   speedMul?,  // множитель скорости врагов, боссов, стен и пролётов (не Жницы и не рывков). Героиня 100, бегуны
//               // 60–63: при ×1.25 они ~79, ещё медленнее героини
//   dmgMul?,    // множитель урона по героине (касание, снаряды, удары боссов) до сопротивления
//   bossHpMul?, // множитель HP боссов (не Жницы)
//   hitSlow?,   // { mul, time }: удар врага замедляет героиню (скорость × mul) на time с, повторный удар
//               // обновляет таймер, увёртка не замедляет
//   healMul?,   // множитель лечения едой и регеном героини (оживление в коопе не меняется)
//   requires?,  // id сложности, которую нужно хоть раз пройти (победа в кодексе), чтобы открыть эту
//   loot?,      // { tier: { common, rare, epic, unique, scroll } }: таблица сундука босса вместо CHEST_TABLES
//               // (items.js) для этих тиров. С каждой ступенью доля обычных уходит в редкие и эпики,
//               // шанс уникалок тот же; T4 (Жница) уже эпический и не меняется
// }
// Очки не умножаются: больше врагов — больше килов, а значит и очков. Таблица рекордов хранит id в поле difficulty
// (старые записи без поля считаются normal).
export const DIFFICULTIES = {
  normal: { spawnMul: 1, xpMul: 1, hpMul: 1 },
  cursed: {   // больше врагов и толще, опыт с врага как на normal
    spawnMul: 1.4, xpMul: 1, hpMul: 1.08,
    loot: {
      1: { common: 60, rare: 30, epic: 10, unique: 0, scroll: 0 },
      2: { common: 40, rare: 40, epic: 18, unique: 2, scroll: 0 },
      3: { common: 20, rare: 42, epic: 32, unique: 4, scroll: 2 },
    },
  },
  hexed: {    // «липкие удары»: удар замедляет, толпа догоняет; лут под редкие и эпики
    spawnMul: 1.6, xpMul: 1, hpMul: 1.25, speedMul: 1.12, dmgMul: 1.3, bossHpMul: 1.2,
    hitSlow: { mul: 0.75, time: 1.5 },
    requires: 'cursed',
    loot: {
      1: { common: 40, rare: 45, epic: 15, unique: 0, scroll: 0 },
      2: { common: 20, rare: 50, epic: 28, unique: 2, scroll: 0 },
      3: { common: 5, rare: 45, epic: 44, unique: 4, scroll: 2 },
    },
  },
  abyss: {    // «глубокие раны»: лечение вдвое слабее, пропущенный удар остаётся; лут под эпики и уникалки
    spawnMul: 1.8, xpMul: 1, hpMul: 1.5, speedMul: 1.25, dmgMul: 1.6, bossHpMul: 1.5,
    healMul: 0.5,
    requires: 'hexed',
    loot: {
      1: { common: 20, rare: 45, epic: 35, unique: 0, scroll: 0 },
      2: { common: 5, rare: 40, epic: 53, unique: 2, scroll: 0 },
      3: { common: 0, rare: 25, epic: 69, unique: 4, scroll: 2 },
    },
  },
};
export const DEFAULT_DIFFICULTY = 'normal';
