# Simulations, bots, and balance verification

The stand runs the real `src/core/sim.js` at 60 Hz. Bots receive actual RNG cards, pay normal reroll/skip/banish, and choose chest recipes through shared actions. Movement and choices use their own RNG and screen/minimap observation, not future offers, hidden enemy HP, or sim RNG. Movement reacts with delay, accounts for threats, items, partner, and XP accumulation for magnet.

For tools use Node 24 and `npm ci`. For browser use `npx playwright install chromium`.
Commands run from the repository root. Experiments write to ignored `tools/out/`.

## Data and preference model

```bash
npm run telemetry:export -- --from 2026-10-23T00:00:00Z --to 2026-10-24T00:00:00Z --out tools/out/telemetry
npm run telemetry:report -- tools/out/telemetry
npm run telemetry:train
```

Export reads all pages, checks HTTP and schema, unpacks v2 details, removes document IDs, hashes sessionId, saves manifest and checksum, and lists rejection reasons. `--to` is exclusive. CI never uses the network. `tests/fixtures/telemetry` contains locked 13 v1 solo runs. To update training, first deliberately replace the fixture and its manifest. Training checks the checksum and generates `model.mjs` and validation.

The model is interpretable card preferences, validated by leave-one-run-out. Both players from one session cannot be in different training/validation splits. Auto-heal and applying an already-chosen evolution do not count as independent clicks. Unknown HP and budgets, and damage lost with v1 collab, stay unknown. Recovered end builds are checked for match; v1 recipe history is not yet confirmed.

`profiles.mjs` locks a mix of focus/evolution/collab/adaptive/defensive with separate version. Strategy persists between offers; RNG may not deliver the desired pair. All 21 weapon pairs and 7 weapon/passive recipes exist. Profile proportions, reaction, and movement are preliminary: old data test preferences but not trajectories or duo.

## One run and exact replay

```bash
npm run sim:run -- --seed 42 --players 2 --difficulty cursed --profile focus,evolution --out tools/out/simulation/duo.json
npm run sim:replay -- tools/out/simulation/duo.json
npm run sim:run -- --config tools/out/simulation/duo.json --until 120
npm run sim:run -- --seed 42 --immortal --detailed --out tools/out/simulation/diagnostic.json
npm run sim:run -- --seed 42 --no-evolution --out tools/out/simulation/no-evolution.json
```

Config supports independent `behaviorSeed`, heroes/profiles, per-player `immortal` and `noEvolution` masks, `until` horizon (1080 seconds default), and `experiment`.
`--telemetry` creates a local v2 record without sending to Firestore.
Exact replay stores input by tick, commands, detailed checkpoint and final hashes, and source/model/profile versions. It requires the same source version. Human v1/v2 records are not declared as exact replay. Watchdog hang and exception give `error`. Reaching horizon gives `timeout`. Victory is recorded on first `sim.won`.

Immortality intervenes only on lethal damage, preserving the original hurt call and its effects. Each rescue records its tick and reason; maxHP and weapons do not grow.
These results diagnose late builds and do not enter loss rates.

## Cohorts and acceptance

```bash
npm run balance:quick -- --n 20 --workers 3 --out tools/out/simulation/baseline.json
npm run balance:quick -- --n 20 --split validation --out tools/out/simulation/validation.json
npm run balance:full -- --out tools/out/simulation/qualification.json
npm run balance:full -- --n 200 --no-evolution --out tools/out/simulation/no-evolution.json
npm run balance:quick -- --n 5 --immortal --out tools/out/simulation/immortal.json
npm run balance:quick -- --n 2 --recipes --immortal --out tools/out/simulation/recipes.json
npm run balance:report -- tools/out/simulation/baseline.json
```

`n` is matches per mode (normal/cursed and solo/duo). The recipe matrix additionally cycles 28 profiles. Duo counts per team. Tuning/validation/qualification seeds do not overlap. Use tuning to pick parameters, validation to select, qualification once after locking parameters and behavior. Do not tune by qualification.

`qualified` requires at least 400 independent unique qualification matches per mode, zero error/timeout, and the full 95% Wilson confidence interval inside 45–55% losses for normal and 70–80% for cursed.
Cursed without super-weapons: at least 200 matches with an upper one-sided 95% win limit of at most 5%.
Normal without evolution has no target percentage. Recipe, immortal, and partial-no-evolution cohorts display separately and do not receive main qualification.

The report shows all outcomes, survivors per minute, level, useful personal applications, remaining reachable alternatives, and early auto-heal. Minute medians depend on survival; you cannot compare them without `n`. Stored are XP generated/picked/ground, magnets, recipes, blocks, incoming damage, and interventions. Full JSON is needed for your own analysis.

An experiment is specified as JSON, passed via `--experiment path.json`, and applied only inside a run or replay. After, production data and fingerprint are restored:

```json
{
  "xp": {
    "steps": [{"below":20,"per":10},{"below":40,"per":25},{"below":1000000000,"per":45}],
    "thresholds": []
  },
  "cursedXP": 0.9,
  "coopXP": 1.25,
  "coopLevelScale": 2
}
```

This is a candidate example, not proven balance. `coopLevelScale:2` uses personal circles: team levels 1 and 2 cost like solo 1, team 3 and 4 like solo 2. Check personal leveling, evolution availability, exhaustion at 15:00, and boss HP based on shared level, all at once.

## Weapons and defensive effects

```bash
npm run sim:combat -- --all --n 3 --seconds 30 --out tools/out/simulation/combat.json
npm run perf
```

Combat is explicitly set builds, immortality, and fixed crowds of normal, fragile, ranged, and boss.
Each pair is tested as A, B, A+B, and single weapon with extra passives at equal upgrade investment. Collab marks recipe cost separately.
All variants share motion tape and spawn seed. Enemies respawn as they die: this is equal opportunity, not identical kill list.

Stored: effective and raw damage, overkill, combo part hits, distances, geometric target availability time, first-hit-to-finisher chains, and knockback. This separates low sword DPS from lack of nearby targets, early lightning kills, and useful finishes.
Simultaneous hits alone do not prove synergy. Use paired comparisons. Shields have block-on/off with shared input. Destroyed projectiles and interceptedRaw do not equal prevented HP. Fixture DPS does not predict team win probability.

Performance reports CPU and node mean/p95/p99/max separately from correctness. Values from loaded CI do not become a random FPS gate.

## Browser, checks, and publishing

```bash
npm run build:manifest
node tools/build-manifest.mjs --check
npm run lint
npm test
npm run smoke
node tools/playtest.mjs 60 --shot tools/out/playtest.png
```

Smoke uses the same policy with real keys and pointer. Seven scenarios check startup and progress, cards, chests and evolution and decline, pause and results, Codex, leaderboard, and real WebRTC with hash match on identical ticks from both clients.
Local signaling replaces Firestore; transport stays WebRTC. Rare UI state fixtures are marked explicitly. Readiness is checked by state and tick, not mean FPS.
Visual playtest uses the same driver. `--god` and `--weapons` are explicit diagnostic modes; their results do not feed qualification.

`build:manifest` updates the runtime SHA-256 in `src/data/build.js`. Do this after runtime changes before commit or deploy. New human records are bound to this source.
