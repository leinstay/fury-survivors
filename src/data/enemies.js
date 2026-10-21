// Враги.
// Формат записи:
// id: {
//   sprite: 'bat',               // ключ из manifest.js
//   behavior: 'swarm',           // файл src/behaviors/enemies/<behavior>.js
//   hp, speed, damage, xp,       // speed в px/с, damage за касание
//   size,                        // радиус хитбокса, px
//   knockbackResist: 0..1,
//   params: {},                  // параметры behavior'а (дистанция рывка, скорость снаряда...)
//   elite: { hpMul, damageMul, sizeMul: 1.25, tint, drop: 'chest' },
// }
export const ENEMIES = {};
