// Эволюции (как в VS): оружие на maxLevel + своя пассивка любого уровня, 1 к 1 (docs/META.md 1.4).
// Формат записи: { from: ['weapon', 'passive'], result: 'weapon_evolved' }
// Выпадает из сундука элиты или босса. Результат описан в weapons.js с флагом evolved: true;
// он занимает слот оружия, пассивка остаётся.
export const COMBOS = [
  { from: ['blade_arc', 'steel'], result: 'crimson_arc' },
  { from: ['throwing_daggers', 'haste'], result: 'thousand_edge' },
  { from: ['guardian_shields', 'armor'], result: 'aegis_bastion' },
  { from: ['holy_ground', 'regen'], result: 'soul_garden' },
  { from: ['war_axe', 'crit'], result: 'death_spiral' },
  { from: ['storm_chain', 'luck'], result: 'thunder_loop' },
  { from: ['firebomb', 'pickup'], result: 'napalm_rain' },
];
