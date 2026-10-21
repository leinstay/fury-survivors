// Этап «Лес».
// Формат:
// {
//   id, name: 'i18n.key',
//   duration: 600,               // с, на этой секунде босс
//   tiles: ['grass_0', ...],     // ключи кадров тайлсета
//   props: [{ sprite, density, breakable, drop }],
//   timeline: [                  // события по времени, сортированы по at
//     { at: 0, type: 'spawn', enemy: 'bat', rate: 1.5, group: 3 },      // rate — групп в секунду
//     { at: 180, type: 'ring', enemy: 'ghost', count: 24 },
//     { at: 240, type: 'elite', enemy: 'slime' },
//     { at: 600, type: 'boss', boss: 'dryad_queen' },
//   ],
// }
export default {
  id: 'forest',
  name: 'stage.forest',
  duration: 600,
  tiles: [],
  props: [],
  timeline: [],
};
