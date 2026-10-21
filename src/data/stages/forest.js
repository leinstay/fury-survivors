// Этап «Лес». Строки интерфейса: stage.forest.name.
// Формат:
// {
//   id, name: 'stage.forest',
//   duration: 600,               // с, на этой секунде босс
//   tiles: ['grass', ...],       // ключи тайлсета
//   props: [{ sprite, density, breakable, hp, drop }],
//     density — среднее число на чанк SIM.chunkSize x SIM.chunkSize;
//     sim создаёт только breakable-объекты (sim.props), остальные — декор, его рисует рендер сам;
//     drop — { pickupId: шанс } для разрушаемых (шансы умножаются на luck)
//   scaling: { hpPerMinute, damagePerMinute },  // рост здоровья и урона врагов со временем
//   timeline: [                  // события по времени, сортированы по at
//     { at, type: 'spawn', enemy, rate, rateEnd?, until?, group, min?, minEnd? }
//        rate — групп в секунду, линейно к rateEnd до until; min — сколько живых врагов этого вида держать минимум (линейно к minEnd)
//     { at, type: 'ring', enemy, count, radius? }                   // кольцо вокруг игрока
//     { at, type: 'elite', enemy }                                  // элитный враг, дроп — сундук
//     { at, type: 'burst', enemy, count }                           // разовая кучка врагов у края экрана
//     { at, type: 'boss', boss }
//   ],
// }
export default {
  id: 'forest',
  name: 'stage.forest',
  duration: 600,
  tiles: ['grass'],
  props: [
    { sprite: 'tree', density: 2.5, breakable: false },
    { sprite: 'rock', density: 2, breakable: false },
    { sprite: 'bush', density: 3, breakable: false },
    { sprite: 'flower', density: 6, breakable: false },
    { sprite: 'barrel', density: 0.6, breakable: true, hp: 1, drop: { food: 0.3, coin: 0.35, magnet: 0.05 } },
    { sprite: 'lantern', density: 0.4, breakable: true, hp: 1, drop: { magnet: 0.25, food: 0.3, coin: 0.2 } },
  ],
  scaling: { hpPerMinute: 0.06, damagePerMinute: 0.03 },
  timeline: [
    { at: 0, type: 'spawn', enemy: 'bat', rate: 0.5, rateEnd: 1.2, until: 240, group: 3, min: 12, minEnd: 30 },
    { at: 60, type: 'spawn', enemy: 'slime', rate: 0.3, rateEnd: 0.8, until: 330, group: 2, min: 6, minEnd: 16 },
    { at: 120, type: 'spawn', enemy: 'catgirl', rate: 0.3, rateEnd: 0.9, until: 420, group: 2, min: 8, minEnd: 20 },
    { at: 150, type: 'ring', enemy: 'ghost', count: 16 },
    { at: 180, type: 'ring', enemy: 'ghost', count: 20 },
    { at: 200, type: 'burst', enemy: 'catgirl', count: 20 },
    { at: 210, type: 'ring', enemy: 'ghost', count: 24 },
    { at: 240, type: 'elite', enemy: 'slime' },
    { at: 240, type: 'ring', enemy: 'ghost', count: 28 },
    { at: 300, type: 'spawn', enemy: 'foxgirl', rate: 0.5, rateEnd: 1.0, until: 480, group: 3 },
    { at: 300, type: 'spawn', enemy: 'bat', rate: 0.6, rateEnd: 1.1, until: 420, group: 4 },
    { at: 390, type: 'spawn', enemy: 'succubus', rate: 0.1, rateEnd: 0.25, until: 560, group: 2 },
    { at: 450, type: 'elite', enemy: 'catgirl' },
    { at: 510, type: 'spawn', enemy: 'catgirl', rate: 1.0, rateEnd: 1.6, until: 570, group: 4, min: 60, minEnd: 120 },
    { at: 510, type: 'spawn', enemy: 'bat', rate: 1.0, rateEnd: 1.6, until: 570, group: 4, min: 60, minEnd: 120 },
    { at: 510, type: 'burst', enemy: 'slime', count: 30 },
    { at: 600, type: 'boss', boss: 'dryad_queen' },
  ],
};
