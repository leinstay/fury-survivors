# Simulations: plan for Sol - bots, simulations, tests, and balance

Status: Sol executing, October 23, 2026. The old balance test stand has been replaced. Data is locked, a preference model is trained, a shared headless/browser policy is added, exact bot replay works, separate fair and immortal cohorts exist, controlled weapon comparisons run, and new smoke tests are in place.
Instructions: [SIMULATION_GUIDE.md](SIMULATION_GUIDE.md). Results and remaining conditions:
[SIMULATION_RESULTS.md](SIMULATION_RESULTS.md). Death percentages are not yet certified:
card choices are checked on v1, movement and duo await new human data v2.

## Progress

| Item | Status |
| --- | --- |
| Data and preference model | Implemented, fixture locked and LOO validation in place |
| Movement, banking, and duo | Implemented preliminary, awaiting verification against human v2 |
| Fair runner, replay, and lockstep | Implemented, verified by contracts |
| Recipe and immortal bots | Implemented, statistically separated |
| Combat comparisons and shields | 1558 controlled trials, aggregates saved |
| Unit and browser smoke | Reworked, checks run separately from performance |
| XP, HP, mobs, and weapons tuning | XP research done; final numbers and qualification ahead |

## 1. Goals and scope

Replace the current balance test stand and unreliable smoke scenarios with a system where bots receive the regular random card offers that the game generates and select them according to human strategies. After validating bot fidelity, tune experience, health, enemies, and weapons to target difficulty.

Use the real `src/core/sim.js`, behaviors, upgrades, actions, and lockstep. The testing infrastructure is rewritten, not an alternate combat model. Changes to core are allowed for confirmed bugs, observability, and shared action interfaces. Keep useful unit tests of mechanics; replace contradictory and outdated ones after audit.

Goals apply to a locked mixture of human profiles, not to each build or an ideal bot.

| Mode | Target loss rate to victory | Acceptance range |
| --- | --- | --- |
| normal solo | 50% | 45–55% |
| cursed solo | 75% | 70–80% |
| normal duo | 50% of teams | 45–55% |
| cursed duo | 75% of teams | 70–80% |

Victory means the first kill of the final boss (`sim.won`/overtime event), not survival for an arbitrary duration. Death during overtime does not cancel victory. Team loss in duo means the team dies before victory; a separate death followed by revival counts separately. Error, hang, disconnect, and reaching the run limit are separate outcomes. They cannot be recorded as deaths or silently excluded from reports. Set the time limit based on stage duration and acceptable final-boss kill time, and lock it before balance tuning begins.

"Practically impossible without evolutions" for cursed: the upper bound of a one-sided 95% confidence interval for win probability is at most 5%. Check for solo and duo. In duo for the main experiment both players decline all super-weapons. Also check teams where only one player has an evolution. Super-weapons here include both weapon-passive evolutions and weapon-weapon collaborations. For normal no-evolution also measure the result, but do not apply the 5% requirement to it.

## 2. What is already confirmed

A snapshot of `fury_runs` on October 23: 13 solo runs (11 cursed, 2 normal), 135 minute-long snapshots, 13 final snapshots, 580 weapon records, 969 pick events. Among those events: 656 takes, 35 rerolls, 12 banishes, 65 chests, 33 evolutions, 168 heals. These are 13 runs, not necessarily from 13 different people.

V1 contains time and offered/chosen cards, build composition, level/XP/HP, cumulative damage, raw damage, hits and kills by current weapon, bosses, hurt, and the final result. Missing: input seed, trajectories, input sequence, exact HP context at each choice, and a stable duo-party identifier. Exact reproduction of these human runs is impossible. Duo behavior can only be modeled for now, not declared as human-trained.

Limitations of the old stand discovered before replacement:

- `tests/balance/bot.js`: fixed priorities, reaction once every three ticks, chest(0), same preset for both players, no reroll/banish/skip strategy, unlimited skips in noupg.
- `balance.test.js`: some checks heal every second, manually issue weapons or reset state; one test picks the first successful seed. Conditions on filtered survivors can pass on an empty sample.
- `tests/smoke/game.spec.js`: Math.random, 30 seconds wall-clock, mean FPS >50; the result depends on machine load and does not prove scenario completion.
- `tools/playtest.mjs`: separate logic for startup and first card choice; god mode and weapon substitution are mixed with playtest.
- `tools/runs-report.mjs`: an HTTP error can become "0 runs"; averages do not account for weapon changes within a minute and bias toward survivors.

