// Враги. Строки интерфейса: enemy.<id>.name.
// Формат записи:
// id: {
//   sprite: 'harpy',             // ключ из manifest.js
//   behavior: 'swarm',           // файл src/behaviors/enemies/<behavior>.js
//   hp, speed, damage, xp,       // speed в px/с, damage за касание
//   size,                        // радиус хитбокса, px
//   knockbackResist: 0..1,
//   params: {},                  // параметры behavior'а (дистанция рывка, скорость снаряда...)
//   elite: { hpMul, damageMul, sizeMul, xpMul, glow, drop: 'chest' },  // glow — цвет свечения вокруг силуэта
// }
// Элита: тот же спрайт в 1.5 раза крупнее, с цветным свечением вокруг силуэта, без перекраски.
// Скорость не растёт ни у элиты, ни со временем (stage.scaling меняет только HP и урон).
//
// Ориентир Vampire Survivors (HP / урон касания / скорость, VS-скорость 100 ≈ базовый шаг игрока):
//   bat 1-5/5/140, zombie 10/10/100, skeleton 15/10/100, ghost 10/5/200, mudman 70-150/10/100,
//   werewolf 180/14/130, giant bat 270/10/140, mantichana / big mummy 500/20/80.
//   Обычные враги VS со временем не крепнут, вместо этого приходят типы ~10× крепче (5 -> 15 -> 150 -> 270 -> 500).
//   У нас 8 типов и ранние повторяются поздно, поэтому HP растёт со временем (forest.scaling.hpPerMinute).
// Наши враги по первому появлению в лесу: harpy (0:00) ≈ bat, slime (1:00) ≈ zombie, catgirl (2:00) ≈ skeleton,
//   кольца ghost ≈ ghost, succubus (4:10) / bunnygirl (4:30) ≈ skeleton..mudman, foxgirl (5:00) ≈ mudman,
//   lamia (7:00) ≈ werewolf / giant bat.
// Скорость (герой 90 px/с): от толпы можно убежать и согнать её в кучу, как в VS.
//   Быстрее всех хрупкие: harpy 78 (87%), кольца ghost 75 (83%, урон 5); героиню не догоняет никто.
//   Основная толпа 45-70%: bunnygirl 63 (70%), catgirl 60 (67%), foxgirl 50 (56%, рывок с замахом 0.55 с на ~84 px),
//   lamia 48 (53%), succubus 45 (50%), slime 40 (44%).
const elite = () => ({ hpMul: 8, damageMul: 1.5, sizeMul: 1.5, xpMul: 6, glow: 0xff3d6e, drop: 'chest' });

export const ENEMIES = {
  harpy: {
    sprite: 'harpy', behavior: 'swarm', hp: 5, speed: 78, damage: 5, xp: 2, size: 7, knockbackResist: 0,
    params: { wobble: 40, wobbleFreq: 5 },
    elite: elite(),
  },
  slime: {
    sprite: 'slime', behavior: 'chase', hp: 12, speed: 40, damage: 10, xp: 2, size: 11, knockbackResist: 0.3,
    params: {},
    elite: elite(),
  },
  catgirl: {
    sprite: 'catgirl', behavior: 'chase', hp: 16, speed: 60, damage: 10, xp: 3, size: 9, knockbackResist: 0,
    params: {},
    elite: elite(),
  },
  ghost: {
    sprite: 'ghost', behavior: 'phase', hp: 10, speed: 75, damage: 5, xp: 2, size: 9, knockbackResist: 0.5,
    params: { aimEvery: 1.5 },
    elite: elite(),
  },
  foxgirl: {
    sprite: 'foxgirl', behavior: 'dash', hp: 80, speed: 50, damage: 12, xp: 6, size: 9, knockbackResist: 0.2,
    params: { range: 140, windup: 0.55, dashSpeed: 240, dashTime: 0.35, cooldown: 2.4 },
    elite: elite(),
  },
  succubus: {
    sprite: 'succubus', behavior: 'ranged', hp: 50, speed: 45, damage: 10, xp: 5, size: 9, knockbackResist: 0.2,
    params: { keep: 150, range: 260, cooldown: 2.4, projSpeed: 110, projDamage: 12, projLife: 4 },
    elite: elite(),
  },
  bunnygirl: {
    sprite: 'bunnygirl', behavior: 'chase', hp: 30, speed: 63, damage: 10, xp: 4, size: 8, knockbackResist: 0,
    params: {},
    elite: elite(),
  },
  lamia: {
    sprite: 'lamia', behavior: 'chase', hp: 200, speed: 48, damage: 14, xp: 12, size: 11, knockbackResist: 0.6,
    params: {},
    elite: elite(),
  },
};
