// Ключ спрайта -> файл и геометрия кадра. Код игры обращается к спрайтам только по ключу.
// Настоящий спрайт подменяет заглушку тем же именем файла, тем же размером кадра и той же опорой.
//
// Поля:
//   file         путь от index.html
//   frameWidth, frameHeight
//   frames       число кадров в strip-PNG (горизонтальная полоса). Можно не указывать: src/scenes/Boot.js считает его
//                по ширине загруженной картинки (ширина / frameWidth), tests/unit/sprites.test.js проверяет, что делится.
//   walk         порядок кадров цикла ходьбы (по умолчанию 1..frames-1), см. src/render/anim.js
//   seam         true: цикл 1..frames-1, затем стойка 0 переходом на стыке (вместо walk, от числа кадров не зависит)
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

// Кадр всех персонажей, кроме боссов и жницы: CHAR×CHAR, ноги на нижней строке по центру.
// Лента — сколько угодно квадратов вправо: кадр 0 стойка, остальные цикл ходьбы. Число кадров берётся из ширины PNG.
export const CHAR = 110;
// Тень персонажа по ширине прежнего кадра 77 px (77 × 0.5 мира × widthK 0.5), а не по запасу кадра 110.
const CHAR_SHADOW = { dx: 0, width: 19 };

function item(key, w, h, color, shape = 'round', frames = 1, origin = [0.5, 0.5]) {
  return [key, { file: `assets/sprites/${key}.png`, frameWidth: w, frameHeight: h, frames, origin, size: [w - 4, h - 4], color, shape }];
}

// Иконка: кадр 96×96 с запасом детализации; src/ui/icons.js уменьшает её под нужный размер на холсте.
function icon(key, color) {
  const [k, spec] = item(key, 96, 96, color, 'rect');
  return [k, { ...spec, density: HD }];
}

// Объект из листа (tools/slice-sheet.mjs): кадр w×h, рисунок вписывается в size (по умолчанию весь кадр).
// frames: null — число кадров по ширине PNG (src/scenes/Boot.js).
function art(key, w, h, { frames = 1, origin = [0.5, 0.5], size = [w, h], density, layer, walk, seam, smooth, color = '#888888', shape = 'rect', shadow } = {}) {
  const spec = { file: `assets/sprites/${key}.png`, frameWidth: w, frameHeight: h, origin, size, color, shape };
  if (frames) spec.frames = frames;
  if (density) spec.density = density;
  if (layer) spec.layer = layer;
  if (walk) spec.walk = walk;
  if (seam) spec.seam = true;
  if (smooth) spec.smooth = true;
  if (shadow) spec.shadow = shadow; // { dx, width } px мира: тень не под центром кадра (коса жницы уводит центр)
  return [key, spec];
}
const FEET = [0.5, 1];

// Персонаж (не босс): кадр CHAR×CHAR, число кадров по ширине ленты. Анимации PixelLab: стойка вставлена
// переходом на стыке последний -> 1 (seam), иначе цикл дёргается.
function chara(key, color, shape = 'humanoid') {
  return art(key, CHAR, CHAR, { frames: null, seam: true, density: HD, origin: FEET, color, shape, shadow: CHAR_SHADOW });
}

export const SPRITES = Object.fromEntries([
  // Герои и портрет
  // Героиня: кадры PixelLab в исходной детализации, плавно уменьшены в 0.4 (tools/hd-frames.mjs --canvas 110x110),
  // показ 1:1 на холсте.
  chara('heroine', '#e0603a'),
  item('heroine_portrait', 48, 48, '#e0603a', 'rect'),
  // магесса: PixelLab по assets/raw/mage.png (холст 256×256, лента ×0.4282 — тот же размер пикселя, что у героини)
  chara('mage', '#6a5cff'),
  art('mage_menu', 205, 279, { density: HD, origin: FEET }),
  item('mage_portrait', 48, 48, '#6a5cff', 'rect'),
  // Героиня в меню: вырезана из сырого листа в исходном разрешении модели (tools/crop-raw.mjs), пиксель картинки = пиксель холста.
  art('heroine_menu', 139, 261, { density: HD, origin: FEET }),

  // Враги
  // Ходьба/парение PixelLab (assets/raw/<key>_anim_pixellab, у кошки catgirl_walk_pixellab), лента через
  // tools/hd-frames.mjs 0.4 --canvas 110x110.
  chara('catgirl', '#d9a441'),
  chara('foxgirl', '#e3803a'),
  chara('succubus', '#b33a6b'),
  chara('slime', '#5ac46a', 'blob'),
  chara('ghost', '#cfd8ff', 'flyer'),
  chara('bunnygirl', '#f0f0f0'),
  chara('harpy', '#a07850', 'flyer'),
  chara('lamia', '#2f7a4a', 'blob'),


  // Боссы: анимация PixelLab в масштабе 1 (обычные враги 0.4), примерно втрое выше героини. Свой кадр,
  // число кадров тоже по ширине ленты.
  art('kitsune_empress', 192, 256, { frames: null, seam: true, density: HD, origin: FEET, color: '#f08a3a', shape: 'humanoid' }),
  art('harpy_queen', 192, 256, { frames: null, seam: true, density: HD, origin: FEET, color: '#8a6040', shape: 'flyer' }),
  // Банши-жница овертайма: парение PixelLab (assets/raw/reaper_anim_pixellab, холст 192×256, максимум API),
  // лента увеличена в 1.5 (tools/hd-frames.mjs 1.5): рост в полтора босса. Тело левее центра кадра из-за косы,
  // тень сдвинута (shadow.dx, зеркалится вместе со спрайтом).
  art('reaper', 288, 384, {
    frames: null, seam: true, density: HD, origin: FEET, color: '#9fd8ff', shape: 'flyer',
    shadow: { dx: -17, width: 50 },
  }),
  art('dryad_queen', 192, 256, { frames: null, seam: true, density: HD, origin: FEET, color: '#3f8a4a', shape: 'humanoid' }),

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