## 3. Phase A: data and measurement correctness

1. Create an explicit Firestore export command with HTTP checking, timeouts, bounded retries, all pages, UTC period boundaries, schema validation, and record checks. CI reads a locked local fixture, never the live database.
2. Save the original snapshot and manifest: export date, period, game/schema versions, record count, checksum, and a list of dropped or invalid documents with reasons. Remove external identifiers from the fixture that analysis does not need.
3. Normalize v1 into runs/decisions/snapshots/weaponIntervals. Separate voluntary actions from automatic rewards: evolution and the next chest are one reward choice and application, not two evolutions; do not count heal as a click.
4. Recover the build sequence from picks, chests, and recipes of the corresponding version; verify it against snaps/end. Do not guess missing values. Specifically, v1 stores in `w` only the weapons in current slots. After collab/evolution, the intermediate damage of a vanished weapon cannot be recovered exactly. Mark such intervals as incomplete; do not assign them zero damage. Account explicitly for the boundaries of the first and last incomplete minutes.
5. Add v2 telemetry in a backward-compatible way: seed, full version/balance hash, run/session ID and local player index for duo linking, tick/sequential event number, choice context (build, HP, available budgets), separate events for offer/action/reward application. Track cumulative counters for ALL weapons including absorbed ones, and ownership and evolution times.
6. For movement, collect compact input changes with tick and periodic positions/HP/nearest threats. Set volume limits, truncation flags, chunking, or limited session sampling. Exact replay needs initial version, seed, and full input; do not call a truncated record "exact." In duo, record the sequence of applied commands from both players and do not count two client reports as two matches.
7. Check delivery, idempotence, server rules, the 200,000-byte limit, and degradation when offline. Bots and smoke write to a local sink; delivery verification uses a stub service, and test data never reaches production.

Criterion A: reproducible report on the original 13 runs, correct 969 events/135 snapshots, explicit incomplete intervals; contract tests for v1/v2, evolutions, duo attribution, and delivery.

## 4. Phase B: unified runner

Proposed structure (names can change; responsibility division stays):

```
tools/simulation/{cli,runner,observe,record,replay,matrix,report}.mjs
tools/simulation/policies/{leveling,movement,chest,duo}.js
tools/simulation/profiles/          # strategy/skill configs, model version
tests/fixtures/telemetry/           # locked dataset and manifest
tests/simulation/                   # runner and policy contracts, regressions
tests/balance/                      # statistical checks, no old bot.js
tests/smoke/                        # user action scenarios
```

- Fixed timestep `1 / SIM.tickRate`. Acceleration means running more ticks, not increasing dt.
- Separate seeds for world, strategy, motor behavior, and network. Policy never consumes `sim.rng`, never peeks at future offers or hidden cooldown/RNG.
- The bot receives limited observation: HUD, its build and resources, current offers, visible threats/telegraphs/items, and what the minimap actually shows. Commands go through shared semantics of real actions with owner/picker checks. In duo a correct adapter is needed: solo `createActions` currently targets player 0.
- All states (running, levelup, chest, reveal, resume, pause, terminal) are handled explicitly. Watchdog detects lack of progress by ticks or actions even when game time is stopped.
- Bot telemetry matches the schema of human telemetry. In duo the shared event log cannot be cleared by the first observer before the second reads it. Deliver events to both, then clear, or use cursors.
- Each run produces an artifact: config/content/profile hash, seeds, actions, control hashes, results, stop reason, and diagnostic tail. Save full replay for errors, regressions, and selected control runs; save summaries for all.
- Verify that one scenario is equal when repeated and when run headless and lockstep; compare the same ticks, not wall-clock moments. Audit completeness of the current hashSim and add necessary control fields.

Criterion B: repeatable solo/duo runs, legal commands, no hidden HP/XP/card mutations in balance mode, stopping with diagnostics when hung.

## 5. Phase C: human decisions and build strategies

Start with an interpretable probabilistic model, not training a large neural network on 13 runs. A profile unit is the strategy of one run; you cannot identify a single player from this data.

