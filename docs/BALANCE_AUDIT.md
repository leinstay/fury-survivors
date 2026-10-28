# Balance audit: October 24, 2026

Code: `main` 87e1379 (source in `src/data/build.js` 46fb2f27…), model selection `human-a0cd1f09fa4f`,
profiles `human-provisional-2`. Data: full export of `fury_runs` (all pages, no period filter).
Nothing from balance has been published and nothing in `src/data/` has changed. Below are candidates and their verification.

## 1. Verdict

| Statement | Confidence |
| --- | --- |
| Build exhausted too early: by 10:00 in solo, players have 9–10 remaining personal upgrade levels; by 15:00, 0 among all 6 survivors. Auto-heal starts between 11:38–14:09. | high (people and bots match) |
| Cause: experience curve taken verbatim from Vampire Survivors (5, +10/+13/+16, bonuses 600/2400) where the stage is 30 minutes but ours is 15. No Growth compensation +100% after 20/40 for us. | high |
| Difficulty concentrated in the 5:00–8:00 window: all 10 human deaths between 205–468 s. Almost everyone who survived 10:00 wins. | high for solo, moderate for duo |
| Duo too difficult not from damage but from personal progression: at 5:00 a duo player has 17–19 personal card picks versus 24–31 in solo. The cost per personal round reduces duo-bot mortality from 93% to 25%. | moderate (direction is reliable, magnitude shifted by movement model) |
| Storm Chain and its evolutions dominate. Blade Arc and shield evolutions do almost no damage. | high |
| Duo hangs and disconnects: plausible mechanism found and reproduced (halted frame cycle for one player). | moderate: matches telemetry but not proven for these users |
| Goals 50%/75% and "cursed without evolutions ≈ impossible" unconfirmed: no qualification sample (≥400 per mode) | — |

## 2. Data

Export 2026-10-23T23:16Z: **23 documents, 0 rejected**, `createdAt` 2026-10-23 02:10Z – 23:06Z.
Snapshot: `docs/simulation-evidence/telemetry-2026-10-24.json.gz` (uncompressed sha256 023b9c30…,
manifest nearby). No names or IPs in records. sessionId hashed by exporter.

| Version | Schema | Mode | Documents | Sessions | Session outcomes |
| --- | --- | --- | ---: | ---: | --- |
| 0fc7e5 | v1 | solo cursed | 11 | 11 | 5 win, 5 death, 1 quit (115 s) |
| 0fc7e5 | v1 | solo normal | 2 | 2 | 1 win, 1 death |
| e58f49 | v2 | duo cursed | 5 | 3 | 1 team death, 2 disconnect |
| e58f49 | v2 | duo normal | 1 | 1 | disconnect |
| 6ef720 | v2 | duo normal | 4 | 2 | 1 win, 1 team death |

- Compatibility: between 0fc7e5 and 87e1379 in `src/data` and behaviors only telemetry changed.
  `xpLevelScale` (default 1, no effect) and fix for legacy shield (`_blocked`). Balance numbers
  are identical. All 23 documents are comparable. The `ver` change is explained by the hash of `BUILD` in the fingerprint.
- **No v2 solo exists.** All solo are v1 of one hero (mage), probably 1–2 people. Duo is 6 sessions,
  with 2 of them missing the second document (on disconnect the tab was apparently closed: unfinished runs are not saved).
- Suitability. Training on choice: 23 documents (1051 voluntary actions) but v1 without HP/budget context.
  Balance by outcomes: 13 solo sessions and 3 completed duo sessions. Disconnects (3) are excluded from outcomes and
  shown separately, not as deaths. Movement and incoming damage in the window: only 10 v2 duo documents.
  Technical issues: 3 disconnects, 2 missing second document, e58f49 missing `terminal`.

## 3. Four modes: people and bots

Bots: `balance:quick` cohort, tuning seeds, 40 matches per mode. Duo counted by team.
Repeated run of the same cohort with telemetry gave identical outcomes byte-for-byte (observers do not affect RNG).
L = level, T = personal card picks, left = remaining personal upgrade levels (accounting for slots,
consumed components and banish), medians among those alive at that minute, n = number of alive players.

| Mode | Source | Outcomes | 5:00 L / T / left (n) | 10:00 | 15:00 |
| --- | --- | --- | --- | --- | --- |
| normal solo | people | 1 W, 1 D | 28.5 / 27.5 / 43.5 (2) | 59 / 58 / 10 (1) | 85 / 74 / 0 (1) |
| normal solo | bots | 16 W, 24 D: **60%** [45–74] | 25 / 24 / 47 (37) | 53 / 52 / 14 (18) | 80 / 65.5 / 0 (16) |
| cursed solo | people | 5 W, 5 D, 1 quit | 36 / 35 / 38 (9) | 69 / 68 / 9 (5) | 91 / 77 / 0 (5) |
| cursed solo | bots | 6 W, 33 D, 1 timeout: **83%** [68–91] | 32 / 31 / 41 (23) | 63 / 62 / 2 (7) | 96 / 71 / 0 (7) |
| normal duo | people | 1 W, 1 D, 1 DC | 40 / 19 / 28 (5) | 75 / 37 / 12.5 (2) | 108 / 53 / 3 (2) |
| normal duo | bots | 3 W, 37 D: **93%** [80–97] | 36 / 17 / 29 (74) | 75 / 37 / 10 (8) | 107 / 49.5 / 3 (6) |
| cursed duo | people | 1 D, 2 DC | 44 / 21.5 / 25.5 (2) | — | — |
| cursed duo | bots | 1 W, 39 D: **98%** [87–100] | 40 / 19 / 28 (52) | 91 / 42 / 4.5 (2) | 113 / 48.5 / 4 (2) |

Time to first auto-heal (choice exhausted) for people: normal 810 s. Cursed 698, 736, 746, 833, 849 s.
Duo normal 958/964 s. For bots, 12/16 normal and 7/7 cursed solo are exhausted by 15:00.

![Remaining personal upgrade levels](simulation-evidence/balance-audit-options.svg)

Deaths: people 205–468 s (cursed solo 205, 332, 338, 413, 428. Normal solo 421. Duo 420 and 468).
Killers are foxes (dash), succubi, slimes, ghosts, first boss. For bots median death is 414 s normal solo,
364 s normal duo. Main killer is also foxgirl. This covers waves 300–480 s (`forest.js`: foxes, succubi, lamiae).

## 4. Bot reliability

Confirmed:
- **Level pace** matches (table above): median divergence ≤ 4 levels at 1/3/5 min in all
  modes except cursed solo at 1:00 (6.5 for bots versus 9 for people).
- **Card choice** on new data not in training (`tools/telemetry/holdout.mjs`,
  10 v2 documents, 272 picks): model top-1 **60.6%**, "first card" 26.1%, uniform 25.7%,
  logloss 1.026. For Hero only **48%** (model trained on one Mage).
- **Incoming damage in solo** over full run: people 19.4 (normal, n=2) and 27.9 (cursed, n=11) per minute.
  Bots 20.6 and 27.3.

Divergences (limit conclusions):
- **Movement in duo.** Window 1:00–7:00: people take 8.9 (normal) / 18.7 (cursed) damage per minute.
  Bots 22.3 / 33.3. Median distance to nearest enemy for people 148/129 px, for bots 80/74 px.
  Bots without a target move toward the nearest enemy and into crowds for experience. Trial "holding distance" 110–140 px
  barely changed things (82–92 px). Movement needs restructuring. It was reverted. Model not updated.
  Result: **duo-bot mortality is an upper bound**.
- **Diversification in duo.** When new weapon and an upgrade appear together, duo people pick the new weapon
  in 44% (normal) of cases, bots in 7%. Concentration on one weapon in first 5 minutes matches at 0.50.
- Idle (zero input) for duo people 8–9% of the time, for bots 13–19%.

Conclusion: bot progression pace and choices fit for assessing experience economy. Solo death rates are a guide. Duo death rates are only an upper bound. Do not calibrate duo difficulty by bots until new movement data exists (including v2 solo).

## 5. Experience and progression: verified problems and hypothesis checks

Build capacity: solo 6+6 slots = 6·7 + 6·5 − 1 = **71** personal upgrades. Duo 4+4 = **47**.
People solo reach it by 11–14 min. Cumulative experience to level (current curve): L30 4.9k, L50 16.4k,
L70 31.8k. Income for cursed solo survivors: 7.1k by 5:00, 30.9k by 10:00, 54.8k by 15:00. In the second
half of the stage income grows (more enemies and stronger builds) while level cost grows linearly.

Duo: shared level, cards taken in turns. At the same minute a duo player has half as many personal picks for that level,
and `xpForLevel` grows after each team card. At 5:00 duo people have T 19–21.5 at L 40–44.

Hypotheses checked one at a time on tuning seeds (same seeds/profiles, 40 matches per mode. % = defeats):

| Variant | normal solo | cursed solo | normal duo | cursed duo | left at 15:00 (n-s / c-s / n-d / c-d) |
| --- | ---: | ---: | ---: | ---: | --- |
| Current | 60 | 83 | 93 | 98 | 0 / 0 / 3 / 4 |
| H1 smooth A (10/25/45, no bonuses) | 73 | 80 | 100 | 100 | 2 / 0.5 / — / — |
| H2 A + cursed XP 0.8 | 73 | 85 | 100 | 100 | 2 / 3.5 / — / — |
| H3 A + personal round 1.5 | 73 | 80 | 68 | 88 | 2 / 0.5 / 1 / 4 |
| H4 A + personal round 2 | 73 | 80 | 25 | 53 | 2 / 0.5 / 2 / 0 |
| H5 A + round 2 + coopXP 1.0 | 73 | 80 | 45 | 60 | 2 / 0.5 / 2 / 0 |
| H6 hero regen only +0.3 | 45 | 73 | 83 | 100 | 0 / 0 / 1.5 / — |
| C1 A + regen .25 + round 2 + coopXP 1 + cursed XP .9 | 57 | 85 | 35 | 63 | 5 / 0 / 2 / 0.5 |
| C2 B (10/25/55, step at 35) + regen .3 + round 2 + coopXP 1 | 48 | 80 | 23 | 45 | 10 / 2.5 / 2 / 0 |
| C3 C1 without cursed XP, duo 5+5 slots | 57 | 78 | 35 | 60 | 5 / 0 / 5 / 2.5 |
| **C4** B + regen .25 + round 2 + coopXP 1 + cursed XP .9 + duo 5+5 | 55 | 80 | 25 | 85 | 10 / 3 / 6.5 / 5 |

Hypothesis conclusions:
- Only slowing experience (H1/H2) keeps choices in solo but raises normal solo mortality
  (60→73%) and does not touch duo. This confirms: XP is a lever for "how much choice" not "who survives to 8:00".
- Personal round (`coopLevelScale` 2) is the main lever for duo but with 4+4 slots the build exhausts
  by 10–12 min (auto-heal for 39–60 of 44–64 survivors). The limit is capacity not experience.
- Base regen (user proposal) helps mostly solo (normal −15 pp) and barely helps duo (−10 pp normal, cursed unchanged). Duo is not fixed by it but it compensates for XP slowdown in solo.
- One cursed XP bonus 0.8–0.9 reduces the positive feedback "50% more enemies → 50% more XP":
  level at 15:00 in C4 is 61.5 versus 97.5 now.

Check **C4 on validation seeds** (not used in tuning. 40 per mode):

| Mode | Current: defeats [95% CI] | C4: defeats [95% CI] | C4: left at 15:00 | C4: auto-heal by 15:00 |
| --- | --- | --- | --- | --- |
| normal solo | 57% [42–71] | **43%** [29–58] | 10 (n=23) | 1 |
| cursed solo | 75% [60–86] | **85%** [71–93] | 6.5 (n=6) | 1 |
| normal duo | 93% [80–97] | **45%** [31–60] | 6.5 (n=44) | 10 |
| cursed duo | 100% [91–100] | **83%** [68–91] | 3.5 (n=14) | 2 |

Cursed without super-weapons (validation, 40 per mode): current solo 4/40 wins (95% upper bound 21%),
duo 0/40 (7%). C4 solo 2/40 (15%), **duo 7/40 (30%)**. In duo with C4 skipping evolutions does not change
outcome (83% and 83%): the result there is decided in the 5–8 minute window not by the chest. Goal "≤5%" is unconfirmed for current balance and for C4: it needs ≥200 matches per mode and very few wins.

Qualification criteria (`SIMULATION_GUIDE.md`): ≥400 independent qualification matches per mode, full
95% CI within 45–55% / 70–80%. **Data insufficient**: 40 per mode here (CI width ~30 pp),
and the duo movement model is shifted. Qualification seeds not used, remain independent.

## 6. Weapons

Natural bot runs (minutes of full ownership, medians) and people v2. Controlled trials
in `docs/simulation-evidence/combat.json` (L7, immortality, shared motion tape).

| Weapon | Damage/min early phase (lv) | Player damage share early / mid | Overkill raw/dealt | Trial L7 crowd / archers, DPS | Incoming HP in trial crowd |
| --- | --- | --- | --- | --- | --- |
| Storm Chain | 5366 (3) | 0.64 / 0.46 (people 0.78 / 0.66) | 2.03 | 452 / 273 | 124 |
| Firebomb | 2652 (3) | 0.29 / 0.20 | 1.32 | 641 / 225 | 127 |
| Throwing Daggers | 3280 (3) | 0.41 / 0.16 | 1.41 | 455 / 151 | 134 |
| War Axe | 1178 (2) | 0.17 / 0.07 | 1.44 | 237 / 50 | 130 |
| Guardian Shields | 1215 (2) | 0.15 / 0.05 | 1.65 | 320 / 43 | 144 |
| Holy Ground | 889 (2) | 0.10 / 0.05 | 1.23 | 78 / 17 | 80 |
| Blade Arc | 864 (3) | 0.16 / 0.03 | 1.67 | 83 / 15 | 83 |

Confirmed:
- **Storm Chain dominates** both people and bots. Its overkill of 2.0 means half the damage goes to already-killed targets. It is strong from early "one-shot" finishing.
- **Blade Arc is weak on its own** not just from competition: in a controlled crowd 83 DPS versus
  452–641. Competition exists too: blade share in early phase is 0.28 without Storm Chain and 0.05 with it.
  0.26/0.07 without/with daggers. 65% of its kills hit targets already hit by other sources.
  Melee gives less incoming damage in a crowd (83 versus 124–144), which is its defensive value.
- **Evolutions** differ by two orders of magnitude: Plasma Storm 150–200k damage/min, Thunder Loop 76–139k,
  Thunder Knives 113–158k versus Crimson Arc ~10k, Aegis Bastion 2–3k, Bulwark Spin/Aegis Storm ~3k.
- **Shields**: in trial with archers 23 destroyed projectiles and incoming damage 11 versus 36–40 for daggers and
  lightning. Defensive benefit is real and not visible in DPS. Behavior matches codex: projectiles are destroyed not reflected. In natural duo runs teams with shields beat 3/25 by 5:00 without shields,
  0/12 (normal). Matches user observation but sample is small (p≈0.3).
  In solo no link (11/24 without shields versus 5/13 with shields).

### 6.1 Weapon rebalance: experiments (not applied)

Outcome depends heavily on starting weapon. Current balance solo wins from 20 (tuning / validation):
Mage (start Storm Chain) normal 13 / 12, cursed 5 / 9. Hero (start Blade Arc) normal 3 / 5,
cursed 1 / 1. Average "57–60% defeats" comes from easy Mage and nearly impassable Hero.

In first 5 minutes (damage per minute full ownership, bots): Storm Chain 5.4k. Daggers 3.3k and bomb 2.7k
lag ~1.7×. Blade, aura, axe, shields (0.9–1.2k) lag 4.5–6×. In controlled trial L7
blade and aura are 5–6× weaker than lightning. Nerfing lightning alone without raising others makes 1–8 min impassable
for everyone except daggers and bomb. So we raise the weak quartet first, then lower lightning to meet them.

