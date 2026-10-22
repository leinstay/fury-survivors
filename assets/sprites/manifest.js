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
//   smooth       true: текстура уменьшается линейно (src/scenes/Boot.js). Для снарядов, которые оружие масштабирует до ×2:
//                кадр хранится в размере самого крупного показа (density 4) и на обычном размере уменьшается без зубцов.
//   density      пикселей текстуры на 1 px мира (по умолчанию 1). Холст 1280×720 при мире 640×360 (RENDER_ZOOM 2):
//                density 1 = арт-пиксель 2×2 px холста, density 2 = 1×1 (спрайт рисуется в 0.5).
//
// HD: все спрайты с листов модели плавно уменьшены из исходника без снятия сетки (sheets.json "hd",
// tools/slice-sheet.mjs, как ходьба героини в tools/hd-frames.mjs) и показываются 1:1 на холсте (density 2).
// Кадр в px текстуры = px холста; в мире он вдвое меньше.
const HD = 2;

// Персонаж листа roster: кадр 112×112 (56×56 мира), ноги на нижней строке. Один кадр стойки, ходьба процедурная (src/render/anim.js).
// Все персонажи уменьшены одним множителем (sheets.json roster.hd), пропорции между ними как на листе.
function girl(key, color, shape = 'humanoid', frame = 112) {
  return [key, { file: `assets/sprites/${key}.png`, frameWidth: frame, frameHeight: frame, frames: 1, origin: [0.5, 1], size: [frame, frame], color, shape, density: HD }];
}

// Босс: кадр 288×288 (144×144 мира), множитель уменьшения в 1.5 раза больше, чем у обычных.
function boss(key, color, shape = 'humanoid') {
  return girl(key, color, shape, 288);
}

function item(key, w, h, color, shape = 'round', frames = 1, origin = [0.5, 0.5]) {
  return [key, { file: `assets/sprites/${key}.png`, frameWidth: w, frameHeight: h, frames, origin, size: [w - 4, h - 4], color, shape }];
}

// Иконка: кадр 96×96 с запасом детализации; src/ui/icons.js уменьшает её под нужный размер на холсте.
function icon(key, color) {
  const [k, spec] = item(key, 96, 96, color, 'rect');
  return [k, { ...spec, density: HD }];
}

// Объект из листа (tools/slice-sheet.mjs): кадр w×h, рисунок вписывается в size (по умолчанию весь кадр).
function art(key, w, h, { frames = 1, origin = [0.5, 0.5], size = [w, h], density, layer, walk, smooth, color = '#888888', shape = 'rect' } = {}) {
  const spec = { file: `assets/sprites/${key}.png`, frameWidth: w, frameHeight: h, frames, origin, size, color, shape };
  if (density) spec.density = density;
  if (layer) spec.layer = layer;
  if (walk) spec.walk = walk;
  if (smooth) spec.smooth = true;
  return [key, spec];
}
const FEET = [0.5, 1];
// Анимации PixelLab: кадр 0 стойка, 1..8 цикл. Стойка вставлена переходом на стыке 8 -> 1, иначе цикл дёргается.
const WALK_LOOP = [1, 2, 3, 4, 5, 6, 7, 8, 0];

