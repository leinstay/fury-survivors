// Глобальные числа игры. Баланс конкретного контента лежит в соседних файлах.

export const GAME_WIDTH = 640;
export const GAME_HEIGHT = 360;
// Холст рисуется в RENDER_ZOOM раз крупнее мира: 1280×720. Мир, данные и UI остаются в координатах 640×360.
// Спрайты density 1 (manifest.js) рисуются целым множителем: арт-пиксель = квадрат 2×2 холста, без пересэмплинга.
export const RENDER_ZOOM = 2;

// Звук: ползунок громкости 100% = gain (прежние 10% ползунка; файлы сами по себе громкие).
export const AUDIO = { gain: 0.1 };

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
  foodChance: 0,           // еда с врагов не падает, только из разрушаемых объектов (как курица в VS)
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

// Эффекты рендера (src/render/fx.js, anim.js, world.js). Время в секундах, расстояния в px мира.
export const FX = {
  dmgText: { max: 60, life: 0.6, rise: 18, size: 8, critSize: 12, color: '#ffffff', critColor: '#ffb52e', stroke: '#1a1426' },
  sparks: { min: 2, max: 4, speed: 70, life: 0.25, color: 0xfff2a0, critColor: 0xffb52e },
  puff: { count: 5, eliteCount: 10, bossCount: 20, speed: 60, life: 0.45, size: 3, eliteSize: 1.6, colors: [0xffffff, 0xd0d0d0, 0x9a9a9a] },
  maxParticles: 320,
  ghost: { max: 24, life: 0.25, squashY: 0.25, stretchX: 1.25, eliteScale: 1.25 },
  shake: { hurt: [2, 0.15], elite: [3, 0.2], boss: [5, 0.35] }, // [амплитуда px, длительность с]
  hitstop: { crit: 0.03, hurt: 0.06, elite: 0.07, boss: 0.08, cap: 0.1, cooldown: 0.3 },
  levelup: { flashAlpha: 0.5, flashTime: 0.3, ringTime: 0.5, ringRadius: 70, ringColor: 0xffe88a },
  pickupSpark: { count: 2, color: 0x7fd8ff, life: 0.25, speed: 40 },
  hitSquash: { x: 1.18, y: 0.82 },
  // Ходьба (src/render/anim.js): fps — кадров ходьбы в секунду у спрайтов с кадрами; однокадровые подпрыгивают
  // на hop целых px мира, steps шагов в секунду; летуны парят на hoverHeight px, качаясь на ±hover px.
  walk: { fps: 8, steps: 2.4, hop: 1, hover: 2, hoverHeight: 6, hoverSpeed: 4 },
  // Поза босса: при замахе приседает на windupDrop px, при касте подпрыгивает на castLift px.
  bossPose: { windupDrop: 2, castLift: 3 },
  shadow: { alpha: 0.3, widthK: 0.5, height: 0.3, yOffset: -1, depth: -50000 },
};
