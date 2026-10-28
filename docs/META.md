# Meta progression, rebalance, achievements: decisions

Conclusions from discussion 27.10.2026. Source of truth for implementation. Numbers here are starting values, tuned by bots
(`tools/simulation`), final values live in `src/data/`. All new graphics are placeholders for now (`tools/placeholders.mjs`).

## 1. Run rebalancing

### 1.1 Goals
Failure is not death but inability to kill: the hero frame fills with enemies. Players take 1–3 hits per minute (`docs/BALANCE_AUDIT.md`, 12), so offense and defense are balanced separately.

**Clear** (immortal bots testing builds, `tools/simulation/targets.mjs`): per minute, track how long a regular mob lives from entering the **hero frame** until death and how many enemies fill the frame. The frame `CLEAR` in `src/data/constants.js` is 400 × 240 world pixels around the hero (about 64% of screen width, 2/3 of height). Measured from hero entry, not spawn or screen edge: ranged weapons hit mobs beyond the edge, and the metric would stick to that (`docs/BALANCE_AUDIT.md`, 13).

| build | goal |
|---|---|
| medium (mid) | from 8:00 onward, a mob in the frame lives 3–5 s; earlier no less than 2 s (27.10 decision: early in the run, time in frame is mostly approach time to the hero); average enemies in frame ≤ ~45 (≈ 120 on screen), world not at limit |
| glass cannon (all damage focus) | from 10:00 onward, a mob dies in 1–2 s from first hit, but not in one strike (≥ 2 hits average) |
| defensive (4 defense passives) | clears worse but doesn't fail until the 2nd boss (10:00) |
| minute failure | mob in frame lives > 8 s, or > 60 enemies in frame (≈ 150 on screen), or frame crowd grows (×1.5 per minute when ≥ 30 and life > 5 s), or world at limit > 25% of minute; run failure is 2 such minutes in a row |

Results of 27.10 tuning (`docs/BALANCE_AUDIT.md` 13.10): glass on target, tank doesn't fail until 10:00, mid is late at 2.6–3.3 s in frame, early ~2 s (from 8:00 is the 27.10 decision goal). Exactly 8 skill chests in 15 minutes (elites on timer).

**Weapon ladder and tags** (`ladder.mjs`, `dps.mjs`): the main goal is clearing crowds for all weapons, f(R) × Q × the tag multiplier for `targets` (`weapons.js`: aoe 1, cleave 0.9, single 0.7). Single weapons must also clear packs, through frequency and piercing rather than damage per hit. Against a single target (a dummy boss) there is only a ceiling: single no more than ~1.5–2× aoe, no one-shot on boss; TTK for bosses is not a design goal (bosses are not a threat now), only a sanity check. `bloom` ('early' | 'late'): a weapon is strong early or late. That is fine, and it is compared within its own time window (`ladder.mjs --bloom`).

Bosses: kill time (TTK) is reported; HP per level is set by the owner (Kitsune 250, Harpy 500, Dryad 1000, Reaper 750).

**Weapon ladder** (`tools/simulation/ladder.mjs`): the farther a weapon shoots (between weapons, not across levels), the weaker it is; Blade Arc is strongest. Quirks (knockback at distance, slowdown, piercing, DoT, homing, blocking, circle strike) are even weaker. Power = f(R) × Q, f(R) = 1 / (1 + 0.6 · ln(R / R sword)), Q = 1 / (1 + Σ q quirks). Mines almost one-shot a regular mob in their minute (the cost of a random location).

**Defense on paper** (`tools/simulation/defense.mjs`): each level of a defense passive (max_hp, resistance, regen, dodge) adds approximately 1 hit that the hero survives over 3 minutes at 10:00 with human hit frequency; a large defense item T2 (2×3) is approximately 1 passive level. The gradient from glass cannon to defense is the number of defense levels (0 → 20).

Duo has the same targets as solo (the number in the frame is the average across heroes). Cursed is harder (more enemies in the frame), but the average build does not fail until 10:00.
Items bridge the way to the 3rd boss, and the Bible to the Reaper.

### 1.2 XP
- Leveling is twice as slow: level cost is `xpForLevel × XP.costMul` (2).
- Compensation for the 5–8 minute window (`docs/BALANCE_AUDIT.md`, C4): base hero regen 0.25 HP/s.
- `maxLevel` for all weapons is 5 (same as passives). Level tables shrink from 7 to 5 (levels 1, 2, 4, 6, 7).

