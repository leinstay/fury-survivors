// Ключ спрайта -> файл и геометрия кадра. Код игры обращается к спрайтам только по ключу.
// Настоящий спрайт подменяет заглушку тем же именем файла, тем же размером кадра и той же опорой.
//
// Поля:
//   file         путь от index.html
//   frameWidth, frameHeight
//   frames       число кадров в strip-PNG (горизонтальная полоса)
//   origin       [x, y] точка опоры в долях кадра; у персонажей это ноги
//   size         видимый размер фигуры в px [w, h] (для заглушек и проверки чистки)
//   color        цвет заглушки (только tools/placeholders.mjs)
//   shape        'humanoid' | 'blob' | 'flyer' | 'round' | 'rect' | 'tile' — форма заглушки
//   layer        'ground' — снаряд лежит на земле под персонажами (зоны вроде Holy Ground); иначе поверх всех
//   density      пикселей текстуры на 1 px мира (по умолчанию 1). Холст 1280×720 при мире 640×360,
//                поэтому спрайт с density 2 рисуется в масштабе 0.5 и показывает все свои пиксели.
//                Новые спрайты делаем в density 2: рост гуманоида ~88 px, кадр 96×96 (в мире 48 px, как заглушки).
//
// Кадры персонажей: 0 стойка, 1 шаг А, 2 шаг Б. Смотрят в три четверти вправо, влево flipX.

// Спрайт двойной плотности: квадратный кадр frame, ноги на строке feet, рост фигуры h.
function hd(key, frame, feet, w, h, color, shape = 'humanoid') {
  return [key, { file: `assets/sprites/${key}.png`, frameWidth: frame, frameHeight: frame, frames: 3, origin: [0.5, feet / frame], size: [w, h], density: 2, color, shape }];
}

function item(key, w, h, color, shape = 'round', frames = 1, origin = [0.5, 0.5]) {
  return [key, { file: `assets/sprites/${key}.png`, frameWidth: w, frameHeight: h, frames, origin, size: [w - 4, h - 4], color, shape }];
}

// Объект из листа (tools/slice-sheet.mjs): кадр w×h, рисунок вписывается в size (по умолчанию весь кадр).
function art(key, w, h, { frames = 1, origin = [0.5, 0.5], size = [w, h], density, layer, color = '#888888', shape = 'rect' } = {}) {
  const spec = { file: `assets/sprites/${key}.png`, frameWidth: w, frameHeight: h, frames, origin, size, color, shape };
  if (density) spec.density = density;
  if (layer) spec.layer = layer;
  return [key, spec];
}
const FEET = [0.5, 1];

export const SPRITES = Object.fromEntries([
  // Герои и портрет
  ['heroine', { file: 'assets/sprites/heroine.png', frameWidth: 96, frameHeight: 96, frames: 3, origin: [0.5, 94 / 96], size: [60, 88], density: 2, color: '#e0603a', shape: 'humanoid' }],
  item('heroine_portrait', 48, 48, '#e0603a', 'rect'),

  // Враги
  hd('bat', 48, 44, 40, 34, '#6b4a8a', 'flyer'),
  hd('slime', 64, 62, 50, 56, '#5ac46a', 'blob'),
  hd('catgirl', 96, 94, 50, 84, '#d9a441'),
  hd('ghost', 64, 62, 36, 60, '#cfd8ff', 'flyer'),
  hd('foxgirl', 96, 94, 54, 84, '#e3803a'),
  hd('succubus', 96, 94, 50, 84, '#b33a6b'),

  // Босс
  // Босс вдвое выше героини: родной рост 115 арт-пикселей приводится к ~88 px мира (density 115/88).
  // Временный нецелый масштаб, до пересоздания персонажей на общей сетке.
  ['dryad_queen', { file: 'assets/sprites/dryad_queen.png', frameWidth: 128, frameHeight: 128, frames: 3, origin: [0.5, 124 / 128], size: [70, 115], density: 1.3, color: '#3f8a4a', shape: 'humanoid' }],

  // Предметы (обычная плотность: арт-пиксель = 2 px холста)
  art('xp_small', 10, 12),
  art('xp_medium', 12, 14),
  art('xp_large', 14, 20),
  art('food', 16, 16),
  art('magnet', 16, 16),
  art('coin', 12, 14),
  art('chest', 22, 20, { origin: FEET }),

  // Снаряды и эффекты оружия. Взмах и святой круг в половинной плотности (арт-пиксель = 4 px холста):
  // поведение оружия масштабирует их от ширины 64 px мира, а родной рисунок модели ~30 px.
  art('proj_blade_arc', 32, 32, { density: 0.5 }),
  art('proj_dagger', 20, 10),
  art('proj_shield', 22, 22),
  art('proj_holy_ground', 32, 32, { density: 0.5, layer: 'ground' }),
  art('proj_axe', 22, 22),
  art('proj_chain', 22, 22),
  art('proj_firebomb', 22, 22),
  art('proj_enemy', 10, 10),

  // Иконки оружия, пассивок и карточки лечения (24×24)
  item('icon_blade_arc', 24, 24, '#d8d8e8', 'rect'),
  item('icon_throwing_daggers', 24, 24, '#b8b8c8', 'rect'),
  item('icon_guardian_shields', 24, 24, '#7aa6d8', 'rect'),
  item('icon_holy_ground', 24, 24, '#fbe3a0', 'rect'),
  item('icon_war_axe', 24, 24, '#8a8a9a', 'rect'),
  item('icon_storm_chain', 24, 24, '#bcdcf2', 'rect'),
  item('icon_firebomb', 24, 24, '#f2904a', 'rect'),
  item('icon_aegis_storm', 24, 24, '#7a5aa0', 'rect'),
  item('icon_thunder_knives', 24, 24, '#4a6aa8', 'rect'),
  item('icon_max_hp', 24, 24, '#b8433a', 'rect'),
  item('icon_attack', 24, 24, '#e0603a', 'rect'),
  item('icon_speed', 24, 24, '#86b85a', 'rect'),
  item('icon_crit', 24, 24, '#f7c06a', 'rect'),
  item('icon_pickup', 24, 24, '#b08ad0', 'rect'),
  item('icon_haste', 24, 24, '#7aa6d8', 'rect'),
  item('icon_luck', 24, 24, '#bfe07a', 'rect'),
  item('icon_armor', 24, 24, '#8a5a3a', 'rect'),
  item('icon_regen', 24, 24, '#d86a9a', 'rect'),
  item('icon_heal', 24, 24, '#f6c7c3', 'rect'),

  // Окружение (обычная плотность). Трава процедурная: tools/make-grass.mjs.
  item('grass', 128, 128, '#2f5a2a', 'tile', 1, [0, 0]),
  art('tree', 56, 60, { frames: 2, origin: FEET }),
  art('rock', 30, 22, { origin: FEET }),
  art('bush', 30, 24, { origin: FEET }),
  art('flower', 14, 16, { frames: 2, origin: FEET }),
  art('barrel', 18, 20, { origin: FEET }),
  art('lantern', 22, 36, { origin: FEET }),
]);
