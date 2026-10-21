// Пассивки. Строки интерфейса: passive.<id>.name / passive.<id>.desc.
// Формат записи:
// id: {
//   icon: 'icon_<id>',          // ключ иконки 24×24 в manifest.js
//   stat: 'maxHp',               // какой стат меняет (см. stats в heroes.js)
//   mode: 'add' | 'mul',         // add: стат += значение; mul: стат *= (1 + значение)
//   levels: [0.1, 0.2, ...],     // суммарный бонус на уровне 1..N (maxLevel = levels.length)
// }
// Сначала применяются все add, затем все mul.
export const PASSIVES = {
  max_hp:  { icon: 'icon_max_hp', stat: 'maxHp',  mode: 'mul', levels: [0.10, 0.20, 0.30, 0.40, 0.50] },
  attack:  { icon: 'icon_attack', stat: 'atk',    mode: 'mul', levels: [0.10, 0.20, 0.30, 0.40, 0.50] },
  speed:   { icon: 'icon_speed', stat: 'speed',  mode: 'mul', levels: [0.08, 0.16, 0.24, 0.32, 0.40] },
  crit:    { icon: 'icon_crit', stat: 'crit',   mode: 'add', levels: [0.05, 0.10, 0.15, 0.20, 0.25] },
  pickup:  { icon: 'icon_pickup', stat: 'pickup', mode: 'mul', levels: [0.25, 0.50, 0.75, 1.00, 1.25] },
  haste:   { icon: 'icon_haste', stat: 'haste',  mode: 'mul', levels: [0.08, 0.16, 0.24, 0.32, 0.40] },
  luck:    { icon: 'icon_luck', stat: 'luck',   mode: 'mul', levels: [0.10, 0.20, 0.30, 0.40, 0.50] },
  armor:   { icon: 'icon_armor', stat: 'armor',  mode: 'add', levels: [1, 2, 3, 4, 5] },
  regen:   { icon: 'icon_regen', stat: 'regen',  mode: 'add', levels: [0.2, 0.4, 0.6, 0.8, 1.0] },
};
