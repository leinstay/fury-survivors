// Пассивки. Строки интерфейса: passive.<id>.name / passive.<id>.desc.
// Формат записи:
// id: {
//   icon: 'icon_<id>',          // ключ иконки 24×24 в manifest.js
//   stat: 'maxHp',               // какой стат меняет (список и вид сложения: src/data/stats.js)
//   levels: [0.1, 0.2, ...],     // суммарный бонус на уровне 1..N (maxLevel = levels.length)
//   minLevel: 8,                 // необязательно: карточка не предлагается до этого уровня команды
// }
// Все пассивки — increased: у процентного стата значение идёт в общую сумму (база × (1 + Σ)),
// у плоского прибавляется к базе (core/stats.js). Каждая пассивка — пара своему оружию для эволюции (combos.js).
// Защита (max_hp, armor, regen, dodge): каждый уровень ≈ +1 удар, который герой переживает за 3 минуты на 10:00
// при человеческой частоте ударов (tools/simulation/defense.mjs, docs/BALANCE_AUDIT.md 12). Броня и уклонение
// выпуклые (удар − броня, × (1 − уклон)), поэтому их шаги убывают; вместе защита множится, а не складывается.
// attack/magic +15% за уровень (было +10%): полоса между glass cannon и средним билдом шире — glass к 10:00+
// убивает моба за 1–2 с с первого попадания, средний держит 3–5 с на экране (docs/BALANCE_AUDIT.md 12).
// Ориентир VS: Spinach +10% урона за уровень, Armor +1, Hollow Heart +20% HP, Pummarola +0.2 HP/с, Empty Tome −8% кулдауна.
export const PASSIVES = {
  max_hp:   { icon: 'icon_max_hp', stat: 'maxHp', levels: [0.20, 0.40, 0.60, 0.80, 1.00] },
  attack:    { icon: 'icon_attack', stat: 'attack', levels: [0.15, 0.30, 0.45, 0.60, 0.75] },
  magic:    { icon: 'icon_magic', stat: 'magic', levels: [0.15, 0.30, 0.45, 0.60, 0.75] },
  speed:    { icon: 'icon_speed', stat: 'speed', levels: [0.08, 0.16, 0.24, 0.32, 0.40] },
  crit:     { icon: 'icon_crit', stat: 'crit', levels: [0.05, 0.10, 0.15, 0.20, 0.25] },
  crit_dmg: { icon: 'icon_crit_dmg', stat: 'critDmg', levels: [0.20, 0.40, 0.60, 0.80, 1.00], minLevel: 8 },
  area:     { icon: 'icon_area', stat: 'area', levels: [0.08, 0.16, 0.24, 0.32, 0.40] },
  duration: { icon: 'icon_duration', stat: 'duration', levels: [0.10, 0.20, 0.30, 0.40, 0.50] },
  pickup:   { icon: 'icon_pickup', stat: 'pickup', levels: [0.25, 0.50, 0.75, 1.00, 1.25] },
  haste:    { icon: 'icon_haste', stat: 'haste', levels: [0.08, 0.16, 0.24, 0.32, 0.40] },
  luck:     { icon: 'icon_luck', stat: 'luck', levels: [0.10, 0.20, 0.30, 0.40, 0.50] }, // × шансы дропа и × шанс крита
  armor:    { icon: 'icon_armor', stat: 'armor', levels: [2.5, 4.5, 6.5, 8, 9] },
  regen:    { icon: 'icon_regen', stat: 'regen', levels: [0.12, 0.24, 0.36, 0.48, 0.60] },
  xp_gain:  { icon: 'icon_xp_gain', stat: 'xpGain', levels: [0.08, 0.16, 0.24, 0.32, 0.40], minLevel: 5 },
  dodge:    { icon: 'icon_dodge', stat: 'dodge', levels: [0.12, 0.21, 0.29, 0.35, 0.40] },
  thorns:   { icon: 'icon_thorns', stat: 'thorns', levels: [6, 12, 18, 24, 30], minLevel: 8 },
};
