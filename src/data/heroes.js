// Герои: единственное место, где они перечислены. Меню, выбор героя (соло и лобби коопа), сим и тесты
// читают этот список, новый герой — новая запись здесь + спрайты в manifest + строка hero.<id>.name в i18n
// (по шагам: docs/CONTENT.md, «Герой»). Порядок записей = порядок карточек выбора.
// Формат записи:
// id: {
//   sprite: 'heroine',           // ключ из assets/sprites/manifest.js: лента ходьбы (кадр 0 — стойка)
//   portrait: 'heroine_portrait',
//   menu: { art: 'heroine_menu', side: 'right' },  // необязательно: картинка у кнопок главного меню
//                                // side 'right' | 'left' (слева рисуется отражённой); несколько на одной
//                                // стороне встают дальше от кнопок по порядку записей
//   startWeapon: 'blade_arc',    // id из weapons.js
//   stats: { maxHp, atk, speed, crit, pickup, haste, luck, armor, regen },
//     maxHp — единицы HP; atk/haste/luck/pickup — множители (1 = 100%); crit — доля (0.05 = 5%);
//     speed — px/с; pickup — множитель к PLAYER.pickupRadius; armor — плоское снижение урона; regen — HP/с
// }
export const HEROES = {
  heroine: {
    sprite: 'heroine',
    portrait: 'heroine_portrait',
    menu: { art: 'heroine_menu', side: 'right' },
    startWeapon: 'blade_arc',
    stats: {
      maxHp: 100, atk: 1, speed: 90, crit: 0.05, pickup: 1,
      haste: 1, luck: 1, armor: 0, regen: 0,
    },
  },
  // Магесса: стартует с молнией (Storm Chain). Хрупче, зато быстрее, сильнее бьёт и чаще критует.
  mage: {
    sprite: 'mage',
    portrait: 'mage_portrait',
    menu: { art: 'mage_menu', side: 'left' },
    startWeapon: 'storm_chain',
    stats: {
      maxHp: 80, atk: 1.25, speed: 95, crit: 0.15, pickup: 1,
      haste: 1, luck: 1, armor: 0, regen: 0,
    },
  },
};

// Средний герой: черты на экране выбора («+ATK», «-HP») — разница статов героя с этими числами
// (core/heroes.js heroTraits). Сами статы игроку не показываются.
export const HERO_BASE = {
  maxHp: 90, atk: 1, speed: 92, crit: 0.05, pickup: 1, haste: 1, luck: 1, armor: 0, regen: 0,
};

// Герой по умолчанию: первый запуск, неизвестный id (старые сохранения, сообщение из сети).
export const DEFAULT_HERO = 'heroine';
