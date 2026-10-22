// Сложность забега, выбирается при нажатии Play. Строки интерфейса: difficulty.<id>.name / .desc.
// Формат записи:
// id: {
//   spawnMul,   // множитель частоты спавна, минимумов и размеров колец, стен, пролётов и орд (как Curse в VS)
//   xpMul,      // множитель опыта с врагов
// }
// Очки не умножаются: больше врагов — больше килов, а значит и очков. Таблица рекордов хранит id в поле difficulty
// (старые записи без поля считаются normal).
export const DIFFICULTIES = {
  normal: { spawnMul: 1, xpMul: 1 },
  cursed: { spawnMul: 1.5, xpMul: 1 },   // только больше врагов, опыт с врага как на normal
};
export const DEFAULT_DIFFICULTY = 'normal';