export const SPRITES = Object.fromEntries([
  // Герои и портрет
  // Героиня: кадры PixelLab в исходной детализации, плавно уменьшены в 0.4 (tools/hd-frames.mjs), показ 1:1 на холсте.
  art('heroine', 77, 102, { frames: 9, walk: WALK_LOOP, density: HD, origin: FEET, color: '#e0603a', shape: 'humanoid' }),
  item('heroine_portrait', 48, 48, '#e0603a', 'rect'),
  // Героиня в меню: вырезана из сырого листа в исходном разрешении модели (tools/crop-raw.mjs), пиксель картинки = пиксель холста.
  art('heroine_menu', 139, 261, { density: HD, origin: FEET }),

  // Враги
  // Ходьба/парение PixelLab (assets/raw/<key>_anim_pixellab, у кошки catgirl_walk_pixellab): 9 кадров, лента через tools/hd-frames.mjs.
  art('catgirl', 77, 102, { frames: 9, walk: WALK_LOOP, density: HD, origin: FEET, color: '#d9a441', shape: 'humanoid' }),
  art('foxgirl', 77, 102, { frames: 9, walk: WALK_LOOP, density: HD, origin: FEET, color: '#e3803a', shape: 'humanoid' }),
  art('succubus', 77, 102, { frames: 9, walk: WALK_LOOP, density: HD, origin: FEET, color: '#b33a6b', shape: 'humanoid' }),
  art('slime', 77, 102, { frames: 9, walk: WALK_LOOP, density: HD, origin: FEET, color: '#5ac46a', shape: 'blob' }),
  art('ghost', 77, 102, { frames: 9, walk: WALK_LOOP, density: HD, origin: FEET, color: '#cfd8ff', shape: 'flyer' }),
  art('bunnygirl', 77, 102, { frames: 9, walk: WALK_LOOP, density: HD, origin: FEET, color: '#f0f0f0', shape: 'humanoid' }),
  art('harpy', 77, 102, { frames: 9, walk: WALK_LOOP, density: HD, origin: FEET, color: '#a07850', shape: 'flyer' }),
  art('lamia', 77, 102, { frames: 9, walk: WALK_LOOP, density: HD, origin: FEET, color: '#2f7a4a', shape: 'blob' }),


  // Боссы: анимация PixelLab в масштабе 1 (обычные враги 0.4), примерно втрое выше героини.
  art('kitsune_empress', 192, 256, { frames: 9, walk: WALK_LOOP, density: HD, origin: FEET, color: '#f08a3a', shape: 'humanoid' }),
  art('harpy_queen', 192, 256, { frames: 9, walk: WALK_LOOP, density: HD, origin: FEET, color: '#8a6040', shape: 'flyer' }),
  // Банши-жница овертайма: один кадр с листа reaper (модель нарисовала одну крупную фигуру, hd 0.25 даёт рост
  // босса ~246 px холста; кадр шире из-за косы), парит процедурно (shape flyer).
  art('reaper', 208, 256, { density: HD, origin: FEET, color: '#9fd8ff', shape: 'flyer' }),
  art('dryad_queen', 192, 256, { frames: 9, walk: WALK_LOOP, density: HD, origin: FEET, color: '#3f8a4a', shape: 'humanoid' }),

  // Предметы
  art('xp_small', 20, 24, { density: HD }),
  art('xp_medium', 24, 30, { density: HD }),
  art('xp_large', 28, 40, { density: HD }),
  art('food', 34, 34, { density: HD }),
  art('magnet', 32, 32, { density: HD }),
  art('coin', 24, 28, { density: HD }),
  art('chest', 44, 40, { density: HD, origin: FEET }),

  // Снаряды и эффекты оружия. Взмах и святой круг крупнее (кадр 64×64 мира): поведение оружия масштабирует их от ширины 64 px мира.
  art('proj_blade_arc', 256, 256, { density: 4, smooth: true }),
  art('proj_crescent', 256, 256, { density: 4, smooth: true }),   // щиты и бумеранг супероружия
  art('proj_dagger', 40, 20, { density: HD }),
  art('proj_shield', 44, 44, { density: HD }),
  art('proj_holy_ground', 128, 128, { density: HD, layer: 'ground' }),
  art('proj_axe', 44, 44, { density: HD }),
  art('proj_chain', 44, 44, { density: HD }),
  art('proj_firebomb', 44, 44, { density: HD }),
  art('proj_enemy', 20, 20, { density: HD }),

  // Иконки оружия, пассивок и карточки лечения
  icon('icon_blade_arc', '#d8d8e8'),
  icon('icon_throwing_daggers', '#b8b8c8'),
  icon('icon_guardian_shields', '#7aa6d8'),
  icon('icon_holy_ground', '#fbe3a0'),
  icon('icon_war_axe', '#8a8a9a'),
  icon('icon_storm_chain', '#bcdcf2'),
  icon('icon_firebomb', '#f2904a'),
  icon('icon_aegis_storm', '#7a5aa0'),
  icon('icon_thunder_knives', '#4a6aa8'),
  icon('icon_max_hp', '#b8433a'),
  icon('icon_attack', '#e0603a'),
  icon('icon_speed', '#86b85a'),
  icon('icon_crit', '#f7c06a'),
  icon('icon_pickup', '#b08ad0'),
  icon('icon_haste', '#7aa6d8'),
  icon('icon_luck', '#bfe07a'),
  icon('icon_armor', '#8a5a3a'),
  icon('icon_regen', '#d86a9a'),
  icon('icon_heal', '#f6c7c3'),
  // Супероружие (коллабы и эволюции): лист assets/raw/icons_evo.png (sheets.json icons_evo)
  icon('icon_phantom_blades', '#c0a0e0'),
  icon('icon_sacred_edge', '#c0a0e0'),
  icon('icon_reaper_crescent', '#c0a0e0'),
  icon('icon_storm_edge', '#c0a0e0'),
  icon('icon_inferno_slash', '#c0a0e0'),
  icon('icon_knife_carousel', '#c0a0e0'),
  icon('icon_holy_rain', '#c0a0e0'),
  icon('icon_gale_cutters', '#c0a0e0'),
  icon('icon_ember_knives', '#c0a0e0'),
  icon('icon_sanctuary', '#c0a0e0'),
  icon('icon_bulwark_spin', '#c0a0e0'),
  icon('icon_tesla_ward', '#c0a0e0'),
  icon('icon_comet_ring', '#c0a0e0'),
  icon('icon_judgement_wheel', '#c0a0e0'),
  icon('icon_divine_storm', '#c0a0e0'),
  icon('icon_hellfire', '#c0a0e0'),
  icon('icon_thunder_axe', '#c0a0e0'),
  icon('icon_blast_axe', '#c0a0e0'),
  icon('icon_plasma_storm', '#c0a0e0'),
  icon('icon_crimson_arc', '#c0a0e0'),
  icon('icon_thousand_edge', '#c0a0e0'),
  icon('icon_aegis_bastion', '#c0a0e0'),
  icon('icon_soul_garden', '#c0a0e0'),
  icon('icon_death_spiral', '#c0a0e0'),
  icon('icon_thunder_loop', '#c0a0e0'),
  icon('icon_napalm_rain', '#c0a0e0'),

  // Фон меню: снят по родной сетке (tools/snap-image.mjs), рисуется в 2.5 раза крупнее: клетка = 5×5 px холста.
  art('menu_bg', 265, 150, { density: 0.4, origin: [0, 0] }),

  // Окружение. Трава процедурная: tools/make-grass.mjs.
  item('grass', 128, 128, '#2f5a2a', 'tile', 1, [0, 0]),
  art('tree', 128, 208, { density: HD, frames: 2, origin: FEET }),
  art('rock', 56, 56, { density: HD, origin: FEET }),
  art('bush', 64, 64, { density: HD, origin: FEET }),
  art('flower', 44, 44, { density: HD, frames: 2, origin: FEET }),
  art('barrel', 44, 52, { density: HD, origin: FEET }),
  art('lantern', 52, 80, { density: HD, origin: FEET }),
  // Второй лист окружения (env_props2): вагонетка на дороге, указатель и изгородь у обочины, пень.
  art('cart', 112, 104, { density: HD, origin: FEET }),
  art('signpost', 96, 128, { density: HD, origin: FEET }),
  art('stump', 80, 72, { density: HD, origin: FEET }),
  art('fence', 112, 72, { density: HD, origin: FEET }),
]);
