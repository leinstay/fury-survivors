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
//
// Кадры персонажей: 0 стойка, 1 шаг А, 2 шаг Б. Смотрят в три четверти вправо, влево flipX.

const FEET_64 = 60 / 64;   // ноги на 60-й строке кадра 64×64
const FEET_128 = 122 / 128;

function char(key, size, color, shape = 'humanoid', frame = 64) {
  const feet = frame === 128 ? FEET_128 : FEET_64;
  return [key, { file: `assets/sprites/${key}.png`, frameWidth: frame, frameHeight: frame, frames: 3, origin: [0.5, feet], size, color, shape }];
}

function item(key, w, h, color, shape = 'round', frames = 1, origin = [0.5, 0.5]) {
  return [key, { file: `assets/sprites/${key}.png`, frameWidth: w, frameHeight: h, frames, origin, size: [w - 4, h - 4], color, shape }];
}

export const SPRITES = Object.fromEntries([
  // Герои и портрет
  char('heroine', [22, 48], '#e0603a'),
  item('heroine_portrait', 48, 48, '#e0603a', 'rect'),

  // Враги
  char('bat', [16, 12], '#6b4a8a', 'flyer'),
  char('slime', [32, 26], '#5ac46a', 'blob'),
  char('catgirl', [22, 48], '#d9a441'),
  char('ghost', [24, 32], '#cfd8ff', 'flyer'),
  char('foxgirl', [22, 48], '#e3803a'),
  char('succubus', [22, 48], '#b33a6b'),

  // Босс
  char('dryad_queen', [72, 96], '#3f8a4a', 'humanoid', 128),

  // Предметы
  item('xp_small', 8, 8, '#4fc3ff'),
  item('xp_medium', 12, 12, '#5aff8a'),
  item('xp_large', 16, 16, '#ff5a5a'),
  item('food', 16, 16, '#ffb070'),
  item('magnet', 16, 16, '#c0c0c0'),
  item('coin', 12, 12, '#ffd84a'),
  item('chest', 24, 20, '#a0602a', 'rect', 1, [0.5, 1]),

  // Снаряды и эффекты оружия
  item('proj_blade_arc', 64, 32, '#ffffff', 'rect'),
  item('proj_dagger', 16, 8, '#dddddd', 'rect'),
  item('proj_shield', 16, 16, '#7ab0ff'),
  item('proj_holy_ground', 64, 64, '#fff3a0'),
  item('proj_axe', 20, 20, '#b0b0b0', 'rect'),
  item('proj_chain', 16, 16, '#9ad0ff'),
  item('proj_firebomb', 16, 16, '#ff7030'),
  item('proj_enemy', 8, 8, '#ff40a0'),

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

  // Окружение
  item('grass', 32, 32, '#2f5a2a', 'tile', 4, [0, 0]),
  item('tree', 48, 64, '#1f4a22', 'round', 1, [0.5, 1]),
  item('rock', 24, 16, '#6a6a6a', 'round', 1, [0.5, 1]),
  item('bush', 24, 16, '#2a6a30', 'round', 1, [0.5, 1]),
  item('flower', 8, 8, '#ffe070', 'round', 2, [0.5, 1]),
  item('barrel', 16, 20, '#8a5a2a', 'rect', 1, [0.5, 1]),
  item('lantern', 12, 24, '#e0c050', 'rect', 1, [0.5, 1]),
]);
