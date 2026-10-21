// Подбираемые предметы.
// Формат записи:
// id: {
//   sprite: 'xp_small',
//   kind: 'xp' | 'heal' | 'magnet' | 'coin' | 'chest',
//   value,                       // опыт, HP, монеты; для magnet/chest не нужен
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
};
