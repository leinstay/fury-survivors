// Супероружие.
// Формат записи: { from: ['weapon_a', 'weapon_b' | 'passive'], result: 'weapon_evolved' }
// Коллаб (как в HoloCure): оба оружия на maxLevel. Эволюция (как в VS): оружие на maxLevel + пассивка любого уровня.
// Выпадает из сундука элиты или босса. Результат описан в weapons.js с флагом evolved: true;
// он занимает слот первого оружия, второе оружие убирается, пассивка остаётся.
export const COMBOS = [
  { from: ['blade_arc', 'guardian_shields'], result: 'aegis_storm' },
  { from: ['throwing_daggers', 'storm_chain'], result: 'thunder_knives' },
  { from: ['blade_arc', 'throwing_daggers'], result: 'phantom_blades' },
  { from: ['blade_arc', 'holy_ground'], result: 'sacred_edge' },
  { from: ['blade_arc', 'war_axe'], result: 'reaper_crescent' },
  { from: ['blade_arc', 'storm_chain'], result: 'storm_edge' },
  { from: ['blade_arc', 'firebomb'], result: 'inferno_slash' },
  { from: ['throwing_daggers', 'guardian_shields'], result: 'knife_carousel' },
  { from: ['throwing_daggers', 'holy_ground'], result: 'holy_rain' },
  { from: ['throwing_daggers', 'war_axe'], result: 'gale_cutters' },
  { from: ['throwing_daggers', 'firebomb'], result: 'ember_knives' },
  { from: ['guardian_shields', 'holy_ground'], result: 'sanctuary' },
  { from: ['guardian_shields', 'war_axe'], result: 'bulwark_spin' },
  { from: ['guardian_shields', 'storm_chain'], result: 'tesla_ward' },
  { from: ['guardian_shields', 'firebomb'], result: 'comet_ring' },
  { from: ['holy_ground', 'war_axe'], result: 'judgement_wheel' },
  { from: ['holy_ground', 'storm_chain'], result: 'divine_storm' },
  { from: ['holy_ground', 'firebomb'], result: 'hellfire' },
  { from: ['war_axe', 'storm_chain'], result: 'thunder_axe' },
  { from: ['war_axe', 'firebomb'], result: 'blast_axe' },
  { from: ['storm_chain', 'firebomb'], result: 'plasma_storm' },
  { from: ['blade_arc', 'attack'], result: 'crimson_arc' },
  { from: ['throwing_daggers', 'haste'], result: 'thousand_edge' },
  { from: ['guardian_shields', 'armor'], result: 'aegis_bastion' },
  { from: ['holy_ground', 'regen'], result: 'soul_garden' },
  { from: ['war_axe', 'crit'], result: 'death_spiral' },
  { from: ['storm_chain', 'luck'], result: 'thunder_loop' },
  { from: ['firebomb', 'pickup'], result: 'napalm_rain' },
];