The model evaluates only the offered options: upgrading an already-chosen main weapon, taking the second component of a recipe, defensive need, slot position, game stage, chance to complete a recipe, cost of a lost component in a collab, current build commitment. Selection happens through seeded sampling with tunable confidence. Priorities carry between levels. "Push one gun" is a separate strategy with commitment, not a randomly high weapon weight on one screen.

Profiles include rushing one weapon, rushing weapon-passive evolution, rushing weapon-weapon collab, expanding the arsenal first, defensive build, and adapting to whatever offers fall. A strategy has a plan B and can knowingly change its goal if offers are poor. Do not lock in popularity from 13 runs forever.

Reroll/banish/skip are decisions with normal game budgets and opportunity cost. Bans should not break a chosen recipe without explicit plan change. Chest policy chooses among actually offered super-weapons, accounts for future goal compatibility, and knows how to decline. Follow real rules: weapon components need max level, passives need any level, passives are kept; absorbed weapons free slots per core rules.

The strategy generator builds a graph from COMBOS/WEAPONS/PASSIVES: all 21 weapon-weapon pairs and 7 weapon-passive recipes, the hero's starting weapon, slot limits, and absorption conflicts. This is the set of bot goals; card generation stays standard game RNG. Do not cherry-pick only seeds where a recipe assembles. Count separately: component availability, offer arrival, choice, recipe readiness, chest access, recipe completion, and run success.

Keep the statistical human mixture separate from a research matrix of all builds. Otherwise, uniform sampling of rare combinations will skew the target 50%/75% loss rates. Research bots use the same decision engine with different intents.

Quality validation uses leave-one-run-out, not random shuffling of one run's cards between train and test. Compare against baselines of "first card," "uniform choice," and current weights using metrics like log-loss of chosen card, top-choice accuracy, proportions of new/upgrade/defense, series length of single-weapon upgrades, reroll/banish applicability, build composition, and assembly time. Break metrics by number of independent runs; 969 events do not equal 969 independent players. For context unknown in v1, use masks, not invented values.

Criterion C: the policy beats simple baselines on held-out runs, shows sustained strategy and adaptation on new seeds, and reports honestly about uncertainty with small samples. Quality thresholds are locked after baseline and before balance tuning.

## 6. Phase D: movement and duo

Separate build strategy from motor skill level. Movement profiles include reaction delay, target reassessment period, limited visibility, decision inertia, misjudgment of passages, greed for XP/chest, healing search, willingness to risk, and evasion from visible telegraphs. Errors should stem from behavior, not artificial HP removal or a command to die.

On v1, calibrate indirectly from curves of level/kills/damage/HP, boss times, and evolution timing, showing the uncertainty. After v2, use real input and trajectories. Do not claim exact human-like movement before these data exist. Compare distributions and alive counts at each time; show survival curves so weak deaths do not hide in the averages of the strong alone.

In duo, use independent strategies and seeds for both bots, shared XP and alternating picker, separate slots/HP/inventory, chest ownership, revival risk, and distance limits. Cover same and different skill, aligned and conflicting builds, both hero orders. Recipes are personal; you cannot combine components from the inventories of two players. Until real duo traces exist, the model is marked as a hypothesis.

Lock profile versions and mix weights after verifying realism. Changing them during tuning requires new independent validation. You cannot adjust movement to hit target loss rates.

## 7. Phase E: test and smoke replacement

Four independent levels of checks:

1. Fast unit/contract: RNG, damage/XP/HP, effects and radii, card/budget validity, recipes, absorption, ownership change, revival, states, and telemetry. Artificial fixtures are allowed for isolated mechanics, but their results do not feed balance.
2. Deterministic integration/replay: legal full paths through levelup-to-reroll/banish/take, chest-to-evo/skip, boss-to-overtime, death, duo revival, matching actions and hashes. A fixed scenario must reach the intended event; an empty sample is an error. Old traces are bound to game version; content changes should not require bit-for-bit match with old runs.
3. Playwright smoke: startup, hero/difficulty, controls, reopening choices, chest and confirmation, pause/resume, results, duo lobby, both pickers, and disconnect. Seeded policy with real input/UI, state waits, and bounded timeouts instead of sleeps. Separate controlled fixtures for rare screens with proof of action execution. Any test hook is enabled explicitly and gives no privilege to bots in balance runs.
4. Balance statistics: independent lengthy command, not a heavy import in every `npm test`. Small regression set on PR, full qualification set separately. FPS/memory/frame duration is a separate performance profile on known hardware; normal smoke checks progress and absence of errors.

