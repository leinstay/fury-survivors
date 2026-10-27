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
// Исходник 256×256 (запас над головой, ноги на нижней строке), в игру ровно ×0.5.
export const CHAR = 128;
// Боссы и жница: исходник 256×256, в игру ×1.
export const BOSS = 256;
// Тень персонажа ~19 px мира по ширине ног, а не по запасу кадра.
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
// Босс: кадр BOSS×BOSS, тень по ширине ног (shadow.width px мира, dx — сдвиг от центра кадра).
function boss(key, color, shape, shadow) {
  return art(key, BOSS, BOSS, { frames: null, seam: true, density: HD, origin: FEET, color, shape, shadow });
}

function chara(key, color, shape = 'humanoid') {
  return art(key, CHAR, CHAR, { frames: null, seam: true, density: HD, origin: FEET, color, shape, shadow: CHAR_SHADOW });
}

export const SPRITES = Object.fromEntries([
  // Герои и портрет
  // Все персонажи: стойка PixelLab Edit Pro + анимация Animate V3 в холсте 256×256, утверждённые листы
  // (tools/out/first-frames-256/approved) → assets/raw/<key>_walk256_pixellab и ленты: tools/approved-to-raw.mjs.
  chara('heroine', '#e0603a'),
  item('heroine_portrait', 48, 48, '#e0603a', 'rect'),
  chara('mage', '#6a5cff'),
  art('mage_menu', 164, 223, { density: HD, origin: FEET }),
  item('mage_portrait', 48, 48, '#6a5cff', 'rect'),
  // Героини в меню: стойка (кадр 0 утверждённой анимации 256) по границам фигуры, показ 1:1 на холсте.
  art('heroine_menu', 114, 209, { density: HD, origin: FEET }),

  // Враги
  chara('catgirl', '#d9a441'),
  chara('foxgirl', '#e3803a'),
  chara('succubus', '#b33a6b'),
  chara('slime', '#5ac46a', 'blob'),
  chara('ghost', '#cfd8ff', 'flyer'),
  chara('bunnygirl', '#f0f0f0'),
  chara('harpy', '#a07850', 'flyer'),
  chara('lamia', '#2f7a4a', 'blob'),


  // Боссы и банши-жница овертайма (в листах death): кадр 256, ×1, ростом с босса.
  boss('kitsune_empress', '#f08a3a', 'humanoid', { dx: -1, width: 48 }),
  boss('harpy_queen', '#8a6040', 'flyer', { dx: 0, width: 36 }),
  boss('reaper', '#9fd8ff', 'flyer', { dx: 1, width: 36 }),
  boss('dryad_queen', '#3f8a4a', 'humanoid', { dx: -2, width: 52 }),

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
  // Новые оружия (docs/META.md 1.4): пока заглушки tools/placeholders.mjs. Молот рисуется взмахом proj_blade_arc.
  art('proj_spear', 48, 16, { density: HD, color: '#c8c8d8' }),
  art('proj_bolt', 36, 12, { density: HD, color: '#a08060' }),
  art('proj_mine', 28, 28, { density: HD, layer: 'ground', color: '#606870', shape: 'round' }),
  art('proj_frost', 44, 44, { density: HD, color: '#a0e0ff', shape: 'round' }),
  art('proj_poison_cloud', 128, 128, { density: HD, layer: 'ground', color: '#9be04a', shape: 'round' }),
  art('proj_beam', 28, 12, { density: HD, color: '#ffe0ff' }),
  art('proj_wisp', 28, 28, { density: HD, color: '#9ff0ff', shape: 'round' }),
  art('proj_wisp_shot', 16, 16, { density: HD, color: '#d0ffff', shape: 'round' }),
  art('proj_meteor', 56, 56, { density: HD, color: '#e06030', shape: 'round' }),

  // Иконки оружия, пассивок и карточки лечения
  icon('icon_blade_arc', '#d8d8e8'),
  icon('icon_throwing_daggers', '#b8b8c8'),
  icon('icon_guardian_shields', '#7aa6d8'),
  icon('icon_holy_ground', '#fbe3a0'),
  icon('icon_war_axe', '#8a8a9a'),
  icon('icon_storm_chain', '#bcdcf2'),
  icon('icon_firebomb', '#f2904a'),
  icon('icon_spear', '#c8c8d8'),
  icon('icon_hammer', '#a08060'),
  icon('icon_crossbow', '#8a6a4a'),
  icon('icon_mines', '#606870'),
  icon('icon_frost_orb', '#a0e0ff'),
  icon('icon_poison_cloud', '#9be04a'),
  icon('icon_beam', '#ffe0ff'),
  icon('icon_wisp', '#9ff0ff'),
  icon('icon_meteor', '#e06030'),
  icon('icon_max_hp', '#b8433a'),
  icon('icon_attack', '#e0603a'),
  icon('icon_speed', '#86b85a'),
  icon('icon_crit', '#f7c06a'),
  icon('icon_pickup', '#b08ad0'),
  icon('icon_haste', '#7aa6d8'),
  icon('icon_luck', '#bfe07a'),
  icon('icon_armor', '#8a5a3a'),
  icon('icon_regen', '#d86a9a'),
  // Новые пассивки (docs/META.md 1.4): пока заглушки tools/placeholders.mjs
  icon('icon_magic', '#6a8ae0'),
  icon('icon_crit_dmg', '#e08a3a'),
  icon('icon_area', '#5ac0a0'),
  icon('icon_duration', '#c0a05a'),
  icon('icon_xp_gain', '#5ad0e0'),
  icon('icon_dodge', '#a0d0f0'),
  icon('icon_thorns', '#6a9a4a'),
  icon('icon_heal', '#f6c7c3'),
  // Эволюции: лист assets/raw/icons_evo.png (sheets.json icons_evo)
  icon('icon_crimson_arc', '#c0a0e0'),
  icon('icon_thousand_edge', '#c0a0e0'),
  icon('icon_aegis_bastion', '#c0a0e0'),
  icon('icon_soul_garden', '#c0a0e0'),
  icon('icon_death_spiral', '#c0a0e0'),
  icon('icon_thunder_loop', '#c0a0e0'),
  icon('icon_napalm_rain', '#c0a0e0'),
  icon('icon_dragon_lance', '#c0a0e0'),
  icon('icon_titan_maul', '#c0a0e0'),
  icon('icon_ballista', '#c0a0e0'),
  icon('icon_minefield', '#c0a0e0'),
  icon('icon_blizzard', '#c0a0e0'),
  icon('icon_miasma', '#c0a0e0'),
  icon('icon_prism_ray', '#c0a0e0'),
  icon('icon_spirit_choir', '#c0a0e0'),
  icon('icon_starfall', '#c0a0e0'),

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
