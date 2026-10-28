# Simulations: implementation results October 23, 2026

Old `tests/balance` with healing and build gifting has been replaced by a separate test stand.
Mechanical unit tests are kept. Reproducible fair runs exist, exact bot replay works, a shared policy for Node and browser exists, separate immortal diagnostics, recipes, controlled weapon comparisons, and reports with intervals all exist. Commands: [SIMULATION_GUIDE.md](SIMULATION_GUIDE.md).

## Human model fidelity

13 v1 solo runs are locked: 969 events, 656 takes, 135 minute snapshots; 11 cursed, 2 normal.
This is a small biased sample of runs, not 13 independent known people. All recovered final builds matched. The historical recipe version is unconfirmed. Damage lost after v1 evolution stays unknown.

Leave-one-run-out with equal run weight: learned top-1 **65.43%**, previous bot **34.23%**, uniform **23.98%**; logloss **0.922 / 1.907 / 1.360** respectively.
Detailed folds and checksum in `tests/fixtures/telemetry/validation.json`.
This validates card preferences, not movement realism or loss probability. Profiles hold chosen direction but pick from actual random offers.

Movement accounts for reaction delay, evasion, items, partner, and XP collection through magnet.
Profile shares and banking frequency are preliminary. Export after 14:00 UTC, checked at 17:30 UTC, contained no new runs. So human movement and duo validation and final 50%/75% tuning remain open plan stages.

## Experience and duo

Below are research tuning runs of 20 matches per mode with identical seed/profile within each comparison.
This is direction-finding, not qualification. Intervals are wide. Level at 15:00 depends on survival; check observation count in JSON.

| Variant | normal solo wins | normal duo | cursed solo | cursed duo |
| --- | ---: | ---: | ---: | ---: |
| Baseline XP, banking profiles | 9/20 | 0/20 | 3/20 | 0/20 |
| Duo XP only 1.25 → 1.75 | 9/20 | 4/20 | 3/20 | 1/20 |
| Smooth A, cursed XP .9, duo XP 2 | 9/20 | 2/20 | 3/20 | 1/20 |
| Smooth C, cursed XP .9, duo XP 2 | 10/20* | 6/20 | 2/20 | 0/20 |
| Personal level cost only, scale 2 | 9/20 | 14/20 | 3/20 | 9/20 |
| Smooth A + personal level, cursed .9, duo 1.25 | 9/20 | 16/20 | 3/20 | 8/20 |

A: cost increases 10/25/45 at ranges below 20/below 40/above, with no bonuses at 20 and 40.
C: 10/22/40. In C, one normal solo run ended in error, the rest 9 in loss. The error is not hidden or counted as death. Cause: an expired shield in the blocker list, fixed separately with a regression test. Its [seed/config and replay result](simulation-evidence/shield-regression.json) are saved:
630 seconds completed as expected timeout without error, replay of 39,444 steps matched control and final hashes.

Baseline solo at 15:00: normal median level 78, cursed 100. All observed cursed survivors already exhausted available upgrades. Raising duo XP helps early leveling and survival, but all surviving duo at 1.75 also exhausted builds. Smooth A lowers normal solo median to 65 and keeps a median 2 variant, but does not solve duo survival and keeps early exhaustion in some builds. No candidate is accepted as final balance. Data: [xp-exploration.json](simulation-evidence/xp-exploration.json).

Personal level cost supports the hypothesis of insufficient personal leveling. At 5:00 normal duo gets median 25 chosen cards per player vs. the prior 17. But by 15:00 all 15 surviving normal duo teams already started auto-heal. Smooth A with personal levels triggered it in 15 of 16 surviving teams. So you cannot just enable scale 2. Next is to hold early pace and raise late cost accounting for 4+4 duo slots. The change also raises shared level and boss HP; wins above already account for this.

A separate immortal XP-B experiment (10 matches per mode, early profile distribution) gave 507 normal duo rescues and 1331 cursed duo. Ability to level further does not mean fair completion. Stored separately, not in loss rates.

## Radius, weapon synergy, and defense

1558 controlled trials run: all 21 pairs times 6 variants times 4 environments times 3 seeds, 28 recipe probes separately, and shields on and off.
Detailed aggregates: [combat.json](simulation-evidence/combat.json). These are diagnostic setups of ready builds and fixed movement, not normal runs.

In crowds, median DPS: Blade Arc 83, Storm Chain 452, together 554. At equal investment cost, Storm Chain plus attack5/haste2 gives 803.
Strong reason to check cost and radius and sword utility. The difference alone does not prescribe needed nerf. The stand preserves target availability, first hits, finishes after other weapons, and knockback. In real runs, movement, level timing, and defense change the result.

In a ranged fixture, shields show separate defensive benefit with unchanged DPS between block on and off. Destroyed projectiles do not always hit the player. interceptedRaw is clearly separate from incoming HP damage. Raw shield DPS cannot equal pure offensive weapons without a defense cost. No win-rate conclusions from fixtures.

Confirmed core defect: the blocker list was built before scanning projectiles, so a shield that expired or returned to pool earlier in the same scan could keep blocking.
Now shield validity is checked. Regression tests expired and reused objects.

## External benchmarks

Publicly accessed community wikis, viewed October 23, 2026:

- [Vampire Survivors: Level up](https://vampire.survivors.wiki/w/Level_up) and
  [Growth](https://vampire.survivors.wiki/w/Growth): threshold bonuses at 20 and 40 pair with temporary +100% Growth. Our prior curve has bonuses but no compensation.
  This grounds checking a smooth curve rather than moving individual numbers without mechanics.
- [HoloCure: Collaborations](https://holocure.wiki.gg/wiki/Collaborations) and
  [Main weapon](https://holocure.wiki.gg/wiki/Main_weapon): collabs need two max-level weapons and a Golden Anvil, spend components, and free a slot.
  This benchmarks recipe budget and timing. Stage length and our economy differ.

## Next phase conditions

Collect new regular v2 solo and duo from both difficulties, including deaths, rush, banking, magnets, and varied recipes. Verify delay and movement, personal upgrades and evolution timing, and lock the behavior mix. Then choose XP via tuning/validation and test with separate qualification sample. After XP, move to HP, mobs, and weapons via controlled comparisons. Until this check, 50%/75% targets and cursed without evolution are not declared achieved.


## Implementation checks

185 unit and contract checks and all 7 browser smoke tests passed. Lint and runtime manifest freshness checks passed. No fixed waitForTimeout or FPS thresholds in smoke. Shield regression exact replay matched at 39,444 steps; headless and lockstep are compared in tests.
Performance on Node 24.19.0, AMD EPYC 9V45, 400 enemies: mean 0.227 ms, p95 0.338 ms, p99 4.338 ms, max 44.243 ms under parallel load. This is environment measurement, not acceptance FPS.