For WebRTC, keep checks of two real pages with local signaling and add hash comparison on single ticks. For broad lag/jitter/loss/reorder scenarios, use deterministic transport in integration tests with real channel semantics. Do not claim local signaling validates production Firestore or TURN.

On failure: save config/seeds/profile, screenshot and Playwright trace, events, matching control ticks from both pages, and the last successful stage. Auto-retry is allowed only for flaky diagnosis, not to turn a first fail into a pass. Separately maintain a visual sandbox for god mode and weapon gifting, excluded from fair runs.

## 8. Phase F: balance tuning

Before making changes, save a baseline of the new system on current content. Do not use the current 6 wins/6 losses/1 quit as a reliable estimate of population win-rate. Quits and undelivered sessions bias the result.

Split seeds into tuning, validation, and qualification; use separate seeds for behavior. In tuning, use the same world/profile seed pairs to compare options while saving all outcomes. After qualification is first used to pick parameters, it is no longer independent. The next cycle needs a new locked set.

Order of tuning:
1. XP and leveling pace: time to levels, build availability, solo versus shared XP difference in duo.
2. Enemy HP, density, type, and speed; contact and projectile damage; threat windows for waves and bosses; hero health and healing.
3. Base weapons by level: effective and raw damage, useful hits, overkill, coverage/control, contribution at equal stage and investment cost.
4. Evolutions and collabs: timing, power and survivability gains, absorption cost, competing recipes, and slots. Compare achieving the recipe separately from the power of the assembled result.
5. Cursed and duo multipliers. After each change, rerun all four modes, as their parameters are linked.

All game numbers change in `src/data/`. Tune in batches with before/after reports. Start by checking sensitivity to small changes, then limited search over significant parameters. Do not add special checks like "no evolution, kill/buff the boss." Required difficulty should come from real weapon power and actual threats.

For no-evolution, use a legal policy of refusing super-weapons from chests while doing normal leveling and healing. Verify no alternate or automatic path gives evolved weapons; if it does, that is an experiment error, not a no-evolution win. Compare with allowed evolutions on the same starting seeds and profiles. After different choices, further RNG naturally diverges.

Minimum final qualification: 400 independent runs per mode of the four main ones, stratified by the locked profile/hero mix; do not count duo partners as independent. Print 95% intervals and the acceptance criterion: the interval for loss percentage must lie entirely in the target range. At data boundaries there may not be enough; expand the set per a predefined plan, not by cherry-picking successful seeds. For no-evolution cursed, a separate set of at least 200 matches per mode with an exact one-sided interval. Zero wins on a few seeds proves nothing.

For 28 recipes, a separate coverage matrix with run budget set after measuring speed. Report includes attempt count, assembled builds, intervals, evolution time, win rate, and death reasons. Mark a rare recipe with insufficient n as "insufficient data." Overall loss percentage does not justify a broken recipe, hero, or immortal strategy. Do not demand equal win-rate from all strategies, but investigate large stable outliers.

## 9. Execution order and readiness

1. A: snapshot and validator, v1 completeness audit, v2 format and measurement checks.
2. B: runner, replay, fair actions and duo attribution.
3. C/D: card selection, recipe generator, movement and duo profiles; quality baseline and model lock.
4. E: regression and smoke migration; remove old bot/run/multi/death/boss after porting useful scenarios; `tools/playtest.mjs` uses shared policy or becomes explicitly visual.
5. F: balance baseline, data tuning, full independent qualification.
6. Immortal diagnostic cohort and weapon interaction research (section 10), external benchmarks (section 11). Start these while tuning weapons in phase F.
7. Command documentation, data manifest, approved profiles and seed sets, before/after report, limitations list. All changes pass lint, fast tests, and smoke; qualification runs separately and saves artifacts.

Proposed commands: `test` (fast unit/contract/integration), `smoke`, `telemetry:export`, `sim:run`, `sim:replay`, `balance:quick`, `balance:full`, `balance:report`, `perf`. One command and a manifest should reproduce any failed run.

Do not accept work based on green tests alone or on death percentage. Readiness means reliable measurement, a model validated on held-out data, honest random draft, locked behavior profiles, stable smoke, coverage of all recipes and duo, statistically confirmed targets, and reproducible reasons for every failure. Until human duo/movement v2 exists, explicitly note which parts of realism remain preliminary.

