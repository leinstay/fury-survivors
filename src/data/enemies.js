// Враги. Строки интерфейса: enemy.<id>.name.
// Формат записи:
// id: {
//   sprite: 'bat',               // ключ из manifest.js
//   behavior: 'swarm',           // файл src/behaviors/enemies/<behavior>.js
//   hp, speed, damage, xp,       // speed в px/с, damage за касание
//   size,                        // радиус хитбокса, px
//   knockbackResist: 0..1,
//   params: {},                  // параметры behavior'а (дистанция рывка, скорость снаряда...)
//   elite: { hpMul, damageMul, sizeMul, xpMul, tint, drop: 'chest' },  // tint — для рендера
// }
const elite = (tint) => ({ hpMul: 8, damageMul: 1.5, sizeMul: 1.25, xpMul: 6, tint, drop: 'chest' });

export const ENEMIES = {
  bat: {
    sprite: 'bat', behavior: 'swarm', hp: 5, speed: 100, damage: 3, xp: 1, size: 6, knockbackResist: 0,
    params: { wobble: 40, wobbleFreq: 5 },
    elite: elite(0xff6060),
  },
  slime: {
    sprite: 'slime', behavior: 'chase', hp: 30, speed: 30, damage: 6, xp: 3, size: 11, knockbackResist: 0.3,
    params: {},
    elite: elite(0x60ff90),
  },
  catgirl: {
    sprite: 'catgirl', behavior: 'chase', hp: 16, speed: 80, damage: 5, xp: 2, size: 9, knockbackResist: 0,
    params: {},
    elite: elite(0xffc060),
  },
  ghost: {
    sprite: 'ghost', behavior: 'phase', hp: 11, speed: 58, damage: 5, xp: 2, size: 9, knockbackResist: 0.5,
    params: { aimEvery: 1.5 },
    elite: elite(0x80c0ff),
  },
  foxgirl: {
    sprite: 'foxgirl', behavior: 'dash', hp: 26, speed: 50, damage: 9, xp: 4, size: 9, knockbackResist: 0,
    params: { range: 140, windup: 0.45, dashSpeed: 240, dashTime: 0.35, cooldown: 2.2 },
    elite: elite(0xff8040),
  },
  succubus: {
    sprite: 'succubus', behavior: 'ranged', hp: 40, speed: 42, damage: 5, xp: 6, size: 9, knockbackResist: 0.2,
    params: { keep: 150, range: 260, cooldown: 2.2, projSpeed: 110, projDamage: 8, projLife: 4 },
    elite: elite(0xff60c0),
  },
};