### 1.3 Cards
- Alternating: each player has a pick counter `k`. Even `k` offers weapon cards (new or upgrade), odd offers passives. If a pool is empty, switch types. Reroll and banish replacement keep the type. In co-op with shared level and turn order, cards go A-weapon, B-weapon, A-passive, B-passive.
- Gating: passives have a `minLevel` field (team level). Cards don't appear until that level. The Codex shows "Unlocks at level N" on passive cards.

### 1.4 Pool: evolutions only
- Collaborations (weapon + weapon) removed entirely, along with the `combo` behavior.
- Evolution = weapon at `maxLevel` + its own passive at any level, one-to-one. 16 weapons, 16 passives, 16 evolutions.
- Evolutions don't appear on level-up cards (`buildPool` skips `evolved`): only skill chests provide them.
- Two chest types (color in `CHEST_LOOK` in `src/data/pickups.js`): **skill chest** (from elites, on ground) and
  **loot chest** (from bosses, see 2.1; own color, one style for all tiers).
- Skill chest, three cases (`_openChest` in `src/core/sim.js`):
  1. Collector has ready evolutions (weapon at max + its passive): choice screen like before, up to `CHEST.maxChoices` random, Continue or Skip evolution (skip goes to case 2).
     Co-op: picker chooses, both see the pick (state `reveal`, `CHEST.revealTime`).
  2. Otherwise, up to two upgrades automatic (`skillChest`): +1 level to a random own passive and +1 level to a random own weapon (not new). Shows: animation, cards like "Attack Lv 2 → 3", Ok; world waits.
     Co-op: each rolls once, screen closes when both press Ok (command `chestOk`).
  3. Nothing to take: healing (like a level-up heal card, `LEVEL_UP.healFraction`) with no screen.
- Weapon damage type: `dmgType: 'attack' | 'magic'`.
- Status on weapons (`status: { type, chance }`, `src/data/status.js`): poison (stacks, 30% hit per 3 s) on poison_cloud, miasma; burning (strongest, 40% per 2 s) on firebomb 0.3, meteor 0.5, napalm_rain 0.4, starfall 0.5; bleeding (strongest, 30% per 3 s, melee only) on blade_arc and hammer 0.25, titan_maul 0.3, crimson_arc 0.4 (share 0.4); chill is slowdown without damage. Ticks don't crit, are credited to their weapon, no separate DoT damage stat.

