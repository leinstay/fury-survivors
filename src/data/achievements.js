// Ачивки (docs/META.md, раздел 5). Логика в src/core/achievements.js, итог забега для них —
// src/core/run-summary.js, хранение — src/services/achievements.js, строки — src/i18n/en-achievements.js
// (ach.<id>.name, ach.<id>.desc с подстановкой чисел отсюда).
//
// Формат записи:
// id: {
//   category: 'progress' | 'challenge' | 'collection' | 'coop' | 'craft' | 'fun',
//   reward: { crystals: n } | { scrolls: n } | { hearts: n } | { bag: 'col' | 'row' },
//     bag — открытие столбца или ряда сумки (сами размеры в BAG.unlocks, src/data/items.js)
//   target: n,        // необязательно: порог счётчика или количества (показывается как прогресс)
//   hidden: true,     // необязательно: описание скрыто до получения
//   ...параметры условия (boss, seconds, enemies, hpBelow)
// }
// Порядок записей = порядок в списке ачивок.

export const ACHIEVEMENT_CATEGORIES = ['progress', 'challenge', 'collection', 'coop', 'craft', 'fun'];

export const ACHIEVEMENTS = {
  // ---------- прогресс ----------
  first_trophy: { category: 'progress', reward: { crystals: 10 }, target: 1 },   // убить босса
  three_crowns: { category: 'progress', reward: { bag: 'col' }, target: 3 },     // боссов за забег
  reaper_slayer: { category: 'progress', reward: { hearts: 2 }, boss: 'reaper' },
  both_heroines: { category: 'progress', reward: { crystals: 20 } },             // победа каждым героем

  // ---------- испытания ----------
  hunger: { category: 'challenge', reward: { scrolls: 1 } },                     // победа без еды
  monogamy: { category: 'challenge', reward: { scrolls: 1 }, boss: 'dryad_queen' }, // 1 оружие, 0 пассивок
  untouchable: { category: 'challenge', reward: { crystals: 20 }, seconds: 180, enemies: 300 },
  ascetic: { category: 'challenge', reward: { crystals: 10 }, seconds: 120 },     // без опыта первые N с
  last_breath: { category: 'challenge', reward: { crystals: 10 }, hpBelow: 0.05 }, // босс при HP < доли
  no_safety: { category: 'challenge', reward: { hearts: 1 } },                   // победа без reroll/skip/banish

  // ---------- коллекция ----------
  evolutionist: { category: 'collection', reward: { hearts: 2 } },  // все эволюции (evolved в weapons.js)
  naturalist: { category: 'collection', reward: { crystals: 20 } },  // все враги бестиария увидены
  hoarder: { category: 'collection', reward: { bag: 'col' } },       // стеш полон (STASH.size)
  tetris: { category: 'collection', reward: { bag: 'row' } },        // открытая сумка без пустых клеток
  collector: { category: 'collection', reward: { scrolls: 1 }, target: 5 },  // разных уникалок
  diversity: { category: 'collection', reward: { crystals: 10 }, target: 8 },  // разных типов в сумке

  // ---------- крафт ----------
  recycler: { category: 'craft', reward: { crystals: 30 }, target: 100 },       // разобрано предметов
  smith: { category: 'craft', reward: { scrolls: 1 }, target: 7 },              // заточка до +N
  broke_it: { category: 'craft', reward: { crystals: 10 }, target: 1 },         // сломано заточкой
  chaos_alchemist: { category: 'craft', reward: { hearts: 1 }, target: 100 },   // перекатов (крафт)

  // ---------- кооп ----------
  side_by_side: { category: 'coop', reward: { hearts: 1 }, target: 3 },         // боссов за кооп-забег
  medic: { category: 'coop', reward: { crystals: 10 }, target: 10 },            // поднять напарника
  no_one_left: { category: 'coop', reward: { hearts: 1 } },                     // кооп-победа, никто не пал

  // ---------- забавные ----------
  vacuum: { category: 'fun', reward: { crystals: 10 }, target: 500, hidden: true },     // кристаллов магнитом
  meat_grinder: { category: 'fun', reward: { crystals: 20 }, target: 1000, seconds: 60, hidden: true },
};

// Версия сохранения ачивок (поле v); новее нашей не читаем.
export const ACHIEVEMENTS_VERSION = 1;

// Хранение ачивок: localStorage и копия в Firestore (документ на игрока, id = id кодекса).
export const ACHIEVEMENT_STORE = {
  storageKey: 'fury_achievements',
  collection: 'fury_achievements',
  maxBytes: 100000,      // предел JSON в поле data
  timeoutMs: 8000,
};

// Хранение инвентаря (стеш, сумка, кошелёк): localStorage и копия в Firestore.
// Инвентарь меняется часто (перетаскивание в меню), поэтому копия в Firestore не чаще backupEveryMs
// (Spark: 20 000 записей в сутки на всех, docs/FIRESTORE.md).
export const INVENTORY_STORE = {
  storageKey: 'fury_inventory',
  collection: 'fury_inventory',
  maxBytes: 300000,      // стеш 100 предметов + сумка ≈ 40 КБ, запас
  timeoutMs: 8000,
  backupEveryMs: 60000,
};
