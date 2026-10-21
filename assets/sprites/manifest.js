// Ключ спрайта -> файл и геометрия кадра. Код игры обращается к спрайтам только по ключу.
// Настоящий спрайт подменяет заглушку тем же именем файла, тем же размером кадра и той же опорой.
//
// Поля:
//   file         путь от index.html
//   frameWidth, frameHeight
//   frames       число кадров в strip-PNG (горизонтальная полоса)
//   walk         порядок кадров цикла ходьбы (по умолчанию 1..frames-1), см. src/render/anim.js
//   origin       [x, y] точка опоры в долях кадра; у персонажей это ноги
//   size         видимый размер фигуры в px [w, h] (для заглушек и проверки чистки)
//   color        цвет заглушки (только tools/placeholders.mjs)
//   shape        'humanoid' | 'blob' | 'flyer' | 'round' | 'rect' | 'tile' — форма заглушки
//   layer        'ground' — снаряд лежит на земле под персонажами (зоны вроде Holy Ground); иначе поверх всех
//   density      пикселей текстуры на 1 px мира (по умолчанию 1). Холст 1280×720 при мире 640×360 (RENDER_ZOOM 2):
//                density 1 = арт-пиксель 2×2 px холста, density 2 = 1×1 (спрайт рисуется в 0.5).
//                Персонажи ~50 px в кадре 56×56, боссы ~95 px в кадре 96×96.
//
// Кадры персонажей: 0 стойка, 1 шаг А, 2 шаг Б. Смотрят в три четверти вправо, влево flipX.

// Персонаж общего листа (assets/raw/roster.png, tools/slice-sheet.mjs roster): все сняты с одной сетки модели
// и ужаты одним общим множителем листа (sheets.json scale), так что пропорции между персонажами сохраняются.
// Обычная плотность: арт-пиксель = пиксель мира. Один кадр стойки, ходьба процедурная (src/render/anim.js).
// Кадр frame×frame, ноги на нижней строке.
function girl(key, frame, color, shape = 'humanoid') {
  return [key, { file: `assets/sprites/${key}.png`, frameWidth: frame, frameHeight: frame, frames: 1, origin: [0.5, 1], size: [frame, frame], color, shape }];
}

// Босс: кадр 96×96 с листа roster, рисуется в 1.5 раза крупнее (density 2/3).
const BOSS_DENSITY = 2 / 3;
function boss(key, color, shape = 'humanoid') {
  const [k, spec] = girl(key, 96, color, shape);
  return [k, { ...spec, density: BOSS_DENSITY }];
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
  // Героиня: свой лист heroine_walk (стойка + 3 кадра шага), тот же масштаб, что у roster.
  // walk — порядок кадров цикла шага (кадр 2, ноги вместе, повторяется между шагами).
  ['heroine', { ...girl('heroine', 56, '#e0603a')[1], frames: 5, walk: [1, 2, 3, 4] }],
  item('heroine_portrait', 48, 48, '#e0603a', 'rect'),
  // Героиня в меню: вырезана из сырого листа в исходном разрешении модели (tools/crop-raw.mjs), пиксель картинки = пиксель холста.
  art('heroine_menu', 139, 261, { density: 2, origin: FEET }),

  // Враги
  girl('catgirl', 56, '#d9a441'),
  girl('foxgirl', 56, '#e3803a'),
  girl('succubus', 56, '#b33a6b'),
  girl('slime', 56, '#5ac46a', 'blob'),
  girl('ghost', 56, '#cfd8ff', 'flyer'),
  girl('bunnygirl', 56, '#f0f0f0'),
  girl('harpy', 56, '#a07850', 'flyer'),
  girl('lamia', 56, '#2f7a4a', 'blob'),


  // Боссы: тот же лист и та же сетка (вдвое выше обычного персонажа) и масштаб 1.5 при показе (BOSS_DENSITY):
  // втрое выше героини, клетка арта = ровно 3×3 px холста.
  boss('kitsune_empress', '#f08a3a'),
  boss('harpy_queen', '#8a6040', 'flyer'),
  boss('dryad_queen', '#3f8a4a'),

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

  // Фон меню: снят по родной сетке (tools/snap-image.mjs), рисуется в 2.5 раза крупнее: клетка = 5×5 px холста.
  art('menu_bg', 265, 150, { density: 0.4, origin: [0, 0] }),

  // Окружение (обычная плотность). Трава процедурная: tools/make-grass.mjs.
  item('grass', 128, 128, '#2f5a2a', 'tile', 1, [0, 0]),
  art('tree', 64, 104, { frames: 2, origin: FEET }),
  art('rock', 28, 28, { origin: FEET }),
  art('bush', 32, 32, { origin: FEET }),
  art('flower', 22, 22, { frames: 2, origin: FEET }),
  art('barrel', 22, 26, { origin: FEET }),
  art('lantern', 26, 40, { origin: FEET }),
]);
