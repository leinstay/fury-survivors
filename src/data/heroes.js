// Герои. Строки интерфейса: hero.<id>.name (ключ выводится из id).
// Формат записи:
// id: {
//   sprite: 'heroine',           // ключ из assets/sprites/manifest.js
//   portrait: 'heroine_portrait',
//   startWeapon: 'blade_arc',    // id из weapons.js
//   stats: { maxHp, atk, speed, crit, pickup, haste, luck, armor, regen },
//     maxHp — единицы HP; atk/haste/luck/pickup — множители (1 = 100%); crit — доля (0.05 = 5%);
//     speed — px/с; pickup — множитель к PLAYER.pickupRadius; armor — плоское снижение урона; regen — HP/с
// }
export const HEROES = {
  heroine: {
    sprite: 'heroine',
    portrait: 'heroine_portrait',
    startWeapon: 'blade_arc',
    stats: { maxHp: 100, atk: 1, speed: 90, crit: 0.05, pickup: 1, haste: 1, luck: 1, armor: 0, regen: 0 },
  },
};
