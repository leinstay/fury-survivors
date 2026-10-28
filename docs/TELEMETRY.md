# Telemetry for simulating players

Version 2 saves data to the same `fury_runs` collection, one document per player per run. External document fields are compatible with current `firestore.rules`. New fields are in JSON `data`. Changing rules for v2 is not needed. Old `picks`, `snaps`, `end`,
`levels`, `hurt`, `bosses` and summary fields are kept.

## What to collect in new sessions

- `sessionId`: random match identifier. Host sends it to guest. `local` distinguishes the two participants. Count duo matches by sessionId, not by document count.
- `seed`, `fingerprint`: initial seed and full 32-bit simFingerprint (data and control run), not Git SHA. Keep source code of the version you played.
- `initial`: starting build, HP, XP, choice budgets. `tickRate` is sim frequency.
- `offers`: upgrade/chest offers, time and active tick number, context before choice.
- `decisions`: action and actual options, tied to offerId, context before action,
  budgets before spending, decision time `decisionMs` by local clock. Includes UI show/animation and wait, not pure reaction time. For `chest` context is after reward applied, `phase: after`. Notification, not another choice.
- `applications`: each dealt card, evolution/collab components, build and cumulative damage right before deal. `heal` can apply automatically. In duo healing redirects to live partner by game rules from the picker.
- `inputs`: changes to actually applied input: `[activeTick, x0, y0, x1, y1]`.
  Solo only first pair. Values unrounded, first tick = 1. Input between records stays the same. Sim active ticks, not lockstep network ticks.
- `movement`: roughly once per game second. Position, HP, XP/level, nearest enemy,
  enemy projectile, XP, food, chest, up to eight telegraphs, partner position and state.
  Nearest object: `[type, dx, dy, vx, vy]`. Diagnostic environment, not ready bot observation. Future policy should limit to player visibility.
- `snaps[].damage`, `end.damage`: `[weaponId, dealt, raw, hits, kills]` for all weapons,
  including ones gone after evolution. Old `w` describes current slots. Damage deltas give interval contribution. Applications mark evolution boundaries.
- `events`: damage taken, falls in duo, revivals, bosses, win/loss, overtime,
  items besides many XP crystals. `won`, `overtime`, `revives`, `distance` let you separate final boss win from later survival.

Two observers of one sim get independent events. Choices recorded at execution, even with no game tick between. Collector doesn't touch RNG.

## Completeness and delivery

Detailed streams (decisions/offers/applications/inputs/movement/events) stored lossless in `detail: { encoding: "gzip-base64", data }`. Script runs-report unpacks them back to arrays on JSON export. Old picks/snaps/end stay normal JSON.

Memory limits in `src/data/telemetry.js`. Before sending, UTF-8 size checked, strictly under 200000 bytes. If even compressed doesn't fit (or browser lacks CompressionStream),
uncompressed form with stream tail shortening is used in order:
`offers`, `movement`, `inputs`, `events`, `applications`, `decisions`, `snaps`, `picks`,
`levels`. Offers also in decisions/picks. Summary and end kept.

`capture.total`, `stored`, `dropped` hold original/saved/lost record counts. Losses include memory limits and pre-send packing.
`inputComplete` says if input is fully saved. `inputThroughTick` is the last input change record, not necessarily last run tick. Can't continue last vector to end with incomplete stream. When picking data, check completeness of each stream you need. Don't count later minutes after truncation as zero.

`exactReplay` always false now: full network timeline of pauses/commands not recorded, no guarantee all streams saved. Data for training and calibration, not bit-for-bit network match replay.

Before sending, record saved to localStorage `fury.telemetry.outbox.v2`.
After error/timeout, retry on next run start or next submit. Document ID = sessionId + local. Retry doesn't create second run. If creation response lost, client validates existing document. Site data cleanup clears the queue. With unavailable/full localStorage, just current page memory stays. Closing tab mid-run doesn't save it.

Automated browser (`navigator.webdriver`) doesn't submit or clear queue via production. Finished debug-sims don't collect telemetry. No nicks or IPs in records.

## Export

`node tools/runs-report.mjs --json tools/out/runs.json` reads old and new records.
Command fails on HTTP error and warns of shortened streams. Old text report by `w` stays approximate for evolution minute. New analyzer from plan should use `damage` and `applications` and account for interval length.

For new data, useful: normal/cursed, solo/duo, different heroes, one-weapon rush,
collabs and weapon+passive evolutions, failed builds and evolution refusals. Play normally. Deaths and bad offers matter like wins.

## Weapon interactions

In snaps/end additionally: `combat[weapon]`: hits, firstHits, finishes, dealt, raw,
bossDamage, knockbacks, distanceHits (edges in capture.distanceBins) and finishesAfter.
Last is number of finishes on targets others hit earlier from `player:weapon`.
Association by one target, not proven synergy. Sum can exceed kills if multiple weapons hit one target. firstHits means first hit on target across both players. After enemy object reuse, UID resets history.

`blocks[weapon]` has count and interceptedRaw. Shields destroy projectiles, not reflect.
Sum of intercepted projectile raw damage doesn't equal prevented player damage. Some projectiles may have passed by. Data needed for defense usefulness in weapon comparison.

## Experience on ground and magnets

`snaps/end.economy` has `generatedXP` (base reward from kills by this player),
`pickedXP` (actual crystal value picked) and `groundXP` (party total on ground).
In summary `economy` first two are cumulative. Generated/picked rewards don't match: difficulty/duo multipliers apply on drop, XP from objects, and in duo kill and pickup can be different players. `groundXP` in two duo documents can't be summed.

`magnets` fixes tick/time, shared level and XP reserve before pull. Magnet doesn't award XP itself. `pickedXP` gain appears when crystals land. With input, movement, and levels, this lets you tell crystal avoidance from collecting saved XP.
Stream compressed with the rest, subject to explicit capture limits.

`source` is SHA-256 of all runtime module contents, not the manifest file itself.
Before publishing run `npm run build:manifest`, check `node tools/build-manifest.mjs --check`.
Replay of human session still not claimed. Input recording is limited.

Main verified export now `npm run telemetry:export -- --from ...Z --to ...Z --out tools/out/telemetry`.
Normalizer `tools/telemetry/data.mjs` marks incomplete v1 intervals, doesn't write zero damage.

## Co-op stall diagnosis

Final `terminal` saves state/picker/pendingLevels/resumeT at record end moment. On Game completion also sends `terminal.diagnostics`: network tick,
paused/local, waitT/silence, overlay name and active/closed/alpha/input/keyboard of its scene.
Snapshot taken before send, doesn't touch game RNG. Disconnect at 6:11 this way is told from normal exit, unfinished choice, and invisible screen.
Old records without terminal stay readable. Missing field doesn't mean running.
