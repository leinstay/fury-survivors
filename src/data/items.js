// Предметы мета-прогрессии (docs/META.md, раздел 2): типы, формы, сила, редкость, сундуки,
// уникалки, крафт, стеш и сумка. Логика в src/core/items.js, строки в src/i18n/en-items.js.

// Статы, которые бывают на предметах. Процентные идут в increased (доля, 0.1 = +10%),
// плоские прибавляются как есть (crit и dodge — доли шанса, resistance — доля снижения удара, regen — HP/с,
// thorns — доля максимума HP врагов).
export const ITEM_PERCENT_STATS = ['maxHp', 'attack', 'magic', 'speed', 'critDmg', 'area',
  'duration', 'pickup', 'haste', 'luck', 'xpGain'];
export const ITEM_FLAT_STATS = ['crit', 'dodge', 'resistance', 'regen', 'thorns'];
export const ITEM_STATS = [...ITEM_PERCENT_STATS, ...ITEM_FLAT_STATS];

// Ориентир силы: сколько стата даёт вкачанная пассивка (уровень 5). Для старых пассивок
// это их числа (attack L5 = +0.5 → attack/magic 0.5), для новых статов — оценка.
// Защита (maxHp, resistance, regen, dodge) тоже равна пассивке L5: большой предмет (2×3, T2) даёт около одного уровня
// защитной пассивки, то есть ≈ +1 удар запаса на 10:00 (tools/simulation/defense.mjs, docs/BALANCE_AUDIT.md 12);
// раньше было 0.3–0.4 от пассивки, и предмет давал неощутимые +8 HP. speed пока 0.25 от пассивки.
// База аффикса на единицу бюджета = ref × ITEM_POWER.scale.
export const STAT_REF = {
  maxHp: 1.0, attack: 0.5, magic: 0.5, speed: 0.25, critDmg: 0.75, area: 0.5, duration: 0.5,
  pickup: 1.25, haste: 0.4, luck: 0.5, xpGain: 0.5,
  crit: 0.25, dodge: 0.4, resistance: 0.4, regen: 0.6, thorns: 0.15,
};

// Переименованные статы аффиксов в старых сохранениях: stat -> { to, mul } (значение, min и max × mul).
// armor был в единицах (ref 9), resistance — доля (ref 0.4): пересчёт по отношению ref, ролл сохраняет качество.
export const LEGACY_AFFIX_STATS = { armor: { to: 'resistance', mul: 0.4 / 9 } };
// Статы, сменившие единицы при том же имени: в сохранениях версии ниже before числа × mul.
// thorns был уроном (ref 20), стал долей максимума HP врага (ref 0.15).
export const LEGACY_AFFIX_SCALE = { thorns: { before: 2, mul: 0.15 / 20 } };

export const ITEM_POWER = {
  // бюджет формы = клетки^shapeExp (1×1 = 1.0, 2×2 = 5.66, 2×3 = 9.39, 2×4 = 13.45, 3×3 = 15.59)
  shapeExp: 1.25,
  // калибровка: полная сумка 9×5 из T2 со случайными роллами ≈ 2.4 вкачанные пассивки
  // (с бонусом разнообразия, tests/unit/items.test.js); отобранные игроком лучше
  scale: 0.02,
  tierMul: { 1: 1.0, 2: 1.3, 3: 1.7, 4: 2.2 },
  enchantStep: 0.05, // +5% к значению за каждый плюс
  negativeChance: 1 / 3, // необязательный аффикс уходит в минус [−max/2 … 0]
  round: 1e4, // значения хранятся с точностью до 1e-4
};

export const TIERS = [1, 2, 3, 4];

// Редкости по порядку. affixes — всего аффиксов вместе с обязательным.
export const RARITIES = ['common', 'rare', 'epic', 'unique'];
export const RARITY_AFFIXES = { common: 2, rare: 3, epic: 4 };

