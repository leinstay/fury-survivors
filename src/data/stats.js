// Статы героя: список, вид сложения и капы (docs/META.md 1.5). Считает src/core/stats.js.
// Сложение как increased/more в PoE:
//   percent: база × (1 + Σ increased) × Π more   (множители, база героя обычно 1)
//   flat:    (база + Σ плоских) × Π more         (доли шанса, HP/с, урон, броня)
// Все пассивки и аффиксы шмота — increased (у flat-статов их значение просто прибавляется), more только у уникалок.
// critDmg плоский: «+X% урона крита» сверх COMBAT.critMul, база героя 0 (процентный от нуля не рос бы).
export const STATS = {
  maxHp: 'percent',
  steel: 'percent',    // × урон оружия со стальным уроном (dmgType 'steel', weapons.js)
  magic: 'percent',    // × урон оружия с магическим уроном (dmgType 'magic')
  speed: 'percent',    // px/с
  crit: 'flat',        // доля шанса крита; итоговый шанс = crit × luck, затем кап
  critDmg: 'flat',     // множитель крита = COMBAT.critMul + critDmg
  area: 'percent',     // × поле area уровня оружия
  duration: 'percent', // × поле duration уровня оружия
  pickup: 'percent',   // × PLAYER.pickupRadius
  haste: 'percent',    // кулдаун оружия делится на haste
  luck: 'percent',     // × шанс крита и шансы дропа
  armor: 'flat',       // минус к каждому удару по герою (не ниже COMBAT.armorMinDamage)
  regen: 'flat',       // HP/с
  xpGain: 'percent',   // × опыт с подобранных кристаллов
  dodge: 'flat',       // доля шанса не получить удар (контакт и снаряды)
  thorns: 'flat',      // урон по всем врагам на экране при получении удара (× steel), COMBAT.thornsCooldown
};

// Жёсткие капы итогового значения. haste: кулдаун не ниже ×0.35, то есть haste ≤ 1 / 0.35.
// crit — кап итогового шанса (crit × luck), а не самого стата.
export const STAT_CAPS = {
  crit: 0.75,
  dodge: 0.60,
  critDmg: 3,          // +300% сверх базы: итоговый множитель крита ≤ COMBAT.critMul + 3
  area: 2.5,
  duration: 2.5,
  haste: 1 / 0.35,
  pickup: 3,
  xpGain: 2,
  luck: 2,
  regen: 5,
};

// Капы от базы героя: стат ≤ база × множитель.
export const STAT_CAPS_REL = {
  speed: 1.8,
};