## Handoff after telemetry expansion

V2 is already implemented: offer/choice contexts, pre-application snapshots, full cumulative damage, input changes from both players, second-by-second positions and threats, shared duo sessionId, size limits with explicit losses, and local send queue. Contracts are checked in `tests/unit/telemetry.test.js`. This is a partial phase A implementation. Still needed: locked dataset, validator, new analyzer; full network replay, immutable git build ID, and storage without truncation require more work. Do not count these complete just from v2 existing.

## 10. Immortal bots: interactions, radii, and weapon utility

User requirement: run diagnostic immortal bots alongside normal bots with the same movement, draft, leveling, slot, and chest rules. They measure weapon power and interactions across the entire stage, including late builds. They do not count toward the 50%/75% target loss rates.

### Immortality protocol

- Same policy, its seed, and normal world RNG, with the same information and card limits. The only explicit intervention is protection from final death.
- Normal damage, armor, i-frames, healing, and low-HP decisions keep working. Record a shadow-death when a hit would be fatal and apply a documented rescue mechanism. Its implementation is in a diagnostic adapter, not production balance. Do not set huge maxHP or heal every frame.
- Store prevented deaths, rescue heal magnitude, received raw and effective damage, and intervention time. Up to the first intervention, normal and immortal runs on identical input should match.
- "Same rules" does not mean identical subsequent trajectories. Immortality changes HP, risky decisions, and available experience. After first rescue, this is a diagnostic result, not a continuation of observed human survival. A separate open-input replay is possible for scenario comparison but does not replace adaptive bots.
- In duo, distinguish a live pair, one immortal, and both immortal. Main damage research uses both immortal; revival and fair difficulty are checked in normal cohort. List all interventions explicitly in the manifest.

### Two kinds of experiments

1. **Natural assembly.** A bot intending to build a recipe plays the full stage on normal random offers. Measure probability and time to achieve it, cost in levels, contribution before and after evolution, and behavior in real waves. Keep incomplete attempts.
2. **Controlled weapon stand.** Separate marked fixtures with matching enemies, geometry, target count, HP, investment level, passives, and movement. It is allowed to set a starting build to measure mechanics; do not pass such a test off as a honestly assembled run. Compare A, B, and A+B, plus control at equal upgrade budget, not just two weapons against one. Replicate on different seeds.

Connection: fixtures explain mechanics; natural cohort checks whether the effect appears in the real game. Late immortal bots should not be the only source of difficulty tuning.

### Interaction metrics

Extend the diagnostic combat recorder with hit events including target UID, weapon/source component, tick, distance, HP before and after, raw and effective damage, overkill, knockback, and target state. Store detailed logs locally and selectively, and aggregates for every run. For composite collabs, distinguish the final weapon from its components.

- DPS separately by game time, ownership time, and real opportunity to hit; bosses, elites, and normal mobs separately. Available targets and distance distribution are needed to distinguish zero damage from lack of opportunity.
- First hit, follow-up hits, and finishing; pairs like "A prepared, B finished" for one target, HP removed by each weapon. Do not give the entire kill value to the last hit.
- How many enemies the ranged weapon kills before they enter melee range; how many it weakens to finisher HP; delay to first melee hit and available sword swings.
- Knockback toward and away from the player, time outside melee radius, delayed or broken approach, time under control. Lightning might help the sword by preparing HP or hurt it by knockback. This is a testable hypothesis, not guaranteed synergy.
- Marginal contribution: change in overall effective DPS, kill time, missed enemies, and incoming damage when removing or replacing a weapon at comparable cost. Sum of single DPS is not the expected pair DPS; targets compete for one HP pool.
- Separately, cost of radius, arc, aiming and direction, pierce, target count, attack frequency, and projectile range. The sword auto-aims the first hit of a series at the nearest target; later swings alternate sides. This is not manual aiming by movement direction. Check correct positioning and target availability to avoid compensating for bot error with sword buffs.

User's target scenario: lightning sets up and controls the crowd, and the arc sword has real finishing potential and useful marginal contribution. If ranged systematically zeros sword participation, the report shows attack suppression. Radius, control, attack pace, and damage are tuned together. Do not demand equal personal DPS from all weapons or auto-raise sword damage on every zero.

### Shields and other defensive properties