// Типы: формы [ширина, высота] с весами и пул обязательного аффикса (null = любой стат).
// weight — вес типа в сундуке (мелочь чаще). relic только для уникалок (weight 0).
export const ITEM_TYPES = {
  ring:   { weight: 10, shapes: [{ size: [1, 1], weight: 1 }], implicit: ['crit', 'luck'] },
  amulet: { weight: 8, shapes: [{ size: [1, 1], weight: 1 }],
    implicit: ['pickup', 'luck', 'xpGain'] },
  charm:  { weight: 10, shapes: [{ size: [1, 1], weight: 2 }, { size: [1, 2], weight: 1 }],
    implicit: null },
  belt:   { weight: 7, shapes: [{ size: [2, 1], weight: 1 }], implicit: ['regen', 'maxHp'] },
  gloves: { weight: 6, shapes: [{ size: [2, 2], weight: 1 }],
    implicit: ['haste', 'attack', 'magic'] },
  boots:  { weight: 6, shapes: [{ size: [2, 2], weight: 1 }], implicit: ['speed', 'dodge'] },
  helm:   { weight: 6, shapes: [{ size: [2, 2], weight: 1 }], implicit: ['resistance', 'maxHp'] },
  shield: { weight: 5, shapes: [{ size: [2, 2], weight: 2 }, { size: [2, 3], weight: 1 }],
    implicit: ['resistance', 'thorns'] },
  armor:  { weight: 4, shapes: [{ size: [2, 3], weight: 1 }], implicit: ['maxHp', 'resistance'] },
  weapon: { weight: 5, shapes: [
    { size: [1, 3], weight: 3 }, { size: [2, 3], weight: 3 },
    { size: [1, 4], weight: 2 }, { size: [2, 4], weight: 1 },
  ], implicit: ['attack', 'magic'] },
  relic:  { weight: 0, shapes: [{ size: [3, 3], weight: 1 }], implicit: [] },
};

// Вес аффикса (ходовые чаще). Им же выбирается обязательный внутри пула типа.
export const AFFIX_WEIGHTS = {
  maxHp: 10, attack: 8, magic: 8, speed: 7, crit: 6, critDmg: 5, area: 6, duration: 5,
  pickup: 6, haste: 6, luck: 5, resistance: 7, regen: 6, xpGain: 4, dodge: 3, thorns: 3,
};

// Сундук с босса: веса редкости и свитка по тиру сундука.
export const CHEST_TABLES = {
  1: { common: 70, rare: 25, epic: 5, unique: 0, scroll: 0 },
  2: { common: 50, rare: 35, epic: 13, unique: 2, scroll: 0 },
  3: { common: 30, rare: 40, epic: 24, unique: 4, scroll: 2 },
  4: { common: 0, rare: 0, epic: 70, unique: 20, scroll: 10 },
};
export const CHEST_SIZE = 3;

// Боссы по порядку убийства в забеге: тир сундука и сердца хаоса (chance — шанс, n — сколько).
export const BOSS_DROPS = [
  { boss: 'kitsune_empress', tier: 1, hearts: { chance: 0.3, n: 1 } },
  { boss: 'harpy_queen', tier: 2, hearts: { chance: 1, n: 1 } },
  { boss: 'dryad_queen', tier: 3, hearts: { chance: 1, n: 1 } },
  { boss: 'reaper', tier: 4, hearts: { chance: 1, n: 2 } },
];

