// Боссы. Строки интерфейса: boss.<id>.name. Формат как у врагов + атаки.
// id: {
//   sprite, behavior: 'boss', hp, speed, damage, xp, size, knockbackResist,
//   attacks: [{ type, cooldown, ...params }],
//     dash:   { windup, speed, time }                — рывок в сторону игрока после замаха
//     summon: { enemy, count, radius }               — призыв врагов вокруг босса
//     fan:    { count, spread, speed, damage, life, volleys?, interval? }
//             — веер из count снарядов на игрока, spread — полный угол веера в градусах;
//               volleys залпов (по умолчанию 1) через interval секунд (по умолчанию 0.4)
//     ring:   { count, volleys, interval, spin, speed, damage, life }
//             — кольцо из count снарядов во все стороны; volleys залпов, каждый следующий повёрнут
//               на spin радиан (спираль). damage масштабируется со временем так же, как урон босса
//     slam:   { count, radius, delay, damage, interval? }
//             — count ударов по земле с паузой interval (по умолчанию 0.4). Каждый удар целится в место,
//               где игрок стоит в момент предупреждения; через delay секунд круг radius бьёт на damage,
//               если игрок внутри. Предупреждение рисует рендер из sim.telegraphs
//     blink:  { delay, distance, fadeIn? }
//             — босс растворяется за delay секунд, появляется на расстоянии distance от игрока
//               и проявляется за fadeIn секунд (по умолчанию 0.3)
//     любая атака может иметь rageOnly: true — работает только в фазе ярости
//   rage: { hpFraction, cooldownMul, speedMul? },  // ниже этой доли HP кулдауны атак умножаются на cooldownMul
//   final: true,         // убийство этого босса завершает забег победой; у остальных падает только дроп
//   drop: 'chest',
// }
// Здоровье и урон босса растут с этапом так же, как у врагов (stage.scaling), поэтому числа здесь
// заданы для минуты появления босса, делённые на этот множитель.
// Общие числа поведения боссов (src/behaviors/enemies/boss.js).
export const BOSS = {
  castTime: 0.6,           // с, поза 'cast' после призыва или залпа
  volleyInterval: 0.4,     // с между залпами серии, если у атаки нет interval
};

export const BOSSES = {
  kitsune_empress: {
    sprite: 'kitsune_empress', behavior: 'boss', hp: 1600, speed: 38, damage: 14, xp: 0, size: 36, knockbackResist: 1,
    attacks: [
      { type: 'fan', cooldown: 3.6, count: 3, spread: 36, speed: 110, damage: 8, life: 4, volleys: 2, interval: 0.5 },
      { type: 'blink', cooldown: 8, delay: 0.7, distance: 80, fadeIn: 0.35 },
      { type: 'summon', cooldown: 12, enemy: 'foxgirl', count: 3, radius: 80 },
    ],
    rage: { hpFraction: 0.4, cooldownMul: 0.75 },
    drop: 'chest',
  },
  harpy_queen: {
    sprite: 'harpy_queen', behavior: 'boss', hp: 11000, speed: 62, damage: 36, xp: 0, size: 36, knockbackResist: 1,
    attacks: [
      { type: 'dash', cooldown: 4.5, windup: 0.55, speed: 340, time: 0.55 },
      { type: 'ring', cooldown: 7, count: 14, volleys: 5, interval: 0.28, spin: 0.22, speed: 100, damage: 15, life: 4.5 },
      { type: 'summon', cooldown: 11, enemy: 'harpy', count: 12, radius: 110 },
    ],
    rage: { hpFraction: 0.5, cooldownMul: 0.7, speedMul: 1.2 },
    drop: 'chest',
  },
  dryad_queen: {
    sprite: 'dryad_queen', behavior: 'boss', hp: 30000, speed: 34, damage: 44, xp: 0, size: 38, knockbackResist: 1,
    attacks: [
      { type: 'dash', cooldown: 5, windup: 0.8, speed: 260, time: 0.6 },
      { type: 'summon', cooldown: 8, enemy: 'catgirl', count: 6, radius: 90 },
      { type: 'slam', cooldown: 6.5, count: 4, radius: 36, delay: 0.9, interval: 0.55, damage: 34 },
      { type: 'ring', cooldown: 7, count: 12, volleys: 3, interval: 0.6, spin: 0.26, speed: 90, damage: 18, life: 4.5, rageOnly: true },
    ],
    rage: { hpFraction: 0.5, cooldownMul: 0.7, speedMul: 1.25 },
    final: true,
    drop: 'chest',
  },
};
