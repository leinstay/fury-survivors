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
//   bonus: { stat: v },  // постоянный бонус к статам героя во всех забегах (src/data/stats.js):
//                        //   процентные — increased (0.02 = +2%), плоские — прибавка (crit 0.01 = +1% шанса,
//                        //   armor 0.5, regen 0.05 HP/с). Складывается с пассивками и сумкой, капы общие.
//                        //   amount нельзя (только в уровнях оружия). Сумма всех ≈ 6–7 уровней пассивок.
//   ...параметры условия (boss, seconds, enemies, hpBelow)
// }
// Порядок записей = порядок в списке ачивок.

export const ACHIEVEMENT_CATEGORIES = ['progress', 'challenge', 'collection', 'coop', 'craft', 'fun'];

export const ACHIEVEMENTS = {
  // ---------- прогресс ----------
  first_trophy: { category: 'progress', reward: { crystals: 10 }, target: 1,     // убить босса
    bonus: { attack: 0.02, magic: 0.02 } },
  three_crowns: { category: 'progress', reward: { bag: 'col' }, target: 3,       // боссов за забег
    bonus: { maxHp: 0.03 } },
  reaper_slayer: { category: 'progress', reward: { hearts: 2 }, boss: 'reaper',
    bonus: { critDmg: 0.05 } },
  both_heroines: { category: 'progress', reward: { crystals: 20 },               // победа каждым героем
    bonus: { attack: 0.02, magic: 0.02 } },

  // ---------- испытания ----------
  hunger: { category: 'challenge', reward: { scrolls: 1 },                       // победа без еды
    bonus: { regen: 0.05 } },
  monogamy: { category: 'challenge', reward: { scrolls: 1 }, boss: 'dryad_queen', // 1 оружие, 0 пассивок
    bonus: { haste: 0.02 } },
  untouchable: { category: 'challenge', reward: { crystals: 20 }, seconds: 180, enemies: 300,
    bonus: { dodge: 0.01 } },
  ascetic: { category: 'challenge', reward: { crystals: 10 }, seconds: 120,       // без опыта первые N с
    bonus: { xpGain: 0.02 } },
  last_breath: { category: 'challenge', reward: { crystals: 10 }, hpBelow: 0.05,  // босс при HP < доли
    bonus: { armor: 0.5 } },
  no_safety: { category: 'challenge', reward: { hearts: 1 },                     // победа без reroll/skip/banish
    bonus: { luck: 0.02 } },

  // ---------- коллекция ----------
  evolutionist: { category: 'collection', reward: { bag: 'row' },  // все эволюции (evolved в weapons.js)
    bonus: { duration: 0.03 } },
  naturalist: { category: 'collection', reward: { crystals: 20 },  // все враги бестиария увидены
    bonus: { speed: 0.02 } },
  hoarder: { category: 'collection', reward: { bag: 'col' },       // стеш полон (STASH.size)
    bonus: { pickup: 0.05 } },
  tetris: { category: 'collection', reward: { bag: 'row' },        // открытая сумка без пустых клеток
    bonus: { area: 0.02 } },
  collector: { category: 'collection', reward: { scrolls: 1 }, target: 5,  // разных уникалок
    bonus: { luck: 0.02 } },
  diversity: { category: 'collection', reward: { crystals: 10 }, target: 8,  // разных типов в сумке
    bonus: { crit: 0.01 } },

  // ---------- крафт ----------
  recycler: { category: 'craft', reward: { crystals: 30 }, target: 100,       // разобрано предметов
    bonus: { pickup: 0.05 } },
  smith: { category: 'craft', reward: { scrolls: 1 }, target: 7,              // заточка до +N
    bonus: { attack: 0.02, magic: 0.02 } },
  broke_it: { category: 'craft', reward: { crystals: 10 }, target: 1,         // сломано заточкой
    bonus: { thorns: 2 } },
  chaos_alchemist: { category: 'craft', reward: { hearts: 1 }, target: 50,    // перекатов (крафт)
    bonus: { critDmg: 0.05 } },

  // ---------- кооп ----------
  side_by_side: { category: 'coop', reward: { hearts: 1 }, target: 3,         // боссов за кооп-забег
    bonus: { maxHp: 0.03 } },
  // поднять напарника: засчитывается, если свой герой простоял у гроба не меньше nearSeconds
  // (рядом таймер гроба идёт в COOP.allyBoost раз быстрее)
  medic: { category: 'coop', reward: { crystals: 10 }, target: 5, nearSeconds: 1,
    bonus: { regen: 0.05 } },
  no_one_left: { category: 'coop', reward: { hearts: 1 },                     // кооп-победа, никто не пал
    bonus: { armor: 0.5 } },

  // ---------- забавные ----------
  // кристаллов на земле при подборе своего магнита. Выше XP.mergeAbove далёкие кристаллы сливаются, поэтому
  // без накопления выходит 250–400; 400 — хороший долгий забег (замер ботами, 36 забегов)
  vacuum: { category: 'fun', reward: { crystals: 10 }, target: 400, hidden: true,
    bonus: { pickup: 0.05 } },
  // своих убийств за скользящие seconds: боты в коротких забегах 300–900, в полных 1500–4800
  meat_grinder: { category: 'fun', reward: { crystals: 20 }, target: 1500, seconds: 60, hidden: true,
    bonus: { area: 0.02 } },
};

// Проверка посреди забега (плашка сразу, как условие выполнено): раз в checkEvery с сима.
export const ACHIEVEMENT_LIVE = { checkEvery: 0.5 };

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
