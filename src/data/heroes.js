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
//   stats: { maxHp, attack, magic, speed, crit, critDmg, area, duration, pickup, haste, luck, resistance, regen,
//            xpGain, dodge, thorns },
//     все статы из src/data/stats.js. maxHp — единицы HP; attack/magic — множители урона оружия своего типа;
//     area/duration/haste/luck/pickup/xpGain — множители (1 = 100%); crit, dodge — доли (0.05 = 5%);
//     critDmg — прибавка к COMBAT.critMul; speed — px/с; resistance — доля снижения удара (0.1 = −10%); regen — HP/с;
//     thorns — доля максимума HP врагов, которую снимают шипы
// }
export const HEROES = {
  heroine: {
    sprite: 'heroine',
    portrait: 'heroine_portrait',
    menu: { art: 'heroine_menu', side: 'right' },
    startWeapon: 'blade_arc',
    stats: {
      maxHp: 120, attack: 1, magic: 0.85, speed: 100, crit: 0.05, critDmg: 0, area: 1, duration: 1,
      pickup: 1, haste: 1, luck: 1, resistance: 0.10, regen: 0.25, xpGain: 1, dodge: 0, thorns: 0,
    },
  },
  // Магесса: стартует с молнией (Storm Chain). Хрупче, зато сильнее магия и чаще критует.
  mage: {
    sprite: 'mage',
    portrait: 'mage_portrait',
    menu: { art: 'mage_menu', side: 'left' },
    startWeapon: 'wisp',
    stats: {
      maxHp: 80, attack: 0.85, magic: 1.4, speed: 100, crit: 0.15, critDmg: 0, area: 1, duration: 1,
      pickup: 1, haste: 1, luck: 1, resistance: 0, regen: 0.25, xpGain: 1, dodge: 0, thorns: 0,
    },
  },
};

// Средний герой: черты в кодексе («+MAGIC», «-HP») — разница статов героя с этими числами
// (core/heroes.js heroTraits). Сами статы игроку не показываются.
export const HERO_BASE = {
  maxHp: 90, attack: 1, magic: 1, speed: 100, crit: 0.05, critDmg: 0, area: 1, duration: 1,
  pickup: 1, haste: 1, luck: 1, resistance: 0, regen: 0.25, xpGain: 1, dodge: 0, thorns: 0,
};

// Герой по умолчанию: первый запуск, неизвестный id (старые сохранения, сообщение из сети).
export const DEFAULT_HERO = 'heroine';
