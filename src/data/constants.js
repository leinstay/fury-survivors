// Глобальные числа игры. Баланс конкретного контента лежит в соседних файлах.

export const GAME_WIDTH = 640;
export const GAME_HEIGHT = 360;

// Время в секундах, расстояния в пикселях игрового мира, скорость в px/с.
export const SIM = {
  tickRate: 60,            // шагов симуляции в секунду
  maxEnemies: 400,         // жёсткий лимит живых врагов
  despawnDistance: 520,    // дальше этого отставший враг переносится вперёд по ходу игрока
  gridCellSize: 64,        // ячейка пространственной сетки
};

export const PLAYER = {
  iframes: 0.5,            // неуязвимость после удара, с
  knockback: 0,            // отбрасывание игрока (врагов отбрасывает оружие)
  pickupRadius: 40,        // базовый радиус подбора
  magnetSpeed: 320,        // скорость притягивания предметов
};

export const XP = {
  // Опыт до следующего уровня: base + perLevel * (level - 1) + bonus за пороги.
  base: 5,
  perLevel: 10,
  thresholds: [{ level: 20, extra: 600 }, { level: 40, extra: 2400 }],
  mergeRadius: 24,         // кристаллы рядом сливаются, когда их больше mergeAbove
  mergeAbove: 300,
};

export const SLOTS = { weapons: 6, passives: 6 };

export const LEVEL_UP = {
  cards: 4,
  rerolls: 3,
  skips: 3,
  banishes: 3,
};

export const FEEL = {
  hitstop: 0.04,           // с, на крупных ударах
  shake: 0.08,
};
