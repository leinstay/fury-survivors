// Боссы. Строки интерфейса: boss.<id>.name. Формат как у врагов + атаки.
// id: {
//   sprite, behavior: 'boss', hp, speed, damage, xp, size, knockbackResist,
//   attacks: [{ type: 'dash' | 'summon', cooldown, ...params }],
//     dash:   { windup, speed, time }              — рывок в сторону игрока после замаха
//     summon: { enemy, count, radius }             — призыв врагов вокруг босса
//   drop: 'chest',
// }
export const BOSSES = {
  dryad_queen: {
    sprite: 'dryad_queen', behavior: 'boss', hp: 8000, speed: 34, damage: 22, xp: 0, size: 34, knockbackResist: 1,
    attacks: [
      { type: 'dash', cooldown: 5, windup: 0.8, speed: 260, time: 0.6 },
      { type: 'summon', cooldown: 8, enemy: 'catgirl', count: 6, radius: 90 },
    ],
    drop: 'chest',
  },
};