Shields that block projectiles must pay for defensive utility with less pure offensive potential than comparable attacking alternatives. Measure not just DPS: number of intercepts or blocks, damage from blocked projectiles separately from contact, threat density removed, incoming player damage, and survival chance change in paired controlled scenarios with shields on and off.

Treat intercepted potential damage as an upper bound, not automatically "prevented." Not every projectile would hit the player without the shield. Check counterfactual results on comparable scenarios and show uncertainty. Similarly account for control and knockback of other weapons. With immortal bots, shield value appears through incoming damage and shadow-deaths; confirm it with normal bots through survival.

### Coverage and output

Matrix of all base pairs, 28 recipes, key passive combos, evolutions, and collabs; early, mid, and late stage; dense crowd, sparse, ranged enemy, boss; solo and duo. Complete uniform Cartesian product is not needed. Start with pairwise coverage and representative scenarios, expanding on found anomalies.

Output artifacts: suppression and synergy table for pairs, setup and finishing chains, contribution graphs by distance and minute, DPS at equal investment, defensive utility, assembly cost and probability, confidence intervals, and manifest. Defects like sustained zero sword contribution with available targets must have a reproducible scenario.

## 11. External benchmarks: Vampire Survivors and HoloCure

The user permits using wikis and open balance data from both games. During execution, find current sources, check versions and dates, and save links and a number origin table in the report. Prefer official patch notes, then open game data, then documented community wikis. Note version conflicts; do not use unverified values as required standard.

Study weapon levels, base damage, cooldown/hits/area, knockback, target limits, weapon evolution/collaboration and conditions, XP curve, HP and wave density, defensive items and their damage trade-off. Derive ratios: kill time for a typical target, damage per investment unit, range as a fraction of screen size, evolution availability by stage duration fraction, power gain after evolution.

Use these ratios as benchmarks and experimental hypotheses, then verify on your own core and human telemetry. Do not port absolute numbers or win-rate directly. Stage duration, geometry, HP, control, XP economy, and cooperative mechanics differ. User goals for Fury Survivors come first.

Note on current implementation: shields now **block** enemy projectiles (`_blocked`), not reflect them. The plan evaluates actual interception; measure reflected DPS only when reflection mechanics appear. V2 already includes per-minute cumulative firstHits/finishes/finishesAfter, hits by distance, knockbacks, bossDamage, and count and raw damage of shield intercepts. These are aggregates. Detailed target-level recorder and controlled counterfactual trials remain a Sol task.

## Implementation status for v2

- Telemetry, mechanics, coop, and lockstep contracts checked: 73/73; lint passes.
- Browser levelup and duo checks extended with telemetry assertions and pass.
- Full old set is not green: noupg balance and leaderboard timeout also reproduce on clean HEAD before changes. Cloud smoke found FPS below 50 and hang on old screens scenario closing Chest. These are not acceptance criteria for the new stand. When implementing it, diagnose causes instead of hiding them under reruns.
- npm test fixed to explicit *.test.js: old directory paths did not run with Node 24. New bot functions and balance changes are not yet implemented.
- V2 telemetry and description audit publish separately from this plan. Bot rebuild and balance tuning remain next-phase work.

## 12. User priority: experience economy first

**XP is the first balance lever.** At normal and cursed, significant development options should remain until 15:00. Dense cursed crowds should not pay for a full build long before the final boss and strip difficulty. Check and tune experience first, then other parameters. Do not start with mass weapon nerfs.

Reading snapshot October 23, 2026, public Firestore `fury_scores`, `fury_scores_coop`, `fury_runs` (IP and nicks not needed for analysis):

- Solo leaderboard: 29 documents, 12 normal / 17 cursed. In the window 14:00–17:00 normal:
  levels 80, 80, 83, 75, 75, 85, 87 (time 942–1006 sec); cursed: 114, 118 (1002–1004 sec).
- Duo leaderboard: 7 documents, 1 normal / 6 cursed; normal 36 at 343 sec, best cursed 110 at 1080 sec. Data for late normal/duo comparison is insufficient.
- Telemetry at exactly 15:00: normal [85] (1 survivor); cursed [78, 86, 105, 93, 91] (5 survivors). At 5:00 normal [29, 28], cursed [32, 40, 37, 38, 34, 38, 36, 31, 22].
- First auto-heal instead of next choice: normal 810.1 sec; cursed 697.9, 736.4, 746, 832.6, 849.1 sec. This directly suggests choice pool exhaustion in those runs, but not proof the player assembled every piece of content. Slots, banish, absorbed components, build composition, and early death all factor in.