| weapon | type | behavior | evolution passive | evolution | targets (weapon / evolution) | bloom |
|---|---|---|---|---|---|---|
| blade_arc | attack | new `slash` (stroke through the densest nearby group, like Victory Sword; length, width, speed, and amount grow at L3/L5) | attack | crimson_arc | cleave / cleave | — |
| throwing_daggers | attack | projectile | haste | thousand_edge | cleave / cleave | early |
| guardian_shields | attack | orbit | resistance | aegis_bastion | aoe / aoe | — |
| war_axe | attack | boomerang | crit | death_spiral | cleave / cleave | — |
| spear | attack | new `impale` (one spear to the nearest, pierces N, pins; evolution explodes) | crit_dmg | — new | single / single | early |
| hammer | attack | new `slam` (ground strike in a circle, large knockback, cracks slow; evolution as a series forward) | max_hp | — new | aoe / aoe | — |
| crossbow | attack | projectile (single bolt, high damage) | dodge | — new | single / single | — |
| mines | attack | area_drop (lie until touched) | duration | — new | aoe / aoe | late |
| holy_ground | magic | aura | regen | soul_garden | aoe / aoe | early |
| storm_chain | magic | chain | luck | thunder_loop | cleave / cleave | early |
| firebomb | magic | area_drop | pickup | napalm_rain | aoe / aoe | — |
| frost_orb | magic | new `ice_orb` (large slow ball, pierces all, chills; evolution in a spiral) | area | — new | aoe / aoe | — |
| poison_cloud | magic | new `cloud` (cloud at hero's location, amount of clouds with their own cooldown, poison) | magic | miasma | aoe / aoe | — |
| beam | magic | new `beam` (snake in a random direction, bounces at 90° with loss of damage and length, `bounces` up to 4) | speed | prism_ray | cleave / cleave | late |
| wisp | magic | new `summon` (flies behind the hero, shoots on its own) | xp_gain | — new | single / single | early |
| meteor | magic | area_drop (long wind-up, high damage) | thorns | — new | aoe / aoe | — |

### 1.5 Stats
Hero stats: `maxHp, attack, magic, speed, crit, critDmg, area, duration, pickup, haste, luck, resistance, regen, xpGain, dodge, thorns`. No more general `atk`. `amount` doesn't exist in stats or items (it stays in weapon levels).

Combining (like PoE's increased/more):
```
percent stat = base × (1 + Σ increased) × Π more
flat stat    = base + Σ flat
```
- All passives and all item affixes are increased (one sum per stat). `more` only on uniques.
- Percent: maxHp, attack, magic, speed, critDmg, area, duration, pickup, haste, luck, xpGain.
- Flat: crit, dodge (chance fractions), resistance (damage reduction fraction), regen (HP/s), thorns (enemy max HP fraction).
- Crit chance = crit × luck, then cap.

Caps (`src/data/stats.js`), hard, no formulas:
| stat | cap |
|---|---|
| crit | 0.75 |
| dodge | 0.60 |
| critDmg | +300% above base (final crit multiplier ≤ 5) |
| area | ×2.5 |
| duration | ×2.5 |
| haste | cooldown no less than ×0.35 |
| speed | ×1.8 of hero base |
| pickup | ×3 |
| xpGain | ×2 |
| luck | ×2 |
| regen | 5 HP/s |
| resistance | 0.65 (hit × 0.35, minimum 1) |
| thorns | 0.30 of enemy max HP |

The stats panel (pause and inventory) shows total and "(max)" when capped, with overflow shown.

Defense stats **multiply** together (27.10.2026 decision): resistance as percentage with cap × HP × (1 − dodge) plus regen, like PoE (armor, evasion, life multiply), Brotato (armor x / (x + k) × HP), and VS (flat armor × HP). Linearity per stat alone: each defense passive level ≈ +1 hit survived per 3 minutes at 10:00 (`tools/simulation/defense.mjs`). Combined they don't linearize: four passives at L5 give ~2× the sum individually (`docs/BALANCE_AUDIT.md` 13.4). No pooled 1 / (1 + T) formula.

New mechanics:
- **attack / magic**: weapon damage × stat of its type.
- **area / duration**: multiply the `area` and `duration` from weapon level.
- **critDmg**: crit multiplier = `COMBAT.critMul + critDmg`.
- **xpGain**: × XP from crystals (for picker, XP is shared).
- **dodge**: chance to avoid a hit (contact and projectiles), triggers `dodge` event.
- **resistance**: percent reduction on any hit to hero (contact, projectiles, ground strikes), sum from all sources (passive, bag, achievements, hero base 10%), capped 0.65; damage never below `COMBAT.minDamage` (1). Was armor (flat reduction), saves convert (`LEGACY_AFFIX_STATS`).
- **thorns**: on taking damage from enemy, all on-screen enemies except bosses lose `thorns` × their max HP (no crit or multipliers), internal cooldown 0.5 s (`COMBAT.thornsCooldown`). Flat damage couldn't keep pace with enemy HP growth; old affixes rescaled (`LEGACY_AFFIX_SCALE`, inventory v2).

## 2. Items

### 2.1 Loop
- Each killed boss drops a **3-item chest** of its tier: Kitsune T1, Harpy T2, Dryad T3, Reaper T4.
- Every boss (final and Reaper) drops a loot chest (`loot_chest`, own color) where it fell. Carry it through enemies: loot drops on pickup, die first and the chest vanishes. On pickup and immediately after (if skill chest or cards close first), all open the loot chest: animation, then screen with own 3 items per player, solo and co-op. Per item: "Take" (to stash) or "Dismantle (+n)" (crystals now at 2.9 rate, counts toward recycler achievement); plus "Take all" and "Dismantle all". Esc doesn't close. World waits while all decide (3 bosses = 9 items). On 3rd and 4th chests (final boss, Reaper; `BOSS_END_RUN`), next to Done is "End run": run ends in victory. Don't press it: run continues (death after final boss also counts as victory).
- Co-op: sim state `loot` for both, item choices outside sim (own stash), lockstep sends only "finished" (`lootDone`); world moves when both finish. Hash doesn't diverge.
- No loot screen after run. Undecided items (death during kill frame, co-op disconnect) auto-take to stash (full: by rule 2.2, all locked: dismantle).
- Generated in sim from its RNG (deterministic, co-op safe), stash itself is outside sim.
- Equipment changes only in menu. In pause, "Inventory" tab is view-only (bag + stats).
- One leaderboard, as now, items not shown.

### 2.2 Stash
- 100 items; equipped items in the bag do not count toward the limit.
- Lock on an item.
- If the stash is full, the "Take" button shows in advance what will disappear: a random unlocked item of the lowest rarity available. The removed item automatically dismantles into crystals.

### 2.3 Bag
- A 9×6 grid is always visible; locked cells are dimmed. Starting size is 7×4; achievements unlock columns and rows.
- 90-degree rotation. Three preset layouts.
- Unique: no more than one in the bag.
- Diversity bonus: +3% to all affixes for each different item type in the bag beyond the first (one type grants nothing).

### 2.4 Types and shapes
| type | shapes | required affix (one of) |
|---|---|---|
| ring | 1×1 | crit, luck |
| amulet | 1×1 | pickup, luck, xpGain |
| charm | 1×1, 1×2 | any |
| belt | 2×1 | regen, maxHp |
| gloves | 2×2 | haste, attack, magic |
| boots | 2×2 | speed, dodge |
| helm | 2×2 | resistance, maxHp |
| shield | 2×2, 2×3 | resistance, thorns |
| armor | 2×3 | maxHp, resistance |
| weapon | 1×3, 2×3, 1×4, 2×4 | attack, magic |
| relic | 3×3 | uniques only |

### 2.5 Power
- Shape budget is `cells^1.25`: 1×1 = 1.0, 2×2 = 5.66, 2×3 = 9.39, 2×4 = 13.45, 3×3 = 15.59.
- Affix value is `base[stat] × budget × tier × enchant`, with tiers T1 = 1.0, T2 = 1.3, T3 = 1.7, T4 = 2.2; enchantment adds 5% per level.
- Rolling: the required affix is always positive `[max/2 … max]`; other affixes are `[−max/2 … +max]`, negative with 1/3 chance (half as often as positive), evenly distributed within each half.
- In the description, each affix shows its range: `Steel +3.2% [−2.5 … +5.0]`.
- Reference: a full T2 bag (45 cells) is roughly equivalent to 2–3 leveled passives, spread across different stats.

### 2.6 Rarity and tables (weights)
| rarity | affixes |
|---|---|
| common | 2 |
| rare | 3 |
| epic | 4 |

| chest | common | rare | epic | unique | scroll |
|---|---|---|---|---|---|
| T1 | 70 | 25 | 5 | 0 | 0 |
| T2 | 50 | 35 | 13 | 2 | 0 |
| T3 | 30 | 40 | 24 | 4 | 2 |
| T4 | 0 | 0 | 70 | 20 | 10 |

Type weight favors smaller items, affix weight favors common stats. An affix does not repeat on an item; the required affix appears first.

### 2.7 Names
`[prefix] [base] [suffix]` like in PoE: prefix from the first optional affix, base from item type and shape, suffix from the second. Word pools for each stat are in i18n. Uniques have their own names.

### 2.8 Uniques
No affixes, only a skill with an upside and downside that applies to the owner. Fixed shape.
| id | effect |
|---|---|
| bible | Reaper becomes vulnerable (see section 4). "This might come in handy." T3+ only. |
| glass_cannon | ×2 damage; max HP is 1; resistance does not work |
| kaom_heart | ×2 regen, but only while standing still |
| sprinter | damage scales with movement speed; −50% damage when standing still |
| turtle | resistance ×3; speed −40% |
| berserk | +1% damage per 1% missing HP; regen does not work |
| spiked_shell | thorns ×3; damage −30% |
| last_chance | once per run, a fatal hit grants 3 seconds of invulnerability and full HP; afterward, max HP −50% |
| myopia | +60% damage to enemies within 100 px, −40% beyond |
| clock | cooldowns −30%; duration −30% |
| monk | cannot pick up new weapons; passives ×2 and +2 passive slots |
| dice | every minute, a random stat +30%, another −15% |

### 2.9 Crafting (Crafting tab in inventory)
Currencies: **Crystals** (main currency), **Protection Scroll** (drops only), **Chaos Heart**.
- Dismantling: common 1, rare 3, epic 9, unique 20 crystals × tier (T1 ×1, T2 ×2, T3 ×4, T4 ×8).
- Chaos Heart: 1 guaranteed from 2nd and 3rd boss, 30% from 1st, 2 from the Reaper.

Operations (cost in crystals × item tier):
| operation | cost | rules |
|---|---|---|
| reroll all affixes | 6 | new affixes and values; required affix rerolls within its own pool |
| reroll one affix value | 15 | stat stays the same |
| reroll the affix itself | — | not allowed |
| upgrade rarity | 40 + hearts (1 for rare, 3 for epic) | +1 affix; 70% success to rare, 50% to epic; failure breaks (scroll saves) |
| combine | 20 + hearts by result rarity (common 0, rare 1, epic 3) | same type; result rarity is random from one of the two; shape and required affix from one of the two; other affixes random from both, values unchanged; enchantment is the lower of the two |
| enchant +N | 5 × (N+1) | +5% to base; risk-free up to +3, then 70/60/50/40/30/20% (up to +9); failure breaks into crystals (scroll preserves item) |

Uniques cannot be crafted (only dismantled).

## 3. Co-op and data
- Loadout (player's bag) goes to the lobby and into `createSim({ loadouts })`; the sim calculates bonuses itself (determinism).
- Telemetry in `fury_runs`: bag snapshot (type, shape, rarity, tier, enchantment, unique, sum of stat bonuses).

## 4. Reaper
- Death Touch: touch always kills (flag `oneShot`, shown as ∞ damage in the Codex), ignores resistance, dodge, i-frames, and `last_chance`; in co-op, displays as a coffin like a normal death.
- Speed: constant 85 (hero is 100), no acceleration; you can run away and circle the sanctified rings. The threat is not her speed but the time penalty for missed hourglasses (a race against time, like Zarokh, the Temporal in PoE2).
- Without the Bible, she is invulnerable as before.
- With the Bible (any player has it), sanctified rings appear every 20 seconds for 15 seconds; the Reaper takes damage only while standing in a ring. The player pulls her into it.
- Hourglasses (Codex name: "Borrowed time"): fall every 11 seconds at a random point 70–170 px from the player (half screen away, not under the hero, far from her) with a 10-second timer above them.
  - Stepping on it breaks it, and the Reaper is stunned for 2 seconds (she stands still, but touch still kills). You can wait and stun her inside a sanctified ring.
  - Missed: all living players lose 8 speed until the end of overtime (stacks, minimum 40; separate from stat display, the stat panel does not change). One or two misses are not fatal (hero is 92/84 vs. her 85), but five in a row brings hero to 60; she catches up, and speedsters (cats 60, rabbits 63, fox dash) do too.
  - Co-op: each player gets their own hourglasses (up to 4 on ground), a miss penalizes both, breaking any stuns them.
- Phases: at 50% HP she summons ghosts (`ghost`), at 25% she teleports behind you with a 1-second telegraph.
- Death: T4 chest and victory (overtime ends).

## 5. Achievements
Stored like the Codex (localStorage plus a copy in Firestore). Reward is a bag unlock or currency, plus each achievement grants a permanent stat bonus in all runs (src/data/achievements.js, shown in its own column on the stat panel). Achievements pop up as a toast in the center below the experience bar as soon as the condition is met (Toast scene); those tied to victory appear at the end-of-run summary.
| id | condition | reward | permanent bonus |
|---|---|---|---|
| first_trophy | Defeat a boss. | 10 crystals | +2% attack, +2% magic |
| three_crowns | Defeat 3 bosses in one run. | +1 bag column | +3% maxHp |
| reaper_slayer | Defeat the Reaper. | 2 chaos hearts | +5% critDmg |
| both_heroines | Win with every heroine. | 20 crystals | +2% attack, +2% magic |
| hunger | Win without picking up any food. | protection scroll | +0.05 regen |
| monogamy | Defeat Dryad Queen with a single weapon and no passives. | protection scroll | +2% haste |
| untouchable | 3 minutes without taking damage with 300+ enemies alive. | 20 crystals | +1% dodge |
| ascetic | Do not pick up experience for the first 2 minutes. | 10 crystals | +2% xpGain |
| no_safety | Win without rerolling, skipping, or banishing any cards. | 1 chaos heart | +2% luck |
| evolutionist | Collect all 16 evolutions (over time). | +1 bag row | +3% duration |
| naturalist | Fill the Bestiary. | 20 crystals | +2% speed |
| hoarder | Stash is 100/100. | +1 bag column | +5% pickup |
| tetris | Bag is filled with no empty open cells. | +1 bag row | +2% area |
| collector | 5 different uniques in stash. | protection scroll | +2% luck |
| recycler | Dismantle 100 items. | 30 crystals | +5% pickup |
| diversity | 8 different types in one bag. | 10 crystals | +1% crit |
| smith | Enchant an item to +7. | protection scroll | +2% attack, +2% magic |
| broke_it | Break an item with enchantment. | 10 crystals | +1% thorns |
| chaos_alchemist | 50 rerolls. | 1 chaos heart | +5% critDmg |
| side_by_side | In co-op, defeat 3 bosses. | 1 chaos heart | +3% maxHp |
| medic | Revive your partner in co-op (stand by their coffin while they are down). | 10 crystals | +0.05 regen |
| no_one_left | Victory in co-op where no one fell. | 1 chaos heart | +2% resistance |
| vacuum | Collect 400 experience crystals at once with the magnet. | 10 crystals | +5% pickup |
| meat_grinder | 1500 kills in one minute. | 20 crystals | +2% area |
