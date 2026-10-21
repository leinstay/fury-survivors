// Оружие.
// Формат записи:
// id: {
//   name: 'i18n.key', desc: 'i18n.key',
//   icon: 'icon_blade_arc',      // ключ спрайта иконки
//   sprite: 'proj_blade_arc',    // ключ спрайта снаряда/эффекта
//   behavior: 'melee_arc',       // файл src/behaviors/weapons/<behavior>.js
//   maxLevel: 7,
//   levels: [                    // levels[0] = уровень 1; каждая следующая запись — полный набор чисел
//     { damage, cooldown, amount, area, speed, duration, pierce, knockback, ... },
//   ],
//   // Поля уровней, которые не нужны behavior'у, можно не указывать.
// }
// Супероружие (из combos.js) описывается здесь же с флагом evolved: true.
export const WEAPONS = {};
