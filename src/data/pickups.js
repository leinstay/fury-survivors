// Два вида сундуков: сундук скиллов (с элит, лежит на земле, спрайт chest как есть) и сундук шмоток (лут
// босса, лежит на земле, подбор открывает экран лута, тот же спрайт в своём цвете; один вид на все тиры).
// tint — 0xRRGGBB или null (без перекраски).
export const CHEST_LOOK = {
  skill: { tint: null },
  loot: { tint: 0xb48cff },
};

// Подбираемые предметы.
// Формат записи:
// id: {
//   sprite: 'xp_small',
//   kind: 'xp' | 'heal' | 'magnet' | 'coin' | 'chest' | 'loot',
//   value,                       // опыт, HP, монеты; у loot — номер сундука босса (BOSS_DROPS); magnet/chest без
//   tint,                        // перекраска спрайта (0xRRGGBB), необязательно
// }
// Кристаллы опыта (kind xp) определяют внешний вид по значению: берётся самый крупный с value <= опыта.
export const PICKUPS = {
  xp_small:  { sprite: 'xp_small',  kind: 'xp', value: 1 },
  xp_medium: { sprite: 'xp_medium', kind: 'xp', value: 5 },
  xp_large:  { sprite: 'xp_large',  kind: 'xp', value: 25 },
  food:      { sprite: 'food',      kind: 'heal', value: 20 },
  magnet:    { sprite: 'magnet',    kind: 'magnet' },
  coin:      { sprite: 'coin',      kind: 'coin', value: 1 },
  chest:     { sprite: 'chest',     kind: 'chest' },
  // сундук лута с босса: лежит, где босс пал; подбор открывает экран лута у всех (src/core/sim.js)
  loot_chest: { sprite: 'chest',    kind: 'loot', tint: CHEST_LOOK.loot.tint },
};

