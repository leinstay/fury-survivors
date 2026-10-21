// Боссы. Строки интерфейса: boss.<id>.name. Формат как у врагов + атаки.
// id: {
//   sprite, behavior: 'boss', hp, speed, damage, xp, size, knockbackResist,
//   attacks: [{ type: 'dash' | 'summon', cooldown, ...params }],
//     dash:   { windup, speed, time }              — рывок в сторону игрока после замаха
//     summon: { enemy, count, radius }             — призыв врагов вокруг босса
//   rage: { hpFraction, cooldownMul },   // ниже этой доли HP кулдауны атак умножаются на cooldownMul
//   drop: 'chest',
// }
export const BOSSES = {
  dryad_queen: {
    sprite: 'dryad_queen', behavior: 'boss', hp: 8000, speed: 34, damage: 44, xp: 0, size: 68, knockbackResist: 1,
    attacks: [
      { type: 'dash', cooldown: 5, windup: 0.8, speed: 260, time: 0.6 },
      { type: 'summon', cooldown: 8, enemy: 'catgirl', count: 6, radius: 90 },
    ],
    rage: { hpFraction: 0.5, cooldownMul: 0.7 },
    drop: 'chest',
  },
};
