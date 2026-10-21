// Глобальные числа игры. Баланс конкретного контента лежит в соседних файлах.

export const GAME_WIDTH = 640;
export const GAME_HEIGHT = 360;

// Время в секундах, расстояния в пикселях игрового мира, скорость в px/с.
export const SIM = {
  tickRate: 60,            // шагов симуляции в секунду
  maxEnemies: 400,         // жёсткий лимит живых врагов
  despawnDistance: 520,    // дальше этого отставший враг переносится вперёд по ходу игрока
  spawnDistance: 390,      // расстояние появления врагов от игрока (за краем экрана 640x360)
  gridCellSize: 64,        // ячейка пространственной сетки
  chunkSize: 320,          // размер чанка для генерации объектов (props) вокруг игрока
  propKeepDistance: 1600,  // дальше этого объекты удаляются
};

export const PLAYER = {
  radius: 7,               // радиус хитбокса игрока
  iframes: 0.5,            // неуязвимость после удара, с
  hurtFlash: 0.25,         // длительность вспышки после удара, с
  knockback: 0,            // отбрасывание игрока (врагов отбрасывает оружие)
  pickupRadius: 40,        // базовый радиус подбора
  magnetSpeed: 320,        // скорость притягивания предметов
  touchRadius: 12,         // радиус касания для предметов без притягивания (еда, магнит, сундук)
};

export const COMBAT = {
  critMul: 2,              // множитель крита
  hitFlash: 0.1,           // белая вспышка врага после попадания, с
  knockbackDecay: 10,      // быстрота затухания отбрасывания (1/с)
  separation: 0.35,        // доля перекрытия, которую враги раздвигают за шаг
  armorMinDamage: 1,       // урон не падает ниже этого значения
};

export const XP = {
  // Опыт до следующего уровня: base + perLevel * (level - 1) + extra на пороговом уровне.
  base: 6,
  perLevel: 8,
  thresholds: [{ level: 20, extra: 600 }, { level: 40, extra: 2400 }],
  mergeRadius: 24,         // кристаллы рядом сливаются, когда их больше mergeAbove
  mergeAbove: 300,
  mergeInterval: 0.5,      // с между проходами слияния
  mergeMinPlayerDistance: 160, // рядом с игроком кристаллы не сливаются
};

// Шансы выпадения с обычных врагов (умножаются на стат luck).
export const DROPS = {
  coinChance: 0.015,
  foodChance: 0.008,
};

export const SLOTS = { weapons: 6, passives: 6 };

export const LEVEL_UP = {
  cards: 4,
  rerolls: 3,
  skips: 3,
  banishes: 3,
  healFraction: 0.3,       // карточка лечения (когда всё на максимуме) лечит эту долю maxHp
};

export const FEEL = {
  hitstop: 0.04,           // с, на крупных ударах
  shake: 0.08,
};
