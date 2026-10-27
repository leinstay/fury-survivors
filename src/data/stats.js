// Статы героя: список, вид сложения и капы (docs/META.md 1.5). Считает src/core/stats.js.
// Сложение как increased/more в PoE:
//   percent: база × (1 + Σ increased) × Π more   (множители, база героя обычно 1)
//   flat:    (база + Σ плоских) × Π more         (доли шанса и снижения, HP/с, урон)
// Все пассивки и аффиксы шмота — increased (у flat-статов их значение просто прибавляется), more только у уникалок.
// critDmg плоский: «+X% урона крита» сверх COMBAT.critMul, база героя 0 (процентный от нуля не рос бы).
export const STATS = {
  maxHp: 'percent',
  attack: 'percent',    // × урон оружия со стальным уроном (dmgType 'attack', weapons.js)
  magic: 'percent',    // × урон оружия с магическим уроном (dmgType 'magic')
  speed: 'percent',    // px/с
  crit: 'flat',        // доля шанса крита; итоговый шанс = crit × luck, затем кап
  critDmg: 'flat',     // множитель крита = COMBAT.critMul + critDmg
  area: 'percent',     // × поле area уровня оружия
  duration: 'percent', // × поле duration уровня оружия
  pickup: 'percent',   // × PLAYER.pickupRadius
  haste: 'percent',    // кулдаун оружия делится на haste
  luck: 'percent',     // × шанс крита и шансы дропа
  resistance: 'flat',  // доля снижения каждого удара по герою (контакт, снаряды, удары по земле), сумма всех
                       // источников, затем кап; урон не ниже COMBAT.minDamage
  regen: 'flat',       // HP/с
  xpGain: 'percent',   // × опыт с подобранных кристаллов
  dodge: 'flat',       // доля шанса не получить удар (контакт и снаряды)
  thorns: 'flat',      // доля максимума HP каждого врага (не босса) на экране при получении удара,
                       // не чаще COMBAT.thornsCooldown
};

// Жёсткие капы итогового значения. haste: кулдаун не ниже ×0.35, то есть haste ≤ 1 / 0.35.
// crit — кап итогового шанса (crit × luck), а не самого стата.
export const STAT_CAPS = {
  crit: 0.75,
  dodge: 0.60,
  // 0.65: удар × 0.35, с капом уклонения 0.60 ожидаемый урон ≥ 14% (живучесть ×7). Шаги пассивки как у
  // уклонения (каждый уровень ≈ +1 удар на 10:00, tools/simulation/defense.mjs), поэтому кап тоже рядом с ним:
  // 0.75 вместе с уклонением дал бы ×10 и бессмертный танк, 0.6 срезал бы turtle и защитную сумку T3+ без упора.
  resistance: 0.65,
  critDmg: 3,          // +300% сверх базы: итоговый множитель крита ≤ COMBAT.critMul + 3
  area: 2.5,
  duration: 2.5,
  haste: 1 / 0.35,
  pickup: 3,
  xpGain: 2,
  luck: 2,
  regen: 5,
  // шипы: 0.3 — обычный моб падает с 4 срабатываний (раз в 0.5 с), элита (×8 HP) тоже; выше — экран чистится
  // от одного касания, и шипы заменяют оружие
  thorns: 0.3,
};

// Капы от базы героя: стат ≤ база × множитель.
export const STAT_CAPS_REL = {
  speed: 1.8,
};