Comparison with Whip from Vampire Survivors ([wiki](https://vampire.survivors.wiki/w/Whip)): 10 damage / 1.35 s,
2 hits both directions, +5 damage nearly each level to 40, area +20% to max, passes through all. Our blade numbers nearly match (10→36). Differences that kill it: (1) our enemies after doubling HP—slime 24, cat 32, fox 160. 10 damage does not kill even the first wave where VS whip kills with one hit. (2) hit range 62–86 px and duo people keep nearest enemy
at 130–150 px (blade damage share for people 1%), bots at ~80 px. So one blade damage barely helps
(×2.8 damage → actual damage in run 864 → 1460 per minute) but hit range helps immediately.

| Variant (current XP, tuning, 20 per hero / 40 duo) | Blade damage/min 0–5 min | Lightning | Lightning share | Hero normal: wins / reached 8:00 | Mage normal | Hero cursed | Defeats normal solo / cursed solo |
| --- | ---: | ---: | ---: | --- | --- | --- | --- |
| Current | 864 | 5366 | 0.64 | 3 / 4 | 13 / 14 | 1 / 1 | 60% / 83% |
| W1 blade damage ×~2 | 1317 | 6477 | 0.68 | 6 / 11 | 13 / 13 | 3 / 6 | 53% / 70% |
| W2 W1 + lightning L1–4 −30% | 1432 | 4602 | 0.61 | 6 / 11 | 11 / 12 | 3 / 6 | 57% / 80% |
| W4 blade ×2.8, aura ×2.4, axe ×2, shields ×1.8, lightning L1–4 −30%, L5–7 −13% | 1460 | 4661 | 0.59 | 5 / 14 | 15 / 15 | 1 / 7 | 50% / 83% |
| **W5** W4 + blade range on 2 ring steps (78→115 px), lightning L1–4: 12–15 damage, 2–3 bounces | **3118** | **3745** | **0.52** | 9 / 16 | 17 / 17 | 5 / 12 | 35% / 70% |

W5 first evens early power: blade 3.1k, lightning 3.7k, daggers 3.6k, bomb 2.5k per minute. Hero
survives 8:00 in 16 of 20 normal (was 4). Remaining: axe and shields ~1k (shields pay with defense,
axe needs raising). Hero/Mage win gap (Mage has attack ×1.25 and crit 15% on all weapons).

With XP packet (C4W5) the game becomes too easy: normal solo 20%, normal duo 15%, cursed
solo 80%, cursed duo 55%. This is expected. C4 was tuned with weak blade. Next step: accept W5 as
weapon base and re-tune wave pressure 5–8 min or XP against it. Do not publish W5 without this.
Configs: `docs/simulation-evidence/balance-audit/W1…W5.json`, `C4W4.json`, `C4W5.json`.
`node docs/simulation-evidence/balance-audit/byhero.mjs W5` shows outcomes by hero and damage shares.

### 6.2 Damage ladder by range (owner rule): R2

Rule: closer weapons do higher damage per hit. Distant and self-contained weapons
(chain, fire, projectile block, return) do lower, without huge gap. Lightning hits farthest and many targets
beyond screen so it has the lowest damage per hit. Globally the game should not get harder:
defeats in each mode not above current on same seeds.

| Weapon | Range | Damage per hit L1 → L7 now | R2 | R2 cooldown |
| --- | --- | --- | --- | --- |
| Blade | 78–115 px (was 62–86) | 10 → 36 | 20 → 56 | 1.0 → 0.8 (was 1.35 → 1.2) |
| Shields | orbit ~55 px, block | 12 → … | ×1.5 | unchanged |
| Axe | 110–185 px, return | 12 → 25 | ×1.6 (19 → 40) | ×0.75 |
| Aura | around hero, constant | 5 → 15 | ×2 (10 → 30) | ×0.8 |
| Bomb | throw + fire | 10 → … | unchanged | unchanged |
| Daggers | ~340 px, pierce | 8 → … | unchanged | unchanged |
| Lightning | 230–290 px + 3–5 bounces | 18 → 35 | 8 → 16 | 1.1 → 0.95 (was 1.25 → 1.1) |

Results (current XP, 40 matches per mode. Solo by hero 20/20):

| | Defeats normal solo | cursed solo | normal duo | cursed duo |
| --- | ---: | ---: | ---: | ---: |
| Current, tuning | 60% | 83% | 93% | 98% |
| R2, tuning | 30% | 73% | 95% | 98% |
| Current, validation | 57% | 75% | 93% | 100% |
| R2, validation | 38% | 70% | 88% | 95% |

Validation: Hero normal 5 → 10 wins from 20 (to 8:00 reached 9 → 15), cursed 1 → 6. Mage normal
12 → 14, cursed 9 → 6 (tuning 5 → 6. At n=20 within noise but worth checking Mage cursed separately). Damage per minute first 5 minutes: lightning 6.1k → 5.1k, blade 0.8k → 2.4k, daggers 3.7k, bomb 2.1k,
aura 1.0k → 1.6k, axe 1.2k → 1.4k, shields 0.6k (pay with block). Lightning remains strongest by count
(many targets) but gap ~1.4× instead of 5–7×. Duo barely changes: its limit is personal progression
(section 5) not weapons. Goal "not harder" met in all four modes on both seed sets.
Config: `docs/simulation-evidence/balance-audit/R2.json`.

### 6.3 Candidate F3: lightning and daggers lower than melee, cursed and duo easier than now

Owner requirement: lightning and daggers (most distant) lower to other level and hit weaker
than blade and axe. Cursed and duo pass easier than now. Levers: experience curve and limit on simultaneous projectiles
from regular enemies (boss projectiles not limited).

New in code: `COMBAT.maxEnemyShots` (default `Infinity`, behavior unchanged): succubus does not shoot while that many
regular-enemy projectiles fly. Boss projectiles marked `boss` do not count.
Current balance measurement (median peak per minute / max): by 5:00 zero. 6:00 6–10 / up to 21.
8:00 23–34 / up to 169. 14:00 in duo 36–49.

F3 = damage per hit (L1 → L7): blade 20 → 56 (78–115 px range, cooldown 1.0 → 0.8), axe ×1.6 and
cooldown ×0.75, shields ×1.5, aura ×2 and cooldown ×0.8, bomb unchanged, daggers ×0.7 (6 per hit),
lightning 7 → 14, 2–4 bounces, original cooldown 1.25 → 1.1. Experience: no bonuses 600/2400 at 20/40.
Duo `xpLevelScale` 1.5, `xpMul` 1.0. `maxEnemyShots` 12. Mage maxHp 80 → 120.

| Defeats | normal solo | cursed solo | normal duo | cursed duo |
| --- | ---: | ---: | ---: | ---: |
| Current, tuning | 60% | 83% | 93% | 98% |
| F3, tuning | 43% | 60% | 43% | 68% |
| Current, validation | 57% | 75% | 93% | 100% |
| F3, validation | 35% [22–50] | 55% [40–69] | 43% [29–58] | 53% [37–67] |

Lever breakdown (tuning): weapon R3 alone—normal solo 70%. Mage 3/20 wins (lightning carried her).
Plus duo curve 2.0—duo 35% / 65%. Plus projectile limit 12—cursed solo 78 → 70%, cursed duo 65 → 50%.
Plus no XP bonuses—normal solo 50% but duo 13% / 30% (too easy). Use round 1.5 instead of 2.

Damage per minute first 5 minutes, current XP curve, weapon only (R3): blade 3.4k, lightning 2.8k, daggers 2.8k,
bomb 2.7k, axe 1.7k, aura 1.6k, shields 0.9k. In F3 lightning is 3.7–4.1k from fast tuning-duo upgrade.
Validation by hero (wins from 20): Hero normal 5 → 16, cursed 1 → 12. Mage normal 12 → 10,
cursed 9 → 6 (tuning 13 → 10 and 5 → 6). Mage without lightning-"carry" stays slightly worse than current.
Only point where "not harder" not fully met. Next lever: her starting lightning L1.
Cost: with no XP bonuses build is exhausted by 15:00 again (left 0). Goal "choices at 15:00" deferred
for passability. Late curve (section 5) brings it back but already under F3.

### 6.4 Candidate F4 and bot food search (profiles human-provisional-3)

Duo people pick up food 0.35–0.4 times per minute at ~85% HP (`tools/telemetry/food.mjs`). Bots went to it
only below 60% HP: 0.17–0.18 in duo, often at full HP in solo (randomly). Now bot avoids food above 92% HP and moves to it with priority 2 + 10 × fraction of lost HP: 0.28–0.31 per minute at 70–84%.
Incoming damage in window 1–7 min unchanged (evasion question, section 4). Current balance recalculated
with these bots (P3). Comparison only against it.

F4 = F3 but Mage HP 80 (as now), shields unchanged (×1), axe damage ×1.6 and cooldown ×0.5
(3.0 → 1.5 s at L1). Damage per hit L1: blade 20, axe 19, shields 12, bomb 10, aura 10, lightning 7, daggers 6.

| Defeats | normal solo | cursed solo | normal duo | cursed duo |
| --- | ---: | ---: | ---: | ---: |
| Current (P3), tuning | 57% | 83% | 90% | 100% |
| F4, tuning | 45% | 50% | 48% | 78% |
| Current (P3), validation | 45% | 83% | 100% | 100% |
| F4, validation | 40% [26–55] | 55% [40–69] | 53% [37–67] | 78% [62–88] |

Damage per minute 0–5 min (validation): lightning 6.2k → 3.9k, blade 0.85k → 2.8k, daggers 3.0k → 2.9k, bomb 2.8k,
axe 1.1k → 1.9k, aura 1.0k → 1.7k, shields 0.6k. Mage (validation): normal 15 → 10, cursed 7 → 6 wins from 20 (tuning 16 → 6 and 7 → 6). Hero normal 5 → 14, cursed 0 → 11. All modes easier than current
but Mage on normal without lightning-"carry" noticeably weaker than before.

### 6.5 Applied in `src/data` (24.10.2026)

F4 moved to data: `weapons.js` (blade, axe, aura, daggers, lightning. Shields and bomb unchanged).
`constants.js` (`XP.thresholds = []`, `COMBAT.maxEnemyShots = 12`), `coop.js` (`xpLevelScale` 1.5,
`xpMul` 1). Mage HP 80. After merge with main (weapons break objects without enemies nearby), check on
validation seeds, 40 per mode: defeats normal solo 40%, cursed solo 48%, normal duo 57%,
cursed duo 60% (current balance before this: 45 / 83 / 100 / 100%). Unit 193/193, smoke 7/7.

Do not tune weapons until experience and duo movement resolved: slower progression means
late evolutions appear later and their contribution shifts.

## 7. Duo reliability and hangs

- All 3 disconnects happened within 1 s of game time from the upgrade choice screen.
  fb7e9e 0.9 s after choice (decision took 9.5 s). ed51bb host had open offer at moment of disconnect. c1e41b 0.4 s after guest choice, guest thinking **21.5 s** (`NET.dropAfter` = 20 s).
  Random coincidence unlikely (window ~1 s when choosing every 5–10 s). This is version e58f49 before pause fix 835f460.
  On 6ef720 two sessions completed without disconnect.
- **Mechanism reproduced via WebRTC** (`tests/smoke/coop-hidden.spec.js`, run
  `FURY_DUO_HIDDEN=1 npx playwright test tests/smoke/coop-hidden.spec.js`): if one player's
  frame loop is halted (tab in background, minimized browser, app switch on phone, browser stops calling requestAnimationFrame), they do not send ticks. The other freezes immediately on
  upgrade screen ("hang without Escape"). That player also stops sending because new tick
  not counted. After 20 s both get disconnect. On quit after 8 s session recovers.
  Likely user scenario: waiting player switches while partner chooses.
- Additional defect: `Game.now()` = `game.loop.time`, which does not advance in background. Messages
  arriving at a hidden tab write stale `lastRemoteT`.
- Fix (not done, owner decision): maintain exchange from a timer when `document.hidden` (Chrome timers in background fire ~1 s, enough for heartbeat and tick catchup). Show "partner away" and do not disconnect in levelup/chest/pause states. Count silence by `performance.now()`. On phone when JS halts completely,
  use a longer threshold in choice screens.
- Disconnect/timeout/errors separated from deaths in all tables. No simulator errors in ~2,500
  audit runs. 1 timeout (cursed solo baseline).

## 8. Ranked proposals

1. **Experience curve B without bonuses**: `src/data/constants.js` `XP.steps = [{below: 20, per: 10},
   {below: 35, per: 25}, {below: Infinity, per: 55}]`, `XP.thresholds = []`. Reason: VS curve
   designed for 30 minutes. Effect (validation, C4): by 15:00 in solo 6.5–10 levels remain
   (auto-heal by 15:00 for 1 of 23/6 survivors versus 11/9 now). Early pace held (5:00 L 25–28).
2. **Hero base regen 0.25 HP/s**: `src/data/heroes.js` `stats.regen` both heroes and `HERO_BASE.regen`
   (else upgrade screen shows false "+regen"). Compensates for slower progression
   in solo (H6: normal 60→45%). Passive regen (+0.2…1.0) stays meaningful.
3. **Duo: personal round and capacity**: `src/data/coop.js` `xpLevelScale: 2`, `xpMul: 1`,
   `slots: {weapons: 5, passives: 5}`. Level cost counted per personal rounds. 5+5 slots give capacity
   59 instead of 47 so choices remain by 15:00. Tested only with bots with high duo mortality:
   real duo difficulty likely below 45/83%. Before release get new v2 sessions.
4. **Cursed XP 0.9**: `src/data/difficulty.js` `cursed.xpMul: 0.9`. Reduces feedback
   "more enemies → more experience". Cursed solo on validation 85% [71–93] at goal top. If qualification shows above 80%, rollback this first (H1: 80% without it).
5. After experience: **weapons**. Weaken Storm Chain's overkill early power (damage L1–3 or bounce count).
   Raise Blade Arc (controlled trial: equal spend Storm Chain + attack/haste gives 803 DPS,
   blade adds only ~100 to lightning). Shield and blade evolutions. Only paired trials `sim:combat`
   then natural runs.
6. **Duo network**: fix from section 7 before any conclusions about duo mortality by people. Disconnects
   systematically cut duo runs on the choice screen.

Apply package 1–4 as one change = C4. Apply as package then fully repeat all 4 modes. Results above
do not carry to partial application (parameters linked: boss HP depends on total level).

## 9. Next collection

- **v2 solo** (now zero): normal and cursed, both heroes, including deaths and failed builds.
  Needed to tune movement and check that solo bots do not diverge from people like duo bots.
- 15–20 duo sessions on 6ef720+ with `terminal`, different player pairs.
- Telemetry: `document.visibilityState` transitions and duration (event with tick), last message received time by `performance.now()`, send unfinished run on `pagehide` (now document is lost). Without this hangs cannot be blamed on tab background.
- For movement model: distance to nearest 3–5 enemies and nearest crystal when picking direction already in `movement`. Need more sessions. Separate profiles by hero.

## 10. Reproduction

```bash
npm ci
npm run telemetry:export -- --out tools/out/telemetry-all            # or unpack snapshot:
gunzip -c docs/simulation-evidence/telemetry-2026-10-24.json.gz > tools/out/telemetry-all/runs.json
node tools/telemetry/audit.mjs tools/out/telemetry-all/runs.json      # people: sessions, minutes, build remainder
node tools/telemetry/holdout.mjs tools/out/telemetry-all/runs.json    # choice on holdout v2
node tools/telemetry/weapons.mjs tools/out/telemetry-all/runs.json    # weapons in runs
node tools/telemetry/movement.mjs tools/out/telemetry-all/runs.json human
node tools/simulation/audit-bots.mjs --n 40 --split tuning --out tools/out/audit/bots-baseline.json
docs/simulation-evidence/balance-audit/run-exp.sh docs/simulation-evidence/balance-audit/C4.json
node tools/simulation/audit-bots.mjs --n 40 --split validation --lite \
  --experiment docs/simulation-evidence/balance-audit/C4.json --out tools/out/audit/V-C4.json
node tools/simulation/audit-bots.mjs --n 40 --split validation --lite --no-evolution \
  --modes cursed/1,cursed/2 --experiment docs/simulation-evidence/balance-audit/C4.json \
  --out tools/out/audit/V-C4-noevo.json
node docs/simulation-evidence/balance-audit/cmp.mjs bots-baseline C4 V-baseline V-C4
node docs/simulation-evidence/balance-audit/evidence.mjs   # summary → balance-audit/results.json
node docs/simulation-evidence/balance-audit/evidence.mjs   # summary → balance-audit/results.json
node tools/telemetry/audit-chart.mjs tools/out/telemetry-all/runs.json tools/out/audit/bots-baseline.json \
  tools/out/audit/C4.json docs/simulation-evidence/balance-audit-options.svg
```

All hypothesis configs in `docs/simulation-evidence/balance-audit/*.json`. All cohort results with outcomes,
CI and per-minute progression in `balance-audit/results.json`. Experiments change `XP`, `DIFFICULTIES`,
`COOP` and hero stats only inside the run (`tools/simulation/experiment.mjs`) then restore.

External reference: [VS Level up](https://vampire.survivors.wiki/w/Level_up) (curve 5/+10/+13/+16,
bonuses 600/2400, +100% Growth after 20 and 40. Viewed 24.10.2026). [HoloCure Collaborations](https://holocure.wiki.gg/wiki/Collaborations)
(collabs from two weapons at max level, free a slot). Numbers not ported: compared
share of stage where build exhausts (VS at 30-min stage and same curve exhausts noticeably later).

## 11. Rebalance for META 1.1 goals (27.10.2026)

Code: branch `meta-items` from dd143ec (steel/magic stat, 16 weapons, evolutions only, XP ×2, regen 0.25,
turn-based cards, items). Bots `human-provisional-4` (focus 25%, evolution 45%, adaptive 20%,
defensive 10%). Heroes even. Horizon 18:00. "Killed 2nd" = `sim.bossKills ≥ 2` (Harpy Queen, 10:00).
"Killed 3rd" = win (Dryad Queen, 15:00, `final`). Number tuning on tuning seeds only (n 80–240).
Result: one run on validation (n 200) and qualification (n 240). Table shows their sum, n = 440 per mode,
95% Wilson CI. Timeouts (did not kill Dryad by 18:00) counted as "did not kill 3rd": 0–3 per mode.

Bag T2 (`tools/simulation/bags.mjs`): 9×5, items `rollItem(rng, 2)` (rarity by T2 table without uniques).
Placed first free spot up to 45 cells, no selection (`pick: 1`). Each run gets its own.

| mode | 2nd boss by | after | 3rd boss by | after | goal |
| --- | --- | --- | --- | --- | --- |
| normal solo, empty bag | 51% [46–55] | **51% [47–56]** | 39% [35–44] | **17% [14–21]** | 50–60% / 15–25% |
| normal solo, bag T2 | 89% [86–92] | 83% [79–86] | 84% [80–87] | **49% [44–54]** | — / ~50% |
| cursed solo | 19% [16–23] | 26% [22–30] | 12% [10–16] | 11% [9–14] | not impossible |
| normal duo (team) | 14% [11–17] | 63% [58–67] | 9% [7–12] | 18% [14–21] | like solo |

- Window 5:00–8:00: death share in it normal solo 44% → 32% of all deaths (118/267 → 116/362). Duo
  84% → 20%. Deaths shifted to 10:00–12:30 (Harpy Queen fight and waves after). By 5:00 almost none.
  Cursed still dies mostly in window (64% of deaths): this is difficulty distinction.
- Heroes (normal solo, qualification): Hero 61% / 23%, Mage 44% / 15% (was 77/58% and 28/21%).
  Gap narrowed but Mage still weaker. Next lever: her lightning L1 or HP (80 set by test).
- Duo: kill 2nd boss more than solo (63 versus 51%), 3rd same (18 versus 17%).
- Sensitivity: outcome depends very steeply on power. ±0.001 in `ITEM_POWER.scale` for bag moves 3rd boss 5–10 pp. Between seed sets (tuning/validation/qualification) normal solo ranges 46–58% / 13–21%.

### 11.1 What changed

- **Late game** (was: who survived 10:00 almost always won. After 12:00 limit 400 enemies hit with cats and harpies 30–100 HP). `stages/forest.js`: waves 10:00–15:00 denser (spawn frequencies ×2–2.9,
  event sizes ×1.6–1.9) but cat and harpy minimums at 13–14 min 80–140 instead of 175–320. New lamia streams (13:00,
  min 20→60) and two lamia walls (13:30, 14:00). `damagePerMinute` 0.03 → 0.07. `enemies.js`: lamia HP 400 → 700,
  bunnygirl 60 → 100. Window 5:00–8:00 slightly easier (frequencies and events ×0.89), 8:00–10:00 ×1.05.
- **Bosses** (`bosses.js`, Reaper untouched): Harpy Queen `hpPerLevel` 440 → 400. Dryad Queen `hpPerLevel`
  900 → 1200, damage 14 → 18, ground slam 34 → 40, cat summon 6 times in 8 s → 10 times in 6 s plus 3 lamiae
  every 10 s, projectile ring works outside frenzy.
- **Weapons** (`weapons.js`, `damage` only, L5 multiplier): lightning ×2.9, beam ×2.9 (and `width` +4),
  ballista ×2.3, sparkfire ×2.1, frost orb ×1.7, miasma ×1.7, shields ×1.5, daggers ×1.3, meteor ×1.2. Bomb ×0.7,
  axe ×0.8, mines ×0.83, lance ×0.84. Blade and mallet unchanged. Evolutions: aegis_bastion 22 → 211
  (shields were useless), crimson_arc 15 → 52 (was weaker than L5 blade), blizzard ×1.8, ballista ×1.25,
  spirit_choir ×1.2, death_spiral ×1.15, prism_ray ×1.06, miasma 12 → 11 (soul_garden ends unchanged, 22).
  radiant_star ×0.7, titan_maul 130 → 70, minefield ×0.47, napalm_rain ×0.38, dragon_lance ×0.37. Rule:
  evolution not weaker than its L5 by damage per second per target (except aura/cloud with noticeably more area).
- **Items** (`items.js`): `STAT_REF` defense lower than passive. maxHp 1.0 → 0.3, armor 5 → 2, regen 1.0 → 0.35,
  dodge 0.15 → 0.08, speed 0.4 → 0.25. `scale` 0.02 unchanged. Ablation (bag without maxHp/armor/regen/dodge
  gave 54% versus 79% with them) shows bots are carried by defense. Test "bag ≈ 2–3 passives" measures in
  `STAT_REF` units so formally stays 2.4: for defense this is now an overestimate (owner decision).
- **Modes**: `coop.js` spawnMul 1.4 → 1.25, enemyHpMul 0.85 → 0.7, bossHpMul 0.5 → 0.4.
  `difficulty.js` cursed hpMul 1.25 → 1.08 (spawnMul 1.5, test requires > 1.3× spawn). Mage magic 1.25 → 1.4.

### 11.2 Weapons: damage per second of ownership

Metric `tools/simulation/targets.mjs`: effective weapon damage per second while in build (normal solo,
qualification). Base weapons held from early minutes, evolutions late only (more enemies, all passives).
Compare base to base, evolutions to evolutions. * = less than 20 min ownership total.

| | before | after |
| --- | --- | --- |
| base weapons, min–max | beam 56, frost 78, storm 87 … war_axe 351 (×6.3) | frost 136, shields 190, beam 218 … firebomb 425 (×3.1, without two defense ×2.0) |
| evolutions, min–max | aegis 166*, blizzard 366, crimson 409 … dragon_lance 1637 | napalm 883*, aegis 944, blizzard 1320 … soul_garden 2521, minefield 2536* |
| damage share, top | blade_arc 18.5%, daggers 9.1%, holy 8.8% | blade_arc 18.6%, storm_chain 13.4%, daggers 9.0% |

No domination: top share is hero starting weapons (blade for half the runs, lightning for the other).
Lightning in duo is the strongest base weapon (327 per second versus 117–277 for others, 24% damage. Mage in
every duo). In solo mid-range (263). Watch: soul_garden after raise to 22 is top evolution. Shields and ice
below others. They pay with projectile block and slow.

### 11.3 Reproduction

```bash
node tools/simulation/targets.mjs --n 240 --split qualification --workers 30 --out tools/out/targets/q.json
node tools/simulation/targets.mjs --n 80 --modes normal/1,normal/1/bag --pick 1 --tier 2   # fast tuning
```

Modes `difficulty/players[/bag]`. Bag is `config.bag = {tier, cells, pick}` (runner, replay) or ready
`config.loadouts`. "Before" same scripts on snapshot dd143ec (`git archive`), same seeds.

## 12. Clear instead of deaths (27.10.2026)

Owner: "failure is not death but monsters becoming more." Sections 1–11 measured win rate among mortal bots
and death defined by bot movement (bots took more hits than people, section 4). Now two metrics: **clear**
(immortal bots of three builds) and **defense on paper** (human hit frequency × enemy damage). Code: branch `meta-items`.
People data: snapshot 24.10 and fresh export 27.10 (52 documents. Public REST Firestore via `tools/telemetry/export.mjs`, no secrets).

### 12.1 People data: hits, movement, clear

`tools/telemetry/hits.mjs` (result in `docs/simulation-evidence/human-hits-2026-10-27.json`). Hit is
`playerHurt` event of own player (schema v2+, i-frames 0.5 s). V1 has no events. Hits estimated as enemy damage / enemy damage on median minute. Documents with cut-off `events` (limit 4000, 2 runs) count to last event. Solo: 42 documents (29 with events). Duo: 10. Almost all solo are Mage, 1–3 people.

| | solo normal (7 docs) | solo cursed (22 docs) | duo normal (5) | duo cursed (5) |
|---|---|---|---|---|
| hits per minute, whole run | 0.9 | 1.6 | 0.9 | 1.8 |
| v1 (estimate by damage) | 0.9 | 1.7 | — | — |
| hits per minute 5:00–7:00 | 1.0–1.7 | 1.7–3.8 | 1.0–3.5 | 2.5–6.2 |
| hits per minute 8:00–15:00 | 0–2 | 0.5–1.4 (14:00 3.3, Dryad) | 0–1.5 | — |
| damage per minute 5:00–7:00 / 10:00–14:00 | 15–24 / 0–35 | 24–53 / 8–61 | 14–50 / 0–23 | 35–91 / — |
| distance to nearest enemy, median px | 90–240 | 81–150 | 105–238 | 72–246 |
| speed, median px/s | 46–89 (late 0) | 73–94 (12:00+ 0–9) | 45–88 | 42–91 |
| time standing still 10:00–14:00 | 9–56% | 30–60% | 0–47% | — |

- **Confirmed: hits are rare.** Average person takes ~1–2 hits per minute. 80 versus 120 HP is 2 hits by 10:00 (hit ~22). Peak 5:00–7:00 (3.4–3.8 at 5:00–6:59 cursed solo) almost entirely from dashes and shots:
  of 114 solo hits in 5:00–7:59, 67 are foxes (`foxgirl`), 31 succubi, 10 Kitsune, 6 others. At 0:00–4:59
  harpies, cats, slimes.
- **Movement.** After 12:00 people in cursed solo stand still over half the time (median speed 0): build clears screen itself. Nearest enemy at 80–150 px (bot earlier 74–80 px, section 4).
- **Clear for people** (snapshot per minute: `en` alive in world, `k` kills): alive in world end of minute in solo
  27–130 by 5:00, 200–390 at 12:00–13:00 (at limit 400 and at winners). Enemy lifetime by Little's Law
  (alive / kills per second, from spawn beyond edge) 7–8 s by 4:00, 4–9 s later.
- **Bosses for people** (appearance to kill, median / max, old HP 240/400/1200 per level): solo normal
  Kitsune 25 / 108 s, Harpy 17 / 29 s, Dryad 37 / 49 s. Solo cursed 33 / 85, 19 / 29, 41 / 72 s.
- Limits: few people (1–3, mostly Mage). Minutes after 8:00: 3 (normal) and 10 (cursed)
  documents. Event only past hit (no evade visible). Telemetry keeps nearest enemy only so people have no "enemies on screen" count, just alive in world.

### 12.2 Metrics

**Clear** (`tools/simulation/clear.mjs`, `tools/simulation/targets.mjs`). Immortal bots (`immortal`: lethal hit returns 30% HP). Only kill measured. Builds (`profiles.mjs` `BUILD_BIAS`, bot picks passives by profile, weapons normally): **glass** attack damage type, crit, crit damage, cooldown, area, defense −4. **mid** model of people's choice without bias. **tank** 4 defensive passives (max_hp, armor, regen, dodge) +3.
Per minute: **enemy lifetime on screen** (first frame in visible 640×360 to death. Regular enemies without elite, bosses).
**Enemies on screen** (average per minute, sampled every 0.25 s, by type `--types`). TTK (first hit to death). Hits per kill. Share "one-shot". Alive in world. Time at limit 400.
Minute failure: lifetime > 8 s or > 150 enemies on screen or world at limit > 25% of minute. Run failure: two such minutes in a row. Lifetime from spawn beyond edge (~2 s more than "on screen"): this is approach time.

Goals (`docs/META.md` 1.1): mid 3–5 s on screen all run at ≤ ~120 on screen. Glass from 10:00 TTK 1–2 s
at ≥ 2 hits per kill. Tank no failure by 10:00. Bosses reported as TTK.

**Defense on paper** (`tools/simulation/defense.mjs`): hit on minute m = enemy damage per minute
(smoothed m−1…m+1 of people's source mix) × stage growth. e = max(1, hit − armor) × (1 − evade). **Buffer** =
maxHp / e hits. **Regen** = regen × 60 / e hits per minute. **3-minute window** = buffer + 3 × regen. "Extra per minute" difference from bare hero / 3. Spikes not included (that is damage). Bags: average over 40 seeds.
Random T2 (like bots) and defensive T2 (helmet/armor/belt/shield/boots, best defense item from three).

### 12.3 Defense: before and after

Extra hits in 3-minute window at 10:00 (hit 22.4) per passive level, Hero (HP 120):

| passive | before | after |
|---|---|---|
| max_hp (+20% per level, unchanged) | 1.0 | 1.0 |
| armor | +1 per level: 0.30 … 0.43 | [2.5, 4.5, 6.5, 8, 9]: 0.85 … 1.15 |
| regen | +0.2 per level: 1.5 | [0.12 … 0.60]: 0.96 |
| dodge | +3% per level: 0.21 … 0.27 | [12, 21, 29, 35, 40%]: 0.94 … 1.05 |
| defensive bag T2 (45 cells) | +2.2 (≈ 3 levels) | +9.8 (≈ 10 levels) |
| random bag T2 | +0.3 | +1.3 |

Armor and dodge steps fall because these stats are convex (hit − armor, × (1 − evade)): each level gives ≈ 1 hit. Mage (HP 80): 0.7 per level HP, armor, evade. 0.96 regen. Items: `STAT_REF`
defense equals passive L5 (maxHp 1.0, armor 9, regen 0.6, dodge 0.4. Was 0.3 / 2 / 0.35 / 0.08): large item (2×3, T2, guaranteed affix) gives ~0.7–0.9 passive level, nearly a hit, not +8 HP.

Table `defense.mjs` (Hero. Buffer / regen hits per minute / extra per minute versus bare):

| build | HP | armor | regen | evade | 6:00 (hit 17.7) | 10:00 (22.4) | 14:00 (27.3) |
|---|---|---|---|---|---|---|---|
| bare | 120 | 0 | 0.25 | 0 | 6.8 / 0.8 / — | 5.3 / 0.7 / — | 4.4 / 0.5 / — |
| medium: 10 defense levels | 192 | 6.5 | 0.49 | 21% | 21.8 / 3.3 / +7.5 | 15.2 / 2.3 / +5.0 | 11.7 / 1.8 / +3.7 |
| full: 4 passives L5 | 240 | 9 | 0.85 | 40% | 46.2 / 9.8 / +22 | 29.8 / 6.3 / +13.8 | 21.8 / 4.6 / +9.9 |
| bare + defensive bag T2 | 204 | 5.2 | 0.40 | 6% | 17.6 / 2.1 / +4.8 | 12.7 / 1.5 / +3.3 | 9.9 / 1.2 / +2.4 |

Range glass → defense (defense levels → hits in 3-minute window at 10:00): 0 → 7.4, 4 → 12.0, 8 → 18.1, 12 → 26.7,
16 → 37.0, 20 → 48.7 (Mage 5.6 → 38.8). Each passive alone linear. Together they **multiply**
(HP × damage reduction) so full defense ≈ 6.5× bare. At human 1–3 hits per minute bare Hero at 6:00
lives ~3.6 min without food. Medium defense: no limit (regen covers).

### 12.4 Clear: before and after

Validation seeds (n = 40 per cell, 480 runs), `targets.mjs`. "Before" data at task start, recovered by experiment (timeline and enemies from HEAD, boss HP 240/400/1200, `coop.enemyHpMul` 0.7, cursed 1.5, old passives, hero speed 95). "After" current data (speed 100). Cell: enemy lifetime on screen with / enemies on screen average. Failures by rule 12.2 in both columns.

Before:

| mode/build | 1:00 | 3:00 | 5:00 | 6:00 | 7:00 | 9:00 | 11:00 | 12:00 | 13:00 | 14:00 | TTK 10–14 | hits/kill 10–14 | failure by 10:00 | failure total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| normal/1/glass | 3.4 / 17 | 3.9 / 38 | 4.8 / 43 | 5.5 / 57 | 9.9 / 47 | 5.1 / 88 | 5.6 / 87 | 6.1 / 136 | 5 / 179 | 4.2 / 152 | 3.1 | 6.1 | 9/40 | 23/40 |
| normal/1/mid | 3.3 / 17 | 3.9 / 38 | 4.9 / 44 | 6.3 / 64 | 11.9 / 57 | 5.9 / 95 | 7.1 / 103 | 8.4 / 152 | 7 / 183 | 6.3 / 173 | 4.4 | 7.1 | 13/40 | 34/40 |
| normal/1/tank | 3.5 / 18 | 4.4 / 41 | 5.8 / 52 | 8.1 / 80 | 16.8 / 85 | 9.4 / 120 | 14.2 / 153 | 18 / 194 | 15.3 / 207 | 13.1 / 200 | 9.9 | 9.3 | 20/40 | 40/40 |
| cursed/1/glass | 3.8 / 26 | 4.8 / 64 | 5.7 / 73 | 7.6 / 98 | 10.9 / 69 | 4.2 / 115 | 6.3 / 121 | 6.1 / 171 | 4.8 / 194 | 4.3 / 191 | 3.1 | 6.3 | 14/40 | 40/40 |
| cursed/1/mid | 3.6 / 26 | 5.3 / 69 | 5.9 / 75 | 8.4 / 103 | 13.8 / 90 | 7.5 / 127 | 9.9 / 153 | 11.2 / 189 | 7.4 / 208 | 7.3 / 200 | 5.7 | 7.6 | 19/40 | 40/40 |
| cursed/1/tank | 4 / 27 | 5.7 / 74 | 7.3 / 88 | 11.9 / 136 | 21 / 131 | 11 / 152 | 16.8 / 180 | 19.5 / 209 | 14.6 / 198 | 13.7 / 200 | 10.6 | 9.7 | 31/40 | 40/40 |
| normal/2/glass | 2.6 / 18 | 2.8 / 38 | 2.8 / 32 | 2.8 / 37 | 3.3 / 19 | 2.8 / 79 | 3.4 / 75 | 4 / 133 | 3.7 / 183 | 3.4 / 171 | 1.8 | 4.5 | 0/40 | 37/40 |
| normal/2/mid | 2.6 / 18 | 2.8 / 38 | 2.9 / 33 | 3.2 / 42 | 3.8 / 23 | 2.9 / 84 | 3.8 / 83 | 4.8 / 151 | 4.7 / 186 | 4 / 177 | 2.4 | 5.3 | 0/40 | 40/40 |
| normal/2/tank | 2.6 / 19 | 3 / 40 | 3.3 / 38 | 3.7 / 50 | 4.9 / 31 | 3.8 / 94 | 5.6 / 109 | 7.5 / 177 | 6.4 / 198 | 5.6 / 196 | 3.6 | 6.4 | 0/40 | 40/40 |
| cursed/2/glass | 2.8 / 28 | 3.3 / 62 | 3.1 / 52 | 3.4 / 63 | 4.5 / 37 | 3.2 / 103 | 3.9 / 119 | 4.6 / 174 | 4.2 / 181 | 4.3 / 205 | 2.5 | 5.4 | 1/40 | 40/40 |
| cursed/2/mid | 2.9 / 29 | 3.3 / 61 | 3.3 / 55 | 3.6 / 70 | 5.1 / 42 | 3.3 / 107 | 5 / 137 | 6.3 / 191 | 5.1 / 199 | 5.4 / 202 | 2.8 | 5.8 | 0/40 | 40/40 |
| cursed/2/tank | 3 / 29 | 3.2 / 61 | 3.4 / 57 | 4.1 / 77 | 5.9 / 51 | 4 / 116 | 7.3 / 167 | 8.6 / 191 | 7.3 / 192 | 7.8 / 202 | 4.6 | 7.3 | 0/40 | 40/40 |

After:

| mode/build | 1:00 | 3:00 | 5:00 | 6:00 | 7:00 | 9:00 | 11:00 | 12:00 | 13:00 | 14:00 | TTK 10–14 | hits/kill 10–14 | failure by 10:00 | failure total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| normal/1/glass | 3.2 / 17 | 3.7 / 36 | 3.5 / 28 | 3.5 / 35 | 4.4 / 21 | 2.9 / 71 | 3.2 / 40 | 3.5 / 63 | 3.2 / 99 | 2.7 / 76 | 1.7 | 4.1 | 0/40 | 0/40 |
| normal/1/mid | 3.3 / 17 | 4.1 / 39 | 3.9 / 30 | 3.9 / 39 | 5.2 / 24 | 3.4 / 77 | 4.1 / 50 | 4.6 / 78 | 4.1 / 117 | 3.8 / 91 | 2.4 | 5.0 | 4/40 | 6/40 |
| normal/1/tank | 3.4 / 17 | 3.9 / 39 | 4.3 / 31 | 4.1 / 40 | 5.7 / 26 | 4.4 / 85 | 5.8 / 71 | 8.1 / 119 | 7.8 / 158 | 7.8 / 129 | 4.2 | 6.1 | 3/40 | 19/40 |
| cursed/1/glass | 3.6 / 24 | 4.2 / 54 | 4.1 / 43 | 4.1 / 56 | 6 / 34 | 3 / 97 | 3.9 / 63 | 4.3 / 97 | 4.1 / 142 | 3.5 / 119 | 1.9 | 4.6 | 4/40 | 8/40 |
| cursed/1/mid | 3.7 / 24 | 4.4 / 59 | 3.7 / 40 | 3.9 / 56 | 5.5 / 35 | 3.3 / 101 | 4.6 / 73 | 5.4 / 111 | 4.4 / 155 | 4.2 / 131 | 2.6 | 5.5 | 4/40 | 9/40 |
| cursed/1/tank | 3.8 / 25 | 5.2 / 63 | 5.1 / 54 | 6 / 75 | 11.1 / 54 | 5.3 / 119 | 8.2 / 114 | 11.2 / 164 | 10.5 / 185 | 8.6 / 166 | 5.6 | 7.1 | 9/40 | 34/40 |
| normal/2/glass | 2.8 / 19 | 3.1 / 41 | 2.7 / 30 | 2.7 / 36 | 2.9 / 18 | 2.5 / 84 | 3 / 46 | 3.4 / 76 | 3.3 / 124 | 3.1 / 102 | 1.8 | 4.2 | 0/40 | 0/40 |
| normal/2/mid | 2.7 / 19 | 3.1 / 40 | 2.8 / 31 | 2.9 / 39 | 3.3 / 21 | 2.7 / 85 | 3.4 / 53 | 4 / 89 | 3.8 / 135 | 3.7 / 115 | 2.2 | 5.1 | 0/40 | 2/40 |
| normal/2/tank | 2.8 / 20 | 3.3 / 43 | 3.1 / 33 | 3.3 / 45 | 4 / 26 | 3.4 / 98 | 5 / 74 | 7.2 / 138 | 7.1 / 173 | 6.7 / 148 | 3.8 | 6.3 | 0/40 | 21/40 |
| cursed/2/glass | 3.1 / 27 | 3.6 / 61 | 2.9 / 45 | 3.1 / 56 | 3.2 / 28 | 2.5 / 110 | 3.2 / 70 | 4.1 / 119 | 3.7 / 166 | 3.4 / 143 | 1.9 | 4.4 | 1/40 | 13/40 |
| cursed/2/mid | 3 / 27 | 3.6 / 60 | 3 / 45 | 3.3 / 60 | 3.8 / 33 | 2.7 / 111 | 4.1 / 85 | 5.2 / 137 | 4.9 / 176 | 5 / 164 | 3.1 | 5.6 | 0/40 | 28/40 |
| cursed/2/tank | 3 / 27 | 3.6 / 61 | 3.4 / 49 | 4 / 72 | 5 / 43 | 3.2 / 121 | 5.8 / 113 | 8 / 171 | 7.2 / 193 | 6.7 / 181 | 3.9 | 6.5 | 0/40 | 38/40 |

Summary (normal solo): medium build holds 3.3–5.2 s on screen the whole run (before: 6–12 s from 6:00, at world limit from 12:00). Enemies on screen ≤ 117 (before: to 183). Mid failures 6/40 (before 34/40). By 10:00: 4/40 (before 13/40). Glass kills from 10:00 in 1.7 s from first hit with 4.1 hits per kill (before 3.1 s / 6.1). Tank clears noticeably slower (7–8 s from 12:00), fails mostly after 11:00 (before 10:00: 3/40, was 20/40). Duo like solo, was twice as fast (2.4–4.8 s at HP × 0.7). Cursed harder: more on screen. Mid fails 9/40 solo, 28/40 duo. Mostly after 12:00.

Bosses (bot, HP per level at spawn. TTK median / max, s):

Before:

| mode/build | Kitsune: HP, TTK med/max | Harpy: HP, TTK | Dryad: HP, TTK, killed | L |
|---|---|---|---|---|
| normal/1/glass | 4800, 57.4/256.3 | 15200, 25.4/54.8 | 76800, 56.2/106, 37/40 | 70 |
| normal/1/mid | 4800, 69.2/169.4 | 15600, 36.3/178.2 | 72000, 70.7/117.2, 33/40 | 70 |
| normal/1/tank | 4560, 99.5/243.9 | 14000, 56.9/107.9 | 62400, 86.6/119.6, 29/40 | 57 |
| cursed/1/glass | 5520, 58.2/381.7 | 17200, 24.6/170.2 | 88800, 67.6/102.8, 39/40 | 79 |
| cursed/1/mid | 5520, 67.4/248.3 | 16000, 36.6/81.5 | 81600, 71.6/115.1, 33/40 | 75 |
| cursed/1/tank | 5280, 108.8/247.5 | 15200, 59.8/170.5 | 67200, 92.8/112.4, 28/40 | 62 |
| normal/2/glass | 2880, 24.5/45.7 | 9440, 14.3/23 | 45120, 46.4/93.2, 40/40 | 101 |
| normal/2/mid | 2880, 25.8/47.1 | 9280, 16.5/35.6 | 46080, 50.4/94.6, 40/40 | 99 |
| normal/2/tank | 2784, 34/66 | 8640, 21.8/41.6 | 40320, 62.4/116.8, 39/40 | 91 |
| cursed/2/glass | 3360, 22/58.4 | 10560, 14.4/33.2 | 48960, 53.8/95.3, 40/40 | 110 |
| cursed/2/mid | 3264, 26.1/63.4 | 11200, 15.7/34.7 | 49440, 53.6/91.3, 38/40 | 110 |
| cursed/2/tank | 3264, 32/64.3 | 10400, 25/42.3 | 44160, 73.3/109.4, 39/40 | 99 |

After:

| mode/build | Kitsune: HP, TTK med/max | Harpy: HP, TTK | Dryad: HP, TTK, killed | L |
|---|---|---|---|---|
| normal/1/glass | 5000, 40.6/102.4 | 18500, 22.7/41.2 | 61000, 35.5/75.1, 40/40 | 63 |
| normal/1/mid | 5000, 48/169.5 | 19500, 32.3/107.4 | 58000, 51.6/110, 39/40 | 63 |
| normal/1/tank | 5000, 62.3/155.2 | 18500, 47/105.4 | 54000, 65.6/118.5, 37/40 | 59 |
| cursed/1/glass | 5500, 46.4/132.6 | 21500, 22.2/62.4 | 68000, 45.3/116, 38/40 | 72 |
| cursed/1/mid | 5500, 42.1/138.7 | 21000, 30.1/136.9 | 68000, 59/111.3, 39/40 | 72 |
| cursed/1/tank | 5250, 67.2/183.1 | 19500, 53.1/177.7 | 57000, 79.4/117.8, 37/40 | 65 |
| normal/2/glass | 2800, 22/37.8 | 11000, 15.2/32.6 | 34800, 28.1/76.8, 40/40 | 89 |
| normal/2/mid | 2900, 24.1/40.4 | 11000, 19.3/29.1 | 35200, 35.9/61.9, 40/40 | 90 |
| normal/2/tank | 2800, 27.2/56.3 | 10800, 27.2/48.7 | 32400, 47.5/116.2, 40/40 | 85 |
| cursed/2/glass | 3200, 20.8/47.4 | 12600, 14.2/29.8 | 39600, 33.3/61.2, 40/40 | 102 |
| cursed/2/mid | 3200, 25.6/50.6 | 12800, 19.3/39.7 | 38400, 43.4/92, 40/40 | 100 |
| cursed/2/tank | 3300, 28.4/63.4 | 12000, 27.5/49 | 35200, 52/97.9, 39/40 | 94 |

Bots take longer on bosses than people (people: Kitsune 25–33 s, Harpy 17–19 s, Dryad 37–41 s on old HP): bot does not chase boss, walks for experience. Reaper (750 × level) not measured by this metric: needs Bible scenario.

### 12.5 What changed

- **Gating** (`src/core/director.js`, field `afterBoss`, `docs/CONTENT.md`): foxes (`foxgirl`, dash) after 1st boss kill. Succubi (archers) after 2nd. Kitsune's summon of foxes remains. Early succubus streams (4:10–11:00) replaced with bunnies and cats. Elite succubus at 8:00 replaced with elite bunny. At 10:00 weak succubus stream added (`afterBoss: 2`). Tests `tests/unit/director.test.js`.
- **Timeline 10:00–15:00** (`stages/forest.js`): minimums alive × 0.6 (from 12:30 also × 0.85). Spawn frequencies × 0.85
  (from 12:30 also × 0.8). One-off events × 0.85 (from 12:30 also × 0.8). Succubi at 12:00 frequency also × 0.5. Lamiae
  (streams and walls) minimum × 0.6, frequency × 0.7. Before, minimums alone filled world to 400 limit by 13:00
  in any clear.
- **Enemies** (`enemies.js`, `forest.scaling`): lamia HP 700 → 500. Fox 160 → 140. HP growth 0.133 → 0.11 per minute.
- **Modes**: `coop.enemyHpMul` 0.7 → 1.0 (duo cleared twice as fast as solo), `cursed.spawnMul` 1.5 → 1.4.
- **Bosses** (`bosses.js`, owner numbers): hpPerLevel Kitsune 240 → 250, Harpy 400 → 500, Dryad 1200 → 1000,
  Reaper 1300 → 750.
- **Passives** (`passives.js`): attack/magic +10% → +15% per level (glass ↔ mid range wider). Armor, regen,
  dodge per table 12.3. **Items** (`items.js` `STAT_REF`): defense = passive L5.
- **Tools**: `tools/telemetry/hits.mjs`, `tools/simulation/clear.mjs`, `defense.mjs`, `targets.mjs`
  (rewritten: clear per builds instead of boss kill rate), `profiles.mjs` (`BUILD_BIAS`, `BUILD_PROFILES`),
  `policy.mjs` (passive choice by build), `runner.mjs` (`config.clear`), `experiment.mjs` (fields enemies, bosses,
  timeline, scaling, passives, difficulty).
- **Tests**: `stats.test.js` took armor L5 = 5 and attack L5 = 0.5 by number. Now from `PASSIVES`.
  `sim.test.js` cursed "spawn > 1.3× normal" → "> 1.2×" (spawnMul 1.4, first minute ~1.29× from rounding).
  `system.test.js`: changed input now rejected as impossible screen command before checkpoint divergence. Regex accepts both.

### 12.6 Unresolved

- Armor and dodge multiply with HP: full defense (4 × L5) ≈ 6.5× bare, with defensive bag ≈ 14×. Armor 14 at 3:00 reduces hits to 1. Linear range "together" requires different formula (armor as percentage with diminishing or shared cap on damage reduction). Fix `core/stats.js` / `sim.hurtPlayer`. Owner decision.
- `STAT_REF` attack and magic on items 0.5 = 2/3 of new passive L5 (0.75): not raised. Bags not measured by clear.
- "3–5 s" understood as enemy lifetime **on screen** (first frame in visible). From spawn edge +~2 s approach.
  From first hit (TTK) mid is 2–3 s late. "1–2 s" for glass is TTK. If owner meant something else,
  goals recalculated same table.
- Cursed duo fails after 12:00 at mid in most runs (on screen 165–176): left as mode difficulty. If "cursed passable at mid" needed,
  next lever: 12:30–14:00 minimums × spawnMul.
- Bots slower than people on bosses (do not chase). TTK for people on new HP appears with new telemetry.

### 12.7 Reproduction

```bash
node tools/telemetry/export.mjs --out tools/out/telemetry-fresh       # public export fury_runs
node tools/telemetry/hits.mjs docs/simulation-evidence/telemetry-2026-10-24.json.gz \
  tools/out/telemetry-fresh/runs.json --json docs/simulation-evidence/human-hits-2026-10-27.json
node tools/simulation/defense.mjs [--hero heroine] [--window 3]
node tools/simulation/targets.mjs --n 16 --modes normal/1 --workers 30 [--types]         # tuning, fast
node tools/simulation/targets.mjs --n 40 --split validation --modes normal/1,cursed/1,normal/2,cursed/2 \
  --workers 30 --out tools/out/clear/after-validation.json                               # result, ~25 min
```

"Before" uses the same script with `--experiment` (fields `timeline`, `scaling`, `enemies`, `bosses`, `coop`,
`difficulty`, `passives` and `heroStats`), built from `git show HEAD:src/data/...`.
## 13. Clear from hero frame, weapon ladder, defense as percentage (2026-10-27)

Phase 1: tools and measurements on the committed state (16b2cd9, section 12) before mechanic rework (resistance instead of armor, DoTs, cloud, beam). Number tuning is phase 2, below.

### 13.1 Metric: life from entry into frame

Owner: count mob life as "from the moment it enters a certain range of the Hero", otherwise balance gets anchored to ranged weapons (they hit mobs past the screen edge). The `CLEAR` frame in `src/data/constants.js`: 400 × 240 px of world around the Hero (~64% of screen width and 2/3 of height). `tools/simulation/clear.mjs`: **life in frame** means from the first entry of hitbox into frame until death (mobs killed before the frame does not count, their share is "before frame %"), **enemies in frame** is the average per minute; in coop life is counted from entry into frame of any Hero, the count is the average across hero frames. Old "on screen" and "from spawn" remain for comparison. Telemetry from players: in `movement` and in snaps `snaps.ef = [average, maximum]` enemies in frame per minute (`src/core/telemetry.js`, field added in v3 without version change; `tools/telemetry/hits.mjs` outputs it and life in frame by Little's law). Human data with `ef` is not yet available.

Thresholds (`targets.mjs` `CLEAR_TARGETS`): goals are the same (mid 3–5 s, glass from 10:00 TTK 1–2 s at ≥ 2 hits, tank without failure through 10:00). Failure in a minute: life in frame > 8 s, or > 60 enemies in frame, or world limit > 25% of the minute, or crowd growing (in frame ≥ 30 and 1.5 times larger than last minute with life > 5 s); failure in a run is 2 consecutive minutes. 60 in frame ≈ 150 on screen: on the same runs, in frame is 0.36–0.5 of the screen.

Same run as 12.4 (validation, n = 40, HEAD). Cell: life in frame, s / enemies in frame (on screen in parentheses):

| mode/build | 3:00 | 5:00 | 7:00 | 9:00 | 11:00 | 13:00 | 14:00 | TTK 10–14 | hits/kill | fail before 10 / total |
|---|---|---|---|---|---|---|---|---|---|---|
| normal/1/glass | 2.1/18 (3.7/36) | 2.0/12 | 2.7/10 | 1.4/28 | 1.7/14 | 1.6/31 | 1.4/27 (2.7/76) | 1.7 | 4.1 | 0 / 0 |
| normal/1/mid | 2.5/20 (4.1/39) | 2.4/14 | 3.4/13 | 1.8/32 | 2.5/20 | 2.3/42 | 2.4/36 (3.8/91) | 2.4 | 5.0 | 3 / 4 |
| normal/1/tank | 2.5/20 | 2.7/15 | 3.7/15 | 2.5/39 | 3.7/33 | 5.2/60 | 5.2/56 (7.8/129) | 4.2 | 6.1 | 1 / 17 |
| cursed/1/mid | 2.7/30 | 2.2/18 | 3.6/17 | 1.9/40 | 3.0/29 | 2.6/55 | 2.5/52 | 2.6 | 5.5 | 4 / 10 |
| cursed/1/tank | 3.2/33 | 3.3/26 | 8.2/30 | 3.1/52 | 5.5/48 | 7.3/71 | 5.7/67 | 5.6 | 7.1 | 9 / 34 |
| normal/2/mid* | 2.1/25 | 1.9/18 | 2.3/14 | 1.5/40 | 2.2/29 | 2.4/63 | 2.3/59 | 2.2 | 5.1 | 0 / 14 |
| normal/1/bag2/mid | 2.1/17 | 1.8/10 | 2.1/8 | 1.3/26 | 1.7/14 | 1.6/34 | 1.6/32 | 1.8 | 4.4 | 1 / 1 |
| normal/1/dmg2/mid | 2.1/17 | 1.8/10 | 2.2/8 | 1.3/25 | 1.7/13 | 1.8/34 | 1.9/33 | 1.8 | 4.1 | 0 / 2 |

\* duo in this run was counted as union of two frames (overstates the crowd, hence 14/40); now the count is the average across Heroes, duo is recalculated in phase 2.

A mob entering the frame lives roughly 1.5 s less than "on screen": the average build right now is 1.8–3.4 s, below the goal of 3–5 s. For the new metric and the same goals, offense needs to weaken (or reconsider the goal: owner's call). Glass meets the goal (TTK 1.4–1.9 s, 4 hits). Tank clears half as well as mid after 11:00, does not fail before 10:00.

### 13.2 Weapon ladder: formula

`tools/simulation/ladder.mjs`. The goal is weapon strength relative to the anchor (Blade Arc L5; evolutions are Crimson Arc):

```
target(w) = f(R) × Q,   f(R) = 1 / (1 + k · ln(max(R, r0) / r0)),  k = 0.6,  r0 = R of anchor (115 px)
Q = 1 / (1 + Σ q_i)
```

**R** is the range at which the weapon starts hitting, from behavior data: slash and aura use `area`, orbit uses `area + hitRadius`, axe uses `area`, chain uses `range`, beam uses `area`, projectiles use `min(targetRange, speed × duration)`, bombs and meteor use `targetRange` of the throw, mines use `spread + trigger`, wisps use fire range plus orbit. The max level is used: the rule is about range between weapons, not radius growth across levels.

**f is logarithmic**: R = 2.5 × r0 gives 0.65, 3 × r0 gives 0.6. Power law (r0/R)^α with α ≥ 0.5 stretches the gap to 3× or more: controlled area grows as R², but the number of targets and time to contact is nearly linear. Diminishing returns like in RPGs: rating becomes a percentage through x / (x + k) (WoW, PoE: armor A / (A + 5·D)), D3/D4: armor / (armor + 50·level), LoL: 100 / (100 + armor). VS and HoloCure have no formula, weapons are tuned by hand with a DPS meter; the formula sets the shape, not exact numbers.

**Quirks combine as a hyperbola** 1 / (1 + Σq) (the same x / (x + k)): many properties do not drive damage to zero. q values: knockback for ranged weapons 0.10, heavy knockback for melee ≥ 200 is 0.10, slow 0.15, pierce 0.04 per target (up to 4), pierces all 0.20, DoT 0.15 × chance (ground fire is full), homing (chain) 0.15, autoaim (wisps) 0.10, projectile block 0.15, hits in circle without aim (aura, orbit, cloud) 0.15, trap (mines) 0.10; drawbacks with minus: long windup ≥ 0.9 s is −0.10, random direction (beam) is −0.10. Numbers are in `LADDER` in `ladder.mjs` (tool, not game).

### 13.3 Ladder: now versus goal

Two measurements. **Lab** (`ladder.mjs --lab`, n = 16, 2:00–9:59): immortal Hero with attack = magic = 1, one weapon at max level, one weapon slot, only defensive passives and pickup, skips chests. "Lab" is clear strength 1 / (life in frame) relative to the anchor: one weapon's damage per second hits the mob inflow limit (most 450–640), but life in frame does not. **Bots** (`ladder.mjs --bots`, normal/1/mid from 13.1, 10:00–14:59): damage per second of ownership at max level without stat, * means less than 20 min of ownership in total.

| weapon | R | quirks | goal | lab | life in frame, s / in frame | bots |
|---|---|---|---|---|---|---|
| blade_arc | 115 | — | 1 | 1 | 6.3 / 31 | 1 |
| hammer | 115 | heavy knockback | 0.91 | 0.75 | 8.1 / 33 | 0.66 |
| holy_ground | 105 | omni | 0.87 | 0.88 | 7.3 / 36 | 0.60 |
| poison_cloud | 105 | omni | 0.87 | 1.06 | 5.9 / 31 | 0.73 |
| mines | 126 | trap | 0.86 | 0.81 | 7.7 / 30 | 0.84 |
| guardian_shields | 77 | block, omni | 0.77 | 0.44 | 14.3 / 67 | 0.35 |
| frost_orb | 94 | slow, omni | 0.77 | 0.63 | 9.8 / 44 | 0.34 |
| beam | 155 | pierces all, random | 0.77 | 0.38 | 17.4 / 59 | 0.47 |
| war_axe | 185 | knockback | 0.71 | **1.38** | 4.6 / 25 | 0.74 |
| meteor | 300 | windup | 0.71 | 0.81 | 7.6 / 31 | 0.43 |
| firebomb | 300 | fire | 0.55 | **1.06** | 6.0 / 28 | 0.74 |
| storm_chain | 290 | knockback, homing | 0.51 | 0.69 | 9.0 / 39 | 0.73 |
| wisp | 282 | knockback, pierce, autoaim | 0.51 | 0.75 | 8.2 / 44 | 0.76 |
| crossbow | 360 | knockback, pierce 2 | 0.50 | 0.25 | 26.9 / 92 | 0.63 |
| throwing_daggers | 360 | knockback, pierce 3 | 0.49 | 0.81 | 7.5 / 34 | 0.71 |
| spear | 360 | knockback, pierces all | 0.46 | **0.88** | 7.3 / 28 | 0.76 |
| crimson_arc | 115 | — | 1 | 1 | 5.8 / 29 | 1 |
| titan_maul | 130 | heavy knockback | 0.85 | 1.47 | 4.0 / 24 | — |
| miasma | 130 | omni | 0.81 | 1.29 | 4.5 / 24 | 1.05 |
| minefield | 148 | trap | 0.79 | 1.41 | 4.1 / 22 | 1.45* |
| aegis_bastion | 59 | block, omni | 0.77 | **0.18** | 35.6 / 116 | 1.44* |
| blizzard | 87 | slow, omni | 0.77 | 0.76 | 7.9 / 42 | 0.87* |
| starfall | 300 | windup | 0.71 | 1.41 | 4.2 / 26 | 1.34* |
| prism_ray | 190 | pierces all, random | 0.70 | 1.12 | 5.3 / 24 | — |
| soul_garden | 150 | knockback, omni | 0.69 | **1.53** | 3.8 / 20 | 2.21* |
| death_spiral | 210 | knockback | 0.67 | 1.29 | 4.6 / 24 | 0.89* |
| napalm_rain | 300 | fire | 0.55 | 1.29 | 4.5 / 23 | 1.70* |
| spirit_choir | 282 | knockback, pierce, autoaim | 0.51 | 0.71 | 8.4 / 41 | 1.01* |
| thunder_loop | 320 | knockback, homing | 0.50 | 1.12 | 5.4 / 19 | 1.43 |
| thousand_edge | 360 | knockback, pierce 3 | 0.49 | 0.88 | 6.5 / 31 | 1.56 |
| ballista | 360 | knockback, pierce 4 | 0.47 | 0.59 | 9.8 / 37 | 1.77* |
| dragon_lance | 360 | knockback, pierces all | 0.46 | 1.12 | 5.4 / 23 | 1.31* |

The rule does not hold right now (owner is right): Spearman rank correlation "range versus strength" in lab is +0.13 for base weapons and +0.01 for evolutions, for bots it is +0.11…+0.39 (for "farther = weaker" need around −1). Blade Arc is not the strongest: axe, cloud, bomb, and spear clear better; for evolutions the ranged ones (thunder_loop, thousand_edge, ballista, dragon_lance) are 1.3–1.8 times stronger than Crimson Arc in bots. Broken separately: aegis_bastion (life in frame 36 s, shields alone almost cannot kill), crossbow (27 s), beam (17 s), shields (14 s); soul_garden and titan_maul are 1.5 times stronger than the anchor. Mines are not the worst (0.81 lab, 0.67–0.84 for bots); check after new mechanics (`mineArm`, area 70–92).

### 13.4 Defense: resistance as percentage

`tools/simulation/defense.mjs` reads everything from data: the reduction stat (`resistance` if in `STATS`, else old `armor`), caps `STAT_CAPS`, `COMBAT.minDamage`, defensive passives by stat, defensive item types by implicit. Hit is e = max(minDamage, d × (1 − resistance)) × (1 − dodge); buffer = HP / e; window 3 min = buffer + 3 × regen × 60 / e. New checks: per-level growth for each passive, additivity (all four L5 together versus sum alone) and band 0 to 20 levels with last-step to first-step ratio.

On the working tree (resistance [0.12 … 0.40], cap 0.65; Hero, 10:00, hit 22.4), hits per level: max_hp is 1.07 at each level, resistance is 1.00 / 0.95 / 1.05 / 0.96 / 0.94, regen is 0.96, dodge like resistance.

Each source alone is linear (about +1 hit per level). Together it is not: four L5 give +41 hits versus a sum of +20 (additivity 2.07×, for Mage 2.10×), band 0 to 20 levels: 7.4 to 48.6, last step is 2.8 times larger than the first. Reason: the product HP × 1/(1 − res) × 1/(1 − dodge); percentage with cap does not fix this.

Defensive bag T2 is about +10 hits (about 10 levels of passives): `STAT_REF` for defense = passive L5, a bag is many items. Full defense plus defensive bag T2: resistance 0.62 (at cap), 68 hits for the window (9 times naked).

Linear and together would only come from a formula of "one pool of durability": all defense sources fold into one rating T, hit × 1 / (1 + T) (like LoL armor: each point adds 1% EHP), and HP-passive goes into T too. Then window = HP₀ (1 + T) / d + regen, exactly the sum of contributions. This is a mechanic change (`core/stats.js`, `sim.hurtPlayer`), owner's call.

Owner's decision (27.10): defense stays as is—resistance as percentage with cap multiplies with HP, dodge, and regen (like PoE: armour/evasion/life multiply; Brotato: armor x / (x + k) × HP; VS: flat armor × HP). Linearity per stat alone matters (+N hits per level), we do not linearize "together", we do not do one pool 1 / (1 + T) (`docs/META.md` 1.5).

### 13.5 Attack and magic on items (question D)

Bags T2 on paper (40 seeds, Hero): random is attack +10%, magic +9% (about 0.7 level of passive), attacking (best of 3 items by attack + magic) is +26% / +21% (about 1.7 / 1.4 levels). Clear (13.1, normal/1/mid): any bag T2 speeds up the late clear by about 25% (TTK 10–14: 2.4 to 1.8 s, life in frame 2.4 to 1.6–1.9 s), failures 4 to 1–2 of 40; attacking is no better than random (TTK 1.8 both). Attack on items is not the main lever: a bag is strong because of the sum of small stats. Proposal: keep attack/magic on items with `STAT_REF` 0.5 (about 2/3 of passive L5 on a full roll), keep bag strength as common `ITEM_POWER.scale`; final answer in phase 2 by the same comparison on new mechanics.

### 13.6 Also done

`tools/simulation/record.mjs`: immortal bots read `COMBAT.armorMinDamage` and `stats.armor`; after renaming to `minDamage` / `resistance` the check gave NaN and immortal bots died (broke `tests/simulation/system.test.js`). Now same as `sim.hurtPlayer`, with old variant for snapshots.

Bots: passive id `resistance` added next to `armor` in `features.mjs`, `policy.mjs`, `profiles.mjs` (else tank took 3 defensive passives instead of 4).

`bags.mjs`: filter items by stats (`stats`); `targets.mjs`: modes `…/bag2`, `…/dmg2`, table of weapons by windows (damage per second of ownership, no stat, with overkill, hit distance); `runner.mjs`: `fixture.weaponSlots`, ready profile as object; `policy.mjs`: profile `allow` (lab).

### 13.7 Reproduction

```bash
node tools/simulation/ladder.mjs                                  # paper: R, quirks, goal
node tools/simulation/ladder.mjs --lab --n 16 --workers 16 --out tools/out/ladder/lab.json   # ~10 min
node tools/simulation/targets.mjs --n 40 --split validation \
  --modes normal/1,cursed/1,normal/2,cursed/2,normal/1/bag2,normal/1/dmg2 --workers 30 --out tools/out/clear/f.json
node tools/simulation/ladder.mjs --bots tools/out/clear/f.json --key normal/1/mid --window late
node tools/simulation/defense.mjs --hero heroine --minute 10
```

Phase 1 was run on snapshot HEAD (`git archive HEAD src tools/simulation`) with new tools and `CLEAR`: the working tree was changing with mechanic rework at that time.

### 13.8 Owner rules for phase 2

Mines "almost one-shot mobs": random drop radius is larger and damage higher, mine always lands and arms through `mineArm` 0.5 s. Goal: almost one-shot a normal mob of its minute.

Lightning (storm_chain) on all levels up to dagger level, daggers slightly stronger (spread versus chain with knockback). Bosses knockback nothing: in `sim.js` knockback only when `!e.boss && resist < 1`, all bosses have `knockbackResist: 1` (verified).

Mage starting weapon is wisp (bots take starting weapon from `heroes.js`).

Spear: one projectile, aims, pierces N, strong; beam: random, pierces all, weak; frost orb: large slow weak ball, pierces all, freezes.

### 13.9 Phase 2: number tuning (2026-10-27)

Mechanics at tuning time: resistance as percentage (cap 0.65), statuses poison/burning/bleeding/chill (bosses immune to statuses and knockback), cloud, random-direction beams, `slam` (hammer), `impale` (spear), `ice_orb` (frost orb), `slash` (Blade Arc), mines 30 s with 0.5 s arm time, skill chest (+1 random passive and weapon) only from elites, Mage starts with wisp. Tuning is on tuning seeds (lab `ladder.mjs --tune`, bots `targets.mjs` n = 24), result is one run on validation (n = 40 per cell). "Before" is the working tree at the start of phase 2 (same mechanics, old numbers).

The ladder anchor is absolute. During tuning Blade Arc became `slash`; the new blade is 2.3 times stronger in lab than the old one (mob in frame 2.7 s vs 6.3), Crimson Arc is 3 times. To keep blade changes from moving the ladder, goals are computed from the old blade L5 strength (`LADDER.anchorPower` 0.16, evolutions 0.19), and the blade itself is checked against the same anchor. Blade and Crimson Arc numbers in `src/data` were not changed (the slash agent owns them); the recommendation below, all "after" runs were done with it through experiment (`tools/out/p2/blade-rec.json`).

| | recommendation (damage per level) | now in data | lab |
|---|---|---|---|
| blade_arc | 6, 8, 10, 12, 14 | 20, 26, 30, 40, 48 | ×0.4 damage = anchor (6.2 s in frame); with shared ×0.75—0.81 of anchor |
| crimson_arc | 11 | 58 | ×0.4 still 1.6× anchor of evolutions, need about ×0.2 |

With the current blade the whole run is twice as fast as goal (mid 1.1–1.7 s in frame, blade and Crimson Arc 30–40% of damage).

**What changed in `src/data`:**

`weapons.js` all weapons except blade_arc and crimson_arc: damage (or cooldown where damage is overkill or set by rule: spear, crossbow, ballista, dragon_lance, mines, minefield, beam, prism_ray) tuned by lab under the ladder 13.2 with absolute anchor, then shared level growth (L1–L2 ×0.75, L3 ×0.8, L4 ×0.78, L5 ×0.75 from intermediate, evolutions ×0.7). Separately: mines damage 40/55/90/125/160 (nearly one-shot mob of its minute at attack ~1.3–1.6: median mob HP in frame 35 at 3:00, about 220 at 10:00), strength held by cooldown (L5 5.7 s); minefield damage 200, mine life 40 to 15 s; shields hitRadius ×1.4; aegis_bastion ring 2, hitRadius 24, no knockback (with knockback 160 enemies fly out of the ring, strength was 0.16 of goal at any damage); lightning knockback 50–60 (was 20–25: mob displacement per hit is about knockback / `COMBAT.knockbackDecay`, 2 to 5–6 px), thunder_loop 65; wisp L1 damage 22, cooldown 0.8, pierce 1 (was 29 / 0.9 / 0: starting weapon cleared 0–3 min 4.5 times worse than blade L1; with two wisps it matches, owner kept one wisp); beam damage per tick higher (16–36), beams rarer (cooldown 6.0 to 4.7 s).

`passives.js` attack and magic +20% per level (was +15%), crit +8% (was +5%), crit_dmg +40% (was +20%): otherwise glass does not separate from mid (skill chests hand out passives equally to both, mid by human model also picks attack).

`stages/forest.js` exactly 8 elites (skill chests): 2:00, 4:20, 6:40, 8:00, 9:20, 11:30, 13:00, 14:20 (one before each boss), no `afterBoss`; was 8 elites + 2 chests from bosses through 15:00 (10). 6–8 min window easier: foxes `rateEnd` 0.89 to 0.55, rabbits 6:00 are 0.35–0.53 to 0.3–0.45, lamias from 7:00 to 8:00 and 0.13–0.31 to 0.1–0.25. From 12:00 flows (frequencies and minimums) are ×0.8, one-time events ×0.9: otherwise mid at 13:00 hit 60 enemies in frame.

`bosses.js` boss `drop: 'chest'` was already removed by the loot agent; comment format fixed.

### 13.10 Clear: before and after (validation, n = 40)

Cell: life in frame, s / enemies in frame. Failures by rule 13.1.

| mode/build | | 1:00 | 3:00 | 5:00 | 7:00 | 9:00 | 11:00 | 13:00 | 14:00 | TTK 10–14 | hits/kill | fail before 10 | fail total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| normal/1/glass | before | 2.5/11.7 | 2.6/22.8 | 2.5/16.7 | 2.4/9.4 | 1.3/25.6 | 1.5/11.4 | 1.3/24.8 | 1.3/22.9 | 1.3 | 3.4 | 3/40 | 3/40 |
| | after | 2/9.2 | 2/16.6 | 1.9/11.9 | 2/5.6 | 1.3/24.3 | 1.7/12.9 | 1.5/26 | 1.6/25.8 | 1.9 | 4.8 | 0/40 | 0/40 |
| normal/1/mid | before | 2.6/12 | 2.6/22.2 | 3.4/16.3 | 2.8/11.5 | 1.5/29.2 | 2.1/16 | 2.1/36.4 | 2/33.3 | 1.9 | 4.1 | 2/40 | 4/40 |
| | after | 2/8.9 | 2.3/18.2 | 2.2/13 | 2.8/7.9 | 1.5/29.1 | 2.8/20.5 | 2.8/40.7 | 2.6/38.3 | 3.0 | 6.3 | 0/40 | 5/40 |
| normal/1/tank | before | 2.7/12.4 | 3.6/26.1 | 3.7/21.3 | 6.9/19.9 | 2.7/43 | 4.5/29.5 | 4/54.3 | 4.3/49.9 | 3.6 | 5.8 | 6/40 | 14/40 |
| | after | 2.2/9.8 | 2.9/20.4 | 2.9/16.3 | 4.2/12.2 | 2.4/37.1 | 5.7/33.2 | 6/57.8 | 6.4/55.3 | 5.9 | 8.8 | 0/40 | 20/40 |
| cursed/1/glass | before | 4.4/26.2 | 5.6/42.1 | 3.6/24.1 | 5.2/19.9 | 1.7/39.7 | 2.4/19.2 | 1.8/36.3 | 1.8/35.5 | 1.7 | 3.7 | 10/40 | 10/40 |
| | after | 2.2/12.9 | 2.6/25.7 | 2/16.3 | 2.4/8.8 | 1.3/34.8 | 1.9/18.4 | 1.8/40.4 | 1.8/39.6 | 1.9 | 4.4 | 2/40 | 4/40 |
| cursed/1/mid | before | 4.2/25.8 | 5.9/38.5 | 4.6/26.8 | 4.5/20.9 | 1.7/41.8 | 2.2/23.4 | 2/49.7 | 2/49.8 | 2.2 | 4.9 | 11/40 | 18/40 |
| | after | 2.4/13.2 | 3.2/27.7 | 2.5/18.7 | 3.4/11.5 | 1.5/38.3 | 2.8/25.7 | 2.6/54.7 | 2.7/54.2 | 3.2 | 7.1 | 4/40 | 15/40 |
| cursed/1/tank | before | 4.4/26.2 | 6.2/45.5 | 7.9/34.6 | 7.2/28.7 | 3.2/49.2 | 4.5/39.7 | 4.3/60.4 | 4/59.8 | 4.0 | 6.0 | 11/40 | 25/40 |
| | after | 2.6/14.1 | 3.6/30.7 | 4/26.3 | 7.1/21.2 | 2.8/53.9 | 7.2/47.1 | 7.3/67.2 | 7.1/67 | 7.2 | 9.6 | 10/40 | 30/40 |
| normal/2/mid | before | 2.2/10.2 | 2.2/20.2 | 1.9/13.3 | 2.2/8.6 | 1.4/31.5 | 2/15.9 | 2/41.2 | 2/41.5 | 1.9 | 4.7 | 0/40 | 0/40 |
| | after | 1.8/7.8 | 1.7/15 | 1.9/11.2 | 1.9/5.1 | 1.2/24.7 | 2.2/16.7 | 2.2/43.1 | 2.5/42.9 | 2.5 | 6.9 | 0/40 | 1/40 |
| normal/2/tank | before | 2.2/10.4 | 2.5/21.8 | 2.2/15.6 | 2.8/11.9 | 1.8/39 | 2.8/25.6 | 2.8/54.3 | 2.8/50.8 | 2.5 | 5.3 | 0/40 | 5/40 |
| | after | 1.8/8 | 1.9/16.8 | 2/12.4 | 2.7/8.3 | 1.5/34.4 | 3.4/27.1 | 4/55.9 | 4.2/59.3 | 4.0 | 9.0 | 0/40 | 12/40 |
| cursed/2/mid | before | 2.3/14.2 | 2.2/28.1 | 2/19.5 | 2.3/12.2 | 1.3/38.8 | 2.1/22.7 | 2/55.5 | 2/56.1 | 1.8 | 4.6 | 0/40 | 8/40 |
| | after | 2/12.1 | 1.7/21.3 | 1.8/15.2 | 2.1/8.1 | 1.2/34.8 | 2.8/29 | 2.9/63.4 | 3/64.2 | 3.2 | 7.8 | 0/40 | 21/40 |
| cursed/2/tank | before | 2.3/14.4 | 2.5/30.4 | 2.2/21.7 | 2.8/16.3 | 1.5/45.4 | 2.7/30.5 | 2.6/64.6 | 2.5/65.4 | 2.4 | 5.2 | 0/40 | 23/40 |
| | after | 2/12.2 | 2.2/25.7 | 2.4/19.8 | 3.7/15.1 | 1.6/48.9 | 4.2/40.8 | 4.6/71.6 | 4.2/79.1 | 4.5 | 9.9 | 0/40 | 35/40 |
| normal/1/bag2/mid | before | 2.2/9.9 | 2.2/19.7 | 2.1/15.2 | 2.9/11.2 | 1.7/26.5 | 2.2/14.1 | 1.9/28 | 2/29.2 | 1.9 | 4.1 | 1/40 | 1/40 |
| | after | 1.7/7.7 | 1.8/14.9 | 1.7/10.4 | 1.8/5.2 | 1.2/23.4 | 1.9/15 | 1.9/35 | 2/32.1 | 2.4 | 5.7 | 0/40 | 0/40 |
| normal/1/dmg2/mid | before | 2.4/10.5 | 2.4/19.2 | 2/12.8 | 2.3/8.9 | 1.3/24.6 | 1.5/10.8 | 1.5/25.1 | 1.5/25.2 | 1.5 | 3.5 | 1/40 | 1/40 |
| | after | 1.7/8 | 1.8/14.8 | 1.9/11.1 | 2.1/5.8 | 1.3/23.8 | 2.1/16 | 1.9/32.9 | 2.1/31.6 | 2.5 | 5.9 | 0/40 | 0/40 |

Mid (normal solo): TTK 10–14 is 1.9 to 3.0 s, life in frame late is 2.0–2.1 to 2.6–3.3 s, at the lower edge of goal 3–5 s. Early (0–7 min) a mob in frame lives about 2 s at any damage: this is travel time from frame edge to Hero, most early mobs die in 1–2 hits. 3–5 s there is unachievable without the weapon not killing at all; I suggest goal 3–5 s from 8:00 on, before that ≥ 2 s.

Glass: TTK 1.3 to 1.9 s at 4.8 hits (goal 1–2 s, not one-shot), in goal. Tank: fail before 10:00 is 6/40 to 0/40 (goal), after 11:00 fails in half of runs (goal does not require this).

Cursed: mid before 10:00 is 11/40 to 4/40, total 18 to 15; tank before 10:00 is 10/40 (was 11). Duo: normal like solo (0–1/40), cursed duo mid after 12:00 fails in 21/40 (was 8), crowd in frame is 63–64 at threshold 60.

### 13.11 Ladder: before and after (lab, n = 16, strength from absolute anchor)

| weapon | R | goal | before | after | life in frame, s (before → after) |
|---|---|---|---|---|---|
| blade_arc | 170 | 1 | 1.00 | 0.81 | 6.3 → 7.5 |
| throwing_daggers | 360 | 0.59 | 0.81 | 0.56 | 8 → 10.9 |
| guardian_shields | 86 | 0.8 | 0.44 | 0.81 | 14.9 → 7.8 |
| holy_ground | 105 | 0.91 | 0.88 | 0.81 | 7.2 → 7.6 |
| war_axe | 185 | 0.91 | 1.25 | 0.81 | 5 → 7.5 |
| storm_chain | 290 | 0.46 | 0.63 | 0.44 | 9.7 → 14.2 |
| firebomb | 300 | 0.65 | 1.19 | 0.63 | 5.4 → 9.8 |
| spear | 340 | 0.56 | 0.19 | 0.63 | 36.5 → 10.2 |
| hammer | 109 | 0.83 | 1.25 | 0.50 | 4.9 → 12.6 |
| crossbow | 360 | 0.6 | 0.25 | 0.69 | 27.1 → 9.4 |
| mines | 126 | 0.95 | 2.25 | 1.00 | 2.8 → 6.2 |
| frost_orb | 197 | 0.71 | 0.69 | 0.63 | 9 → 9.6 |
| poison_cloud | 62 | 0.8 | 1.00 | 0.81 | 6.1 → 7.9 |
| beam | 200 | 0.45 | 2.44 | 0.44 | 2.6 → 15 |
| wisp | 300 | 0.6 | 0.81 | 0.50 | 7.5 → 11.8 |
| meteor | 300 | 0.79 | 0.81 | 0.81 | 7.6 → 7.5 |
| crimson_arc | 170 | 1 | 1.00 | 0.89 | 5.3 → 5.8 |
| thousand_edge | 360 | 0.61 | 0.84 | 0.47 | 6.4 → 10.6 |
| aegis_bastion | 84 | 0.82 | 0.16 | 0.84 | 35.6 → 6.1 |
| soul_garden | 150 | 0.93 | 1.37 | 1.00 | 3.8 → 5.3 |
| death_spiral | 210 | 0.86 | 1.11 | 0.84 | 4.8 → 6.2 |
| thunder_loop | 320 | 0.46 | 1.00 | 0.37 | 5.1 → 13.9 |
| napalm_rain | 300 | 0.66 | 1.26 | 0.58 | 4.2 → 9.3 |
| dragon_lance | 340 | 0.57 | 0.68 | 0.53 | 7.8 → 9.6 |
| titan_maul | 126 | 0.85 | 1.32 | 0.84 | 4 → 6.3 |
| ballista | 360 | 0.59 | 0.58 | 0.79 | 9.2 → 6.7 |
| minefield | 148 | 0.97 | 2.84 | 0.89 | 1.9 → 5.9 |
| blizzard | 244 | 0.65 | 1.95 | 0.53 | 2.7 → 9.6 |
| miasma | 72 | 0.82 | 1.58 | 0.89 | 3.3 → 5.8 |
| prism_ray | 230 | 0.45 | 4.79 | 0.47 | 1.1 → 11.6 |
| spirit_choir | 300 | 0.62 | 0.63 | 0.58 | 8 → 9.5 |
| starfall | 300 | 0.81 | 1.26 | 0.79 | 4.2 → 6.7 |

"Before" for blade_arc and crimson_arc is the old arc shape; "after" is the recommended slash. After the shared ×0.75 all weapons below the anchor are roughly 20% below it, compare with blade (0.81) and Crimson Arc (0.89). Spearman (goal, strength): base 0.62 to 0.70, evolutions 0.36 to 0.89; (range, strength): −0.42 to −0.36 and −0.31 to −0.74. The rule "farther is weaker" now holds for evolutions and mostly for base weapons. Remainder: hammer 0.62 from blade at goal 0.83 (slam weaker than arc, damage ×1.8 per tuning did not catch up), crossbow 0.85 at 0.6, ballista 0.89 at 0.59, mines 1.23 at 0.95 (nearly one-shot covers the cooldown), lightning 0.54 ≤ daggers 0.69 (owner rule met), beam 0.54 (weak).

### 13.12 DPS on dummies (`tools/simulation/dps.mjs`)

Average Hero (HERO_BASE, 100% stats), no passives and bag, one weapon; dummies are immortal and still, DoTs work on them; warm-up 5 s, measure 60 s, seed 1. Scenes: 1 target at 40 px (orbits on a ring), 10 in a cluster radius 20 px, frame 400 × 240 filled at 18 px step (320 dummies). Blade Arc and Crimson Arc use the recommendation 13.9.

| weapon | level | DPS 1 target | DPS 10 | DPS screen | range, px | hit radius, px | quirks |
|---|---|---|---|---|---|---|---|
| blade_arc | L1 | 7 | 60 | 100 | 120 | 20 | bleeding |
| blade_arc | L5 | 58 | 565 | 1545 | 170 | 28 | bleeding |
| throwing_daggers | L1 | 12 | 24 | 24 | 336 | 5 | knockbackRanged pierce |
| throwing_daggers | L5 | 105 | 569 | 616 | 360 | 5 | knockbackRanged pierce |
| guardian_shields | L1 | 15 | 151 | 842 | 72 | 17 | block omni |
| guardian_shields | L5 | 253 | 2509 | 21075 | 86 | 31 | block omni |
| holy_ground | L1 | 7 | 71 | 273 | 55 | 55 | omni |
| holy_ground | L5 | 33 | 337 | 4080 | 105 | 105 | omni |
| war_axe | L1 | 8 | 59 | 121 | 110 | 5 | — |
| war_axe | L5 | 97 | 633 | 2037 | 185 | 5 | knockbackRanged |
| storm_chain | L1 | 8 | 25 | 25 | 230 | 90 | knockbackRanged homing |
| storm_chain | L5 | 21 | 221 | 326 | 290 | 120 | knockbackRanged homing |
| firebomb | L1 | 2 | 23 | 31 | 300 | 36 | fire burning |
| firebomb | L5 | 18 | 219 | 1056 | 300 | 60 | fire burning |
| spear | L1 | 31 | 64 | 64 | 270 | 6 | pierce root |
| spear | L5 | 150 | 764 | 760 | 340 | 8 | pierce root |
| hammer | L1 | 23 | 245 | 934 | 78 | 56 | heavyKnockback slow |
| hammer | L5 | 222 | 2051 | 16123 | 109 | 78 | heavyKnockback slow |
| crossbow | L1 | 69 | 69 | 72 | 360 | 5 | knockbackRanged |
| crossbow | L5 | 625 | 1870 | 1843 | 360 | 5 | knockbackRanged pierce |
| mines | L1 | 3 | 25 | 283 | 104 | 70 | trap |
| mines | L5 | 48 | 336 | 8317 | 126 | 92 | trap |
| frost_orb | L1 | 10 | 66 | 268 | 120 | 20 | chill pierceAll |
| frost_orb | L5 | 40 | 334 | 1736 | 197 | 32 | chill pierceAll |
| poison_cloud | L1 | 5 | 33 | 103 | 40 | 40 | poison omni |
| poison_cloud | L5 | 16 | 158 | 737 | 62 | 62 | poison omni |
| beam | L1 | 3 | 5 | 174 | 150 | 9 | pierceAll random |
| beam | L5 | 41 | 350 | 3545 | 200 | 11 | pierceAll random |
| wisp | L1 | 57 | 118 | 116 | 300 | 4 | knockbackRanged pierce autoAim |
| wisp | L5 | 166 | 478 | 489 | 300 | 4 | knockbackRanged pierce autoAim |
| meteor | L1 | 7 | 67 | 155 | 300 | 44 | burning delayed |
| meteor | L5 | 42 | 734 | 3455 | 300 | 64 | burning delayed |
| crimson_arc | evo | 68 | 672 | 2443 | 170 | 34 | bleeding |
| thousand_edge | evo | 132 | 520 | 519 | 360 | 5 | knockbackRanged pierce |
| aegis_bastion | evo | 302 | 2969 | 22882 | 84 | 24 | block omni |
| soul_garden | evo | 19 | 196 | 4134 | 150 | 150 | omni |
| death_spiral | evo | 71 | 661 | 2511 | 210 | 5 | knockbackRanged |
| thunder_loop | evo | 17 | 170 | 404 | 320 | 140 | knockbackRanged homing |
| napalm_rain | evo | 11 | 153 | 1059 | 300 | 72 | fire burning |
| dragon_lance | evo | 83 | 1443 | 2017 | 340 | 34 | pierce root |
| titan_maul | evo | 94 | 950 | 8844 | 126 | 90 | heavyKnockback slow |
| ballista | evo | 391 | 1817 | 1919 | 360 | 5 | knockbackRanged pierce |
| minefield | evo | 90 | 843 | 11277 | 148 | 110 | trap |
| blizzard | evo | 14 | 146 | 2045 | 244 | 34 | chill pierceAll |
| miasma | evo | 13 | 131 | 808 | 72 | 72 | poison omni |
| prism_ray | evo | 25 | 318 | 3536 | 230 | 11 | pierceAll random |
| spirit_choir | evo | 161 | 460 | 475 | 300 | 4 | knockbackRanged pierce autoAim |
| starfall | evo | 27 | 400 | 2722 | 300 | 76 | burning delayed |

What stands out: a weapon with one strong hit (crossbow 625, ballista 391, spear 150 per single target) tuned for clear does 5–10 times more damage to one target than blade (58): in live play their damage gets wasted as overkill, so for clear they got higher frequency. This means they hit bosses hardest (boss TTK is lower). Shields and aegis on dummies are the best for crowds (21–23k on screen): their limit is not damage but live enemies walking through the ring and flying off.

### 13.13 Bosses (TTK, s: median / maximum, killed out of 40)

| mode/build | Kitsune before → after | Harpy before → after | Dryad before → after |
|---|---|---|---|
| normal/1/glass | 37.5/108 → 36.5/94 | 16.3/43 → 18.9/61 | 28.8/92 → 37.0/109 (40/40) |
| normal/1/mid | 38.6/130 → 47.3/208 | 19.7/83 → 29.2/123 | 43.3/67 → 58.5/120 (39/40) |
| normal/1/tank | 57.1/194 → 70.4/171 | 40.1/153 → 57.1/233 | 55.7/118 → 68.7/116 (35/40) |
| cursed/1/mid | 45.5/144 → 48.7/195 | 23.8/127 → 28.3/188 | 47.0/96 → 56.6/120 (37/40) |
| normal/2/mid | 16.6/47 → 19.7/62 | 12.3/26 → 13.2/31 | 26.9/100 → 34.5/113 (40/40) |
| cursed/2/mid | 16.5/37 → 18.6/39 | 12.0/27 → 14.1/47 | 28.9/79 → 36.1/82 (40/40) |

Boss HP was not changed (250/500/1000 per level). Bots take longer to kill bosses than people (do not pursue). Reaper (70 to 160 ramp, immunities) cannot be measured this way: needs a scenario with the Bible.

### 13.14 Defense after (`defense.mjs`, Hero, 10:00)

Hits per level: max_hp 1.19, resistance 1.26–1.40, regen 1.07, dodge 1.05–1.17 (passive defense numbers were changed by the mechanic agent). All four L5 together give +50 hits versus a sum of +23 (2.16×), band 0 to 20 levels is 8.2 to 58.4. Owner's decision (13.4): leave as is. Defensive bag T2 is about 10.7 levels of passives.

### 13.15 Attack and magic on items (decision D)

Validation, normal/1/mid: no bag TTK 10–14 is 3.0 s, failures 5/40; random T2 is 2.4 s, 0/40; attacking T2 is 2.5 s, 0/40. Attacking bag is no better than random, like in phase 1. Decision: keep attack/magic on items, `STAT_REF` 0.5 unchanged; bag strength is common `ITEM_POWER.scale`.

### 13.16 Needs decision or not done

Blade Arc and Crimson Arc (slash agent): by ladder, damage is ×0.4 and about ×0.2 (table 13.9); until this is done, data in repo makes a run twice as fast as goal.

Goal 3–5 s early is unachievable (travel time); proposal: 3–5 s from 8:00, before that ≥ 2 s.

Single damage of ranged weapons against bosses (13.12): if bosses should not die from the crossbow, need a second ladder goal, by single target (for example, strength on boss no higher than blade L5 × f(R)).

Hammer is weaker than goal (slam), shields/aegis depend heavily on ring behavior (`orbit.js`, not my file).

Cursed duo after 12:00 fails in half of runs (threshold 60 in frame).

Tests, pinning numbers and corrected: `sim.test.js` (mines window 10 to 20 s, L1 cooldown about 8 s; crit L5 from data instead of 0.25). Old chest tests with evolution choice fail (`mechanics.test.js` combo, `upgrades.test.js`, `sim.test.js` skill chest), redone by the loot agent.

### 13.17 Reproduction (phase 2)

```bash
node tools/simulation/ladder.mjs --tune --anchor-power --iters 2 --n 12 --skip blade_arc,crimson_arc \
  --experiment base.json --out tools/out/p2/tuned.json          # ladder tuning, ~25 min
node tools/simulation/ladder.mjs --lab --anchor-power --n 16 --experiment tools/out/p2/blade-rec.json
node tools/simulation/ladder.mjs --lab --level 1 --from 0 --to 3 --ids blade_arc,wisp   # starting weapons
node tools/simulation/targets.mjs --n 40 --split validation \
  --modes normal/1,cursed/1,normal/2,cursed/2,normal/1/bag2,normal/1/dmg2 --experiment tools/out/p2/blade-rec.json
node tools/simulation/dps.mjs --md [--experiment tools/out/p2/blade-rec.json]
```

### 13.18 Target tags, bloom, blade, single (2026-10-27, owner decisions)

Decisions: blade is cut by recommendation 13.9 (blade_arc damage 6/8/10/12/14, crimson_arc 11); goal mid 3–5 s from 8:00 on, before that ≥ 2 s; each weapon has tag `targets` and optional `bloom` (`weapons.js`). Main ladder is clear for all crowds (single also clears packs by frequency and pierce); single target only has a ceiling "single no more than about 1.5–2× of aoe", boss TTK is a check "not one-shot", not a goal (bosses are not a threat now).

Tags: aoe covers shields, holy ground, bomb, hammer, mines, frost orb, cloud, meteor and evolutions; cleave covers blade, daggers, axe, lightning, beam and evolutions; single covers crossbow, spear, wisp and evolutions. Ladder (`LADDER.tags`): clear is f(R) × Q × {aoe 1, cleave 0.9, single 0.7}, single target ceiling is f(R) × Q × {aoe 1, cleave 1.35, single 3}.

Bloom is from lab (strength relative to blade in 1–5 min window versus 8–12 min window): early are daggers (×3.0), holy ground (×2.0), lightning (×5.6), spear (×2.3), wisp (×1.7); late are mines (×0.42), beam (×0.56). `ladder.mjs --lab --bloom` compares such a weapon with blade in its window (`LADDER.bloom`: early 1–6, late 7–12 min).

Single: damage per single target (dummy-boss, `dps.mjs`) was crossbow 625, ballista 391, spear 150, wisp 166; cut to about 100 (evolutions about 90–115) by half damage and half cooldown (bolt stays strong per hit), wisps L5 get 2 instead of 4. Clear packs is restored by pierce (it adds no single-target damage): crossbow 4–12, spear 3–8, wisp 1–5, ballista 10, dragon_lance 9, spirit_choir 4. Wisp L1 is one (owner's decision).

Test: `weapons-rework.test.js` "spear: pins…" pinned pierce L1 = 1 (from 3 targets hit two), now is a row of 2 plus pierce targets from data.

DPS by tag (`dps.mjs`, medians):

| | aoe | cleave | single |
|---|---|---|---|
| L5: per boss | 38 (max 476, shields) | 59 | 101 |
| L5: crowd (screen) | 3511 | 1545 | 883 |
| evolutions: per boss | 17 (max 300, aegis) | 67 | 105 |
| evolutions: crowd | 3090 | 2443 | 1161 |

Single per single target is now 2.7× median aoe and 1.7× cleave (was up to 16× for crossbow); median aoe is understated by DoTs (bosses immune). Above single target ceiling remain aoe with heavy impact: shields 476, aegis 300, hammer 222 (on still large dummy ring and ground hit do not miss).

Full table (average Hero, no passives; "boss/anchor (ceiling)" is DPS per boss relative to blade L5 or Crimson Arc and in parentheses the ceiling by ladder):

| weapon | lvl | tag | bloom | DPS 1 target | DPS 10 | DPS crowd (screen) | DPS boss | boss/anchor (ceiling) | R, px | hit, px |
|---|---|---|---|---|---|---|---|---|---|---|
| blade_arc | L1 | cleave | — | 7 | 60 | 100 | 6 | — | 120 | 20 |
| blade_arc | L5 | cleave | — | 58 | 565 | 1545 | 56 | 1 (1) | 170 | 28 |
| throwing_daggers | L1 | cleave | early | 12 | 24 | 24 | 12 | — | 336 | 5 |
| throwing_daggers | L5 | cleave | early | 105 | 569 | 616 | 156 | 2.79 (0.58) | 360 | 5 |
| guardian_shields | L1 | aoe | — | 15 | 151 | 842 | 29 | — | 72 | 17 |
| guardian_shields | L5 | aoe | — | 253 | 2509 | 21075 | 476 | 8.5 (0.59) | 86 | 31 |
| holy_ground | L1 | aoe | early | 7 | 71 | 273 | 7 | — | 55 | 55 |
| holy_ground | L5 | aoe | early | 33 | 337 | 4080 | 33 | 0.59 (0.67) | 105 | 105 |
| war_axe | L1 | cleave | — | 8 | 59 | 121 | 8 | — | 110 | 5 |
| war_axe | L5 | cleave | — | 97 | 633 | 2037 | 97 | 1.73 (0.9) | 185 | 5 |
| storm_chain | L1 | cleave | early | 8 | 25 | 25 | 8 | — | 230 | 90 |
| storm_chain | L5 | cleave | early | 21 | 221 | 326 | 21 | 0.38 (0.63) | 290 | 120 |
| firebomb | L1 | aoe | — | 2 | 23 | 31 | 2 | — | 300 | 36 |
| firebomb | L5 | aoe | — | 18 | 219 | 1056 | 17 | 0.3 (0.48) | 300 | 60 |
| spear | L1 | single | early | 20 | 83 | 82 | 20 | — | 270 | 6 |
| spear | L5 | single | early | 96 | 597 | 883 | 96 | 1.71 (1.25) | 340 | 8 |
| hammer | L1 | aoe | — | 23 | 245 | 934 | 23 | — | 78 | 56 |
| hammer | L5 | aoe | — | 222 | 2051 | 16123 | 222 | 3.96 (0.62) | 109 | 78 |
| crossbow | L1 | single | — | 12 | 58 | 59 | 12 | — | 360 | 5 |
| crossbow | L5 | single | — | 103 | 582 | 1370 | 103 | 1.84 (1.26) | 360 | 5 |
| mines | L1 | aoe | late | 3 | 25 | 283 | 3 | — | 104 | 70 |
| mines | L5 | aoe | late | 48 | 336 | 8317 | 43 | 0.77 (0.7) | 126 | 92 |
| frost_orb | L1 | aoe | — | 10 | 66 | 268 | 16 | — | 120 | 20 |
| frost_orb | L5 | aoe | — | 40 | 334 | 1736 | 49 | 0.88 (0.52) | 197 | 32 |
| poison_cloud | L1 | aoe | — | 5 | 33 | 103 | 4 | — | 40 | 40 |
| poison_cloud | L5 | aoe | — | 16 | 158 | 737 | 12 | 0.21 (0.59) | 62 | 62 |
| beam | L1 | cleave | late | 3 | 5 | 174 | 3 | — | 150 | 9 |
| beam | L5 | cleave | late | 41 | 350 | 3545 | 59 | 1.05 (0.86) | 200 | 11 |
| wisp | L1 | single | early | 29 | 58 | 58 | 29 | — | 300 | 4 |
| wisp | L5 | single | early | 101 | 608 | 614 | 101 | 1.8 (1.27) | 300 | 4 |
| meteor | L1 | aoe | — | 7 | 67 | 155 | 5 | — | 300 | 44 |
| meteor | L5 | aoe | — | 28 | 262 | 2942 | 24 | 0.43 (0.58) | 300 | 64 |
| crimson_arc | evo | cleave | — | 68 | 672 | 2443 | 67 | 1 (1) | 170 | 34 |
| thousand_edge | evo | cleave | — | 132 | 520 | 519 | 131 | 1.96 (0.6) | 360 | 5 |
| aegis_bastion | evo | aoe | — | 302 | 2969 | 22882 | 300 | 4.48 (0.61) | 84 | 24 |
| soul_garden | evo | aoe | — | 19 | 196 | 4134 | 19 | 0.28 (0.69) | 150 | 150 |
| death_spiral | evo | cleave | — | 71 | 661 | 2511 | 121 | 1.81 (0.86) | 210 | 5 |
| thunder_loop | evo | cleave | — | 17 | 170 | 404 | 17 | 0.25 (0.61) | 320 | 140 |
| napalm_rain | evo | aoe | — | 11 | 153 | 1059 | 12 | 0.18 (0.49) | 300 | 72 |
| dragon_lance | evo | single | — | 86 | 618 | 2690 | 86 | 1.28 (1.28) | 340 | 34 |
| titan_maul | evo | aoe | — | 94 | 950 | 8844 | 94 | 1.4 (0.63) | 126 | 90 |
| ballista | evo | single | — | 105 | 609 | 1161 | 105 | 1.57 (1.29) | 360 | 5 |
| minefield | evo | aoe | — | 90 | 843 | 11277 | 77 | 1.15 (0.72) | 148 | 110 |
| blizzard | evo | aoe | — | 14 | 146 | 2045 | 15 | 0.22 (0.48) | 244 | 34 |
| miasma | evo | aoe | — | 13 | 131 | 808 | 10 | 0.15 (0.61) | 72 | 72 |
| prism_ray | evo | cleave | — | 25 | 318 | 3536 | 64 | 0.96 (0.82) | 230 | 11 |
| spirit_choir | evo | single | — | 114 | 508 | 559 | 114 | 1.7 (1.3) | 300 | 4 |
| starfall | evo | aoe | — | 9 | 89 | 1703 | 7 | 0.1 (0.6) | 300 | 76 |

Clear ladder (lab, n = 16, strength from absolute anchor 13.9; goal includes tag multiplier):

| weapon | tag | bloom | R | goal | strength | life in frame, s |
|---|---|---|---|---|---|---|
| blade_arc | cleave | — | 170 | 1 | 0.81 | 7.5 |
| throwing_daggers | cleave | early | 360 | 0.59 | 0.56 | 10.9 |
| guardian_shields | aoe | — | 86 | 0.89 | 0.81 | 7.8 |
| holy_ground | aoe | early | 105 | 1 | 0.81 | 7.6 |
| war_axe | cleave | — | 185 | 0.9 | 0.81 | 7.5 |
| storm_chain | cleave | early | 290 | 0.46 | 0.44 | 14.2 |
| firebomb | aoe | — | 300 | 0.71 | 0.63 | 9.8 |
| spear | single | early | 340 | 0.44 | 0.56 | 11 |
| hammer | aoe | — | 109 | 0.92 | 0.50 | 12.6 |
| crossbow | single | — | 360 | 0.44 | 0.44 | 15 |
| mines | aoe | late | 126 | 1.05 | 1.00 | 6.2 |
| frost_orb | aoe | — | 197 | 0.78 | 0.63 | 9.6 |
| poison_cloud | aoe | — | 62 | 0.89 | 0.81 | 7.9 |
| beam | cleave | late | 200 | 0.45 | 0.44 | 15 |
| wisp | single | early | 300 | 0.44 | 0.38 | 15.8 |
| meteor | aoe | — | 300 | 0.87 | 0.94 | 6.9 |
| crimson_arc | cleave | — | 170 | 1 | 0.89 | 5.8 |
| thousand_edge | cleave | — | 360 | 0.6 | 0.47 | 10.6 |
| aegis_bastion | aoe | — | 84 | 0.91 | 0.84 | 6.1 |
| soul_garden | aoe | — | 150 | 1.02 | 1.00 | 5.3 |
| death_spiral | cleave | — | 210 | 0.86 | 0.84 | 6.2 |
| thunder_loop | cleave | — | 320 | 0.46 | 0.37 | 13.9 |
| napalm_rain | aoe | — | 300 | 0.73 | 0.58 | 9.3 |
| dragon_lance | single | — | 340 | 0.45 | 0.58 | 8.8 |
| titan_maul | aoe | — | 126 | 0.94 | 0.84 | 6.3 |
| ballista | single | — | 360 | 0.45 | 0.42 | 13.2 |
| minefield | aoe | — | 148 | 1.07 | 0.89 | 5.9 |
| blizzard | aoe | — | 244 | 0.72 | 0.53 | 9.6 |
| miasma | aoe | — | 72 | 0.91 | 0.89 | 5.8 |
| prism_ray | cleave | — | 230 | 0.45 | 0.47 | 11.6 |
| spirit_choir | single | — | 300 | 0.45 | 0.47 | 11.4 |
| starfall | aoe | — | 300 | 0.89 | 0.53 | 10.4 |

Blade after shared ×0.75 is 0.81 of anchor, Crimson Arc is 0.89: compare with them. Below goal (tag multiplier raised aoe goals, did not retune them): hammer 0.50 at 0.92, frost orb 0.63 at 0.78, starfall 0.53 at 0.89, blizzard 0.53 at 0.72; wisp 0.38 at 0.44 (late, bloom early).

Bots clear (validation, n = 24; life in frame, s / enemies in frame):

| mode/build | 3:00 | 7:00 | 9:00 | 11:00 | 13:00 | 14:00 | TTK 10–14 | hits/kill | fail before 10 / total |
|---|---|---|---|---|---|---|---|---|---|
| normal/1/glass | 3.0/21 | 2.5/8 | 1.3/25 | 1.9/15 | 1.7/31 | 1.7/26 | 2.1 | 5.2 | 2 / 2 |
| normal/1/mid | 2.7/20 | 5.6/12 | 1.5/28 | 3.3/22 | 2.5/40 | 2.7/37 | 3.4 | 7.5 | 1 / 3 |
| normal/1/tank | 3.7/24 | 4.6/14 | 2.4/36 | 6.4/38 | 8.3/58 | 8.1/56 | 7.2 | 10.2 | 2 / 15 |
| cursed/1/mid | 4.9/33 | 3.8/15 | 1.7/40 | 3.1/30 | 2.9/54 | 2.6/50 | 3.6 | 7.6 | 5 / 7 |
| normal/2/mid | 1.9/17 | 2.3/7 | 1.2/24 | 2.5/20 | 2.5/43 | 2.6/43 | 2.8 | 7.1 | 0 / 1 |
| cursed/2/mid | 2.3/25 | 2.8/12 | 1.3/37 | 3.0/32 | 3.0/63 | 3.2/61 | 3.5 | 8.3 | 0 / 10 |

Mid from 8:00: 11:00–14:00 is 2.5–3.3 s (at lower edge of goal), 9:00 is 1.5 s—the minute after 8:00 is easy (elite and wall at 8:00 already dead, lamias still rare); glass TTK 2.1 s at 5 hits (at edge of 1–2 s).

Bosses, normal/1/mid (median / maximum, killed): Kitsune 68/169 s from 24/24, Harpy 58/152 s from 24/24, Dryad 65/102 s from 20/24 (before single cut: 47 / 29 / 59 s). No one-shot, bosses live longer; by owner decision this is not a goal.

Need decision: single is 2.7× median aoe per single target—if strictly ≤ 2×, cut single damage ×0.75 (clear changes little, pierce holds it); shields, aegis, and hammer per single target exceed single; aoe with tag multiplier below clear goal (hammer, frost orb, starfall, blizzard)—next pass `ladder.mjs --tune --anchor-power`.

```bash
node tools/simulation/dps.mjs --md                                   # DPS table: 1 target, 10, screen, boss
node tools/simulation/ladder.mjs --lab --anchor-power --bloom --n 16  # clear with bloom windows
```

### 13.19 Single target ceiling and short pass (2026-10-27, owner answers to 13.18)

Single ×0.75 damage (wisp L1 untouched; L2–L3 raised to 22, damage does not drop with level—`data.test.js`); clear returned by pierce: spear 4–10, wisp 1–6, ballista 16, spirit_choir 6.

Shields, aegis, hammer: single target damage is cut, clear held by radius or area growth (bosses gain nothing: large target fits wholly in ring or under impact). Shields: damage ×0.32, hitRadius ×1.3 (L5 40; higher hits 51 px where target stands in multiple shields, `mechanics.test.js` "orbit: each shield rehits…" and visually hit 50 px from shield). Aegis: damage 67 to 9 per hit, hitRadius 24 to 54. Hammer: damage ×0.35, area ×1.25; titan_maul damage ×0.6, area 99.

Short pass (lab, tuning seeds, n = 12): starfall damage ×1.7, blizzard ×1.4, frost orb ×1.15.

Strength per boss (`dps.mjs`, L5 or evolution) and clear (lab, from absolute anchor; goal in parentheses):

| weapon | tag | per boss before → after | clear before → after (goal) |
|---|---|---|---|
| crossbow | single | 103 → 78 | 0.44 → 0.44 (0.44) |
| spear | single | 96 → 72 | 0.56 → 0.44 (0.44) |
| wisp | single | 101 → 75 | 0.38 → 0.31 (0.44) |
| ballista | single | 105 → 79 | 0.42 → 0.42 (0.45) |
| dragon_lance | single | 86 → 65 | 0.58 → 0.53 (0.45) |
| spirit_choir | single | 114 → 87 | 0.47 → 0.37 (0.45) |
| guardian_shields | aoe | 476 → 161 | 0.81 → 0.88 (0.89) |
| aegis_bastion | aoe | 300 → 81 | 0.84 → 0.84 (0.91) |
| hammer | aoe | 222 → 78 | 0.50 → 0.94 (0.92) |
| titan_maul | aoe | 94 → 57 | 0.84 → 0.95 (0.94) |
| frost_orb | aoe | 49 → 56 | 0.63 → 0.69 (0.78) |
| starfall | aoe | 7 → 13 | 0.53 → 0.95 (0.89) |
| blizzard | aoe | 15 → 20 | 0.53 → 0.74 (0.72) |

Boss medians now: single about 75, cleave about 59, aoe about 40 (single is about 1.9× aoe). Above the ceiling remain shields (161): with orbit, single damage and clear tie together (both from hit count), cannot lower without losing clear. Wisp per clear is 0.31 at 0.44—pierce does not help (wisps hit nearest to self, rarely in row); it is early bloom, owner kept L1.

Bots, validation, n = 24 (life in frame, s / enemies in frame):

| mode/build | 9:00 | 11:00 | 12:00 | 13:00 | 14:00 | TTK 10–14 | hits/kill | fail before 10 / total |
|---|---|---|---|---|---|---|---|---|
| normal/1/glass | 1.5/26 | 2.2/16 | 2.2/21 | 1.8/31 | 1.7/29 | 2.3 | 5.3 | 2 / 2 |
| normal/1/mid | 1.6/28 | 3.6/23 | 4.2/35 | 3.2/41 | 3.1/41 | 4.1 | 8.8 | 1 / 4 |
| normal/1/tank | 2.8/40 | 7.0/36 | 8.5/51 | 8.2/64 | 7.4/59 | 7.3 | 10.4 | 2 / 16 |
| cursed/1/mid | 2.0/40 | 4.7/35 | 5.0/49 | 4.1/59 | 4.2/58 | 5.2 | 9.9 | 6 / 15 |

Mid from 11:00 is 3.1–4.2 s, in goal 3–5 s (9:00 still easy, 1.6 s). Glass TTK 2.3 s (slightly above 2). Cursed solo mid now fails more after 11:00 (15/24, was 7/24): overall offense is weaker after single and shield cuts; if cursed should stay passable as mid build, the lever is cursed spawnMul 1.4 to 1.3.

Normal/1/mid: Kitsune 87/170 s, Harpy 59/147 s, Dryad 67/106 s (19/24). No one-shot.