Leaderboard is a sample of published results, not random players; documents may duplicate participants or pairs and belong to different versions. Do not mix final level after overtime with 15:00 level or infer target loss rate from the leaderboard. The numbers above are problem indicators, not ready statistical calibration.

### Experience experiments

1. Decompose experience flow: spawned/killed XP, picked XP, ground losses, difficulty bonus, coop multiplier and shared level, chest rewards separate from levels. On the same profiles, compare 1/3/5/10/15 minutes and time to first and next meaningful upgrade.
2. Measure not just level but remaining capacity of chosen build: number of reachable non-heal upgrades given slots/banish/consumed, incomplete recipes, percent of levels already invested, meaningful alternatives in offers, fraction of auto-heal, and time to choice exhaustion. "Options remain" does not mean ten more level points after maxing a weapon.
3. Keep startup brisk and slow mid and late leveling smoothly. Check current XP threshold bonuses at levels 20 and 40. Do not add sharp new thresholds that worsen long pauses. Compare smooth piecewise-linear and power curves with few parameters; no special limits based on bot identity.
4. Hold the normal/cursed gap manageable through enemy reward and XP curve. At 50% more spawn, xpMul=1 creates positive feedback: more enemies, more XP, faster strong build, more kills. A reciprocal around 1/1.5 is only a search start, not a ready fix. Enemy HP, kill pace, and loot availability are not linear.
5. In duo, count useful choices per player, not shared level alone. Verify that lower XP does not deny one player a reasonable evolution path, and compare equal stage time fractions for both modes.
6. Do not pick a level target number before estimating build budget. Preliminary criterion to align with data: most human survivors at 15:00 still have at least two reachable upgrades, and shifting to auto-heal before 15:00 becomes rare. Lock the threshold before qualification. Separately check the fastest rush and actual offered alternatives.
7. Compare median level difference between normal and cursed at the same control minutes and profiles, with survivor count and intervals. Do not demand level equality; cursed should stay harder without mass early exhaustion.

### Why reducing XP alone does not prove difficulty

In the current `spawnBoss`, HP equals hpPerLevel times level at spawn (plus bossHpMul in duo). Slower leveling simultaneously weakens the build and cuts boss HP. Show both effects, boss kill time, and win probability. If they cancel, separately justify changing boss HP dependence on level/time. Do not assume less XP automatically guarantees 50%/75% losses.

Success criterion: meaningful decisions remain at minute 15, desired evolution is reachable with good choices and normal RNG, pauses between upgrades do not hurt pace, the leveling gap narrows, and all four target loss ranges are confirmed by independent fair runs. Immortal runs show DPS and late-build potential but do not determine these percentages.

## 13. Description audit

Before execution, 35 weapons, 9 passives, 8 enemies, and 4 bosses were checked against data and behaviors. Text in en.js was corrected for use in both Codex and cards/chests: projectile destruction by all orbit variants, combo part independence, arc sword auto-aim and alternation, Death Spiral returning fans, ghost and succubus behavior, exact passive properties. Cursed HP applies to normal enemies and elites, not bosses.
In Codex, radius, pause, and interval parameters are labeled by behavior; recipes are explicitly chest-sourced and trade within the panel. Enemy stats are marked as base; contact damage is named separately from attack damage. Combat numbers and properties did not change for text correction.


## 14. Clarifications on experience collection and duo

A player is not obliged to pick the nearest crystal. Profiles `focus` and `collab` accumulate XP on the ground, then return to collection. `Opportunistic` prefers available magnet. Mixing these strategies is preliminary; it needs verification on new v2 trajectories. Minute snapshots store base XP from owner kills, picked XP, and ground XP total. Magnet event records the supply before attraction. A burst of levels after magnet cannot read as even leveling or several independent movement choices.

In duo, cards alternate, but the previous cost of the next level grows after each team card. So identical shared level gives roughly half the personal choices. Simple doubling XP does not guarantee doubled upgrades at rising cost. The stand has a separate lever `coopLevelScale`. A value of 2 repeats each solo price for two successive team levels. Check it separate from `coopXP`, then together with smooth late curves and reduced positive feedback from cursed. This is an experimental setting, not clearance to call duo calibrated.
