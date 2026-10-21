// Враги. Строки интерфейса: enemy.<id>.name.
// Формат записи:
// id: {
//   sprite: 'bat',               // ключ из manifest.js
//   behavior: 'swarm',           // файл src/behaviors/enemies/<behavior>.js
//   hp, speed, damage, xp,       // speed в px/с, damage за касание
//   size,                        // радиус хитбокса, px
//   knockbackResist: 0..1,
//   params: {},                  // параметры behavior'а (дистанция рывка, скорость снаряда...)
//   elite: { hpMul, damageMul, sizeMul, xpMul, outline, drop: 'chest' },  // outline — цвет контура в рендере
// }
// Элита: тот же спрайт в 1.5 раза крупнее, с белым контуром, без перекраски.
const elite = () => ({ hpMul: 8, damageMul: 1.5, sizeMul: 1.5, xpMul: 6, outline: 0xffffff, drop: 'chest' });

export const ENEMIES = {
  bat: {
    sprite: 'bat', behavior: 'swarm', hp: 5, speed: 100, damage: 6, xp: 1, size: 6, knockbackResist: 0,
    params: { wobble: 40, wobbleFreq: 5 },
    elite: elite(),
  },
  slime: {
    sprite: 'slime', behavior: 'chase', hp: 30, speed: 30, damage: 12, xp: 3, size: 11, knockbackResist: 0.3,
    params: {},
    elite: elite(),
  },
  catgirl: {
    sprite: 'catgirl', behavior: 'chase', hp: 16, speed: 80, damage: 10, xp: 2, size: 9, knockbackResist: 0,
    params: {},
    elite: elite(),
  },
  ghost: {
    sprite: 'ghost', behavior: 'phase', hp: 11, speed: 58, damage: 10, xp: 2, size: 9, knockbackResist: 0.5,
    params: { aimEvery: 1.5 },
    elite: elite(),
  },
  foxgirl: {
    sprite: 'foxgirl', behavior: 'dash', hp: 26, speed: 50, damage: 18, xp: 4, size: 9, knockbackResist: 0,
    params: { range: 140, windup: 0.45, dashSpeed: 240, dashTime: 0.35, cooldown: 2.2 },
    elite: elite(),
  },
  succubus: {
    sprite: 'succubus', behavior: 'ranged', hp: 40, speed: 42, damage: 10, xp: 6, size: 9, knockbackResist: 0.2,
    params: { keep: 150, range: 260, cooldown: 2.2, projSpeed: 110, projDamage: 16, projLife: 4 },
    elite: elite(),
  },
};