// Уникалки: фиксированный тип и форма, без аффиксов. Поля эффекта — данные, их читает сим:
//   more: { стат: доля }   — множитель «more» (1 = ×2, −0.4 = ×0.6), в т.ч. для плоских статов
//   maxHpSet: n           — максимум HP ровно n
//   resistanceOff / regenOff — стат не работает
//   regenOnlyStill        — реген только пока игрок стоит
//   reaperVulnerable      — Жница уязвима в освящённом круге (docs/META.md, 4)
//   evoChoicesAdd         — +N вариантов в сундуке эволюции; foodHeals: false — еда не лечит
//   dmgPerSpeed           — урон × (1 + dmgPerSpeed × (скорость/база − 1)); stillDmgMore — на месте
//   dmgPerMissingHp       — +доля урона за каждую долю недостающего HP (1 = +1% за 1%)
//   cheatDeath            — раз за забег: invuln с неуязвимости, heal доля HP, затем maxHpMore
//   nearRange / nearDmgMore / farDmgMore — урон по близким и дальним врагам (px мира)
//   cooldownMore          — множитель кулдаунов (−0.3 = ×0.7)
//   noNewWeapons / passiveMul / passiveSlotsAdd — монах
//   dice: { interval, up, down } — раз в interval с случайный стат +up, другой down
// minTier — с какого тира сундука выпадает.
export const UNIQUES = {
  bible:        { type: 'relic', size: [3, 3], minTier: 3, reaperVulnerable: true },
  glass_cannon: { type: 'weapon', size: [1, 3], minTier: 2,
    more: { attack: 1, magic: 1 }, maxHpSet: 1, resistanceOff: true },
  kaom_heart:   { type: 'armor', size: [2, 3], minTier: 2,
    more: { regen: 1 }, regenOnlyStill: true },
  greed:        { type: 'ring', size: [1, 1], minTier: 2, evoChoicesAdd: 1, foodHeals: false },
  sprinter:     { type: 'boots', size: [2, 2], minTier: 2, dmgPerSpeed: 1, stillDmgMore: -0.5 },
  turtle:       { type: 'shield', size: [2, 3], minTier: 2, more: { resistance: 2, speed: -0.4 } },
  berserk:      { type: 'gloves', size: [2, 2], minTier: 2, dmgPerMissingHp: 1, regenOff: true },
  spiked_shell: { type: 'shield', size: [2, 2], minTier: 2,
    more: { thorns: 2, attack: -0.3, magic: -0.3 } },
  last_chance:  { type: 'amulet', size: [1, 1], minTier: 2,
    cheatDeath: { invuln: 3, heal: 1, maxHpMore: -0.5 } },
  myopia:       { type: 'helm', size: [2, 2], minTier: 2,
    nearRange: 100, nearDmgMore: 0.6, farDmgMore: -0.4 },
  clock:        { type: 'charm', size: [1, 2], minTier: 2,
    cooldownMore: -0.3, more: { duration: -0.3 } },
  monk:         { type: 'belt', size: [2, 1], minTier: 2,
    noNewWeapons: true, passiveMul: 2, passiveSlotsAdd: 2 },
  dice:         { type: 'charm', size: [1, 1], minTier: 2,
    dice: { interval: 60, up: 0.3, down: -0.15 } },
};

// Сумка: сетка 9×6, открыто 7×4, ачивки открывают столбцы и ряд (id из docs/META.md, 5).
export const BAG = {
  w: 9, h: 6,
  startCols: 7, startRows: 4,
  unlocks: {
    three_crowns: { cols: 1 },
    hoarder: { cols: 1 },
    tetris: { rows: 1 },
    evolutionist: { rows: 1 },
  },
  maxUniques: 1,
  diversityPerType: 0.03, // +3% ко всем аффиксам за каждый разный тип в сумке сверх первого (1 тип = 0)
  presets: 3,
};

export const STASH = { size: 100 };

// Валюты: кристаллы, свиток защиты (только дроп), сердце хаоса.
export const CURRENCIES = ['crystals', 'scrolls', 'hearts'];

// Разборка: кристаллы = rarity × tier.
export const DISASSEMBLE = {
  rarity: { common: 1, rare: 3, epic: 9, unique: 20 },
  tier: { 1: 1, 2: 2, 3: 4, 4: 8 },
};

// Крафт. Цена в кристаллах × costTierMul[тир предмета].
export const CRAFT = {
  costTierMul: { 1: 1, 2: 2, 3: 3, 4: 4 },
  rerollAll: { crystals: 6 },
  rerollValue: { crystals: 15 },
  upgradeRarity: {
    crystals: 40,
    hearts: { rare: 1, epic: 3 }, // сердца по целевой редкости
    chance: { rare: 0.7, epic: 0.5 },
    breakRefund: false, // провал без свитка: предмет пропадает без кристаллов
  },
  merge: {
    crystals: 20,
    hearts: { common: 0, rare: 1, epic: 3 }, // по редкости итога
  },
  enchant: {
    max: 9,
    crystalsPerLevel: 5, // до +N стоит 5 × N (с +N−1 на +N)
    // шанс успеха по целевому уровню: до +3 без риска, дальше 70/60/50/40/30/20%
    chance: { 1: 1, 2: 1, 3: 1, 4: 0.7, 5: 0.6, 6: 0.5, 7: 0.4, 8: 0.3, 9: 0.2 },
    breakRefund: true, // провал без свитка: предмет разбирается в кристаллы
  },
  // свиток тратится только на провале (спасает предмет)
  scrollConsumedOnSuccess: false,
};

// Имена: [префикс] [база] [суффикс]; слов на стат в каждом пуле (en-items.js), от слабых к сильным.
export const NAME_WORDS = 6;

// Версия сохранения инвентаря.
export const INVENTORY_VERSION = 2; // 2: thorns в долях HP врага (LEGACY_AFFIX_SCALE)
