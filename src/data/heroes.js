// Герои.
// Формат записи:
// id: {
//   name: 'i18n.key',            // ключ строки, не текст
//   sprite: 'heroine',           // ключ из assets/sprites/manifest.js
//   portrait: 'heroine_portrait',
//   startWeapon: 'blade_arc',    // id из weapons.js
//   stats: { maxHp, atk, speed, crit, pickup, haste, luck, armor, regen },
//     maxHp — единицы HP; atk/crit/haste/luck — множители и доли (1 = 100%, 0.05 = 5%);
//     speed — px/с; pickup — множитель к PLAYER.pickupRadius; armor — плоское снижение урона; regen — HP/с
// }
export const HEROES = {};
