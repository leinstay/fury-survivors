// Супероружие.
// Формат записи: { from: ['weapon_a', 'weapon_b'], result: 'weapon_evolved' }
// Обе части должны быть на maxLevel. Выпадает из сундука элиты или босса.
// Результат описан в weapons.js с флагом evolved: true; он занимает слот первой части, вторая часть убирается.
export const COMBOS = [
  { from: ['blade_arc', 'guardian_shields'], result: 'aegis_storm' },
  { from: ['throwing_daggers', 'storm_chain'], result: 'thunder_knives' },
];
