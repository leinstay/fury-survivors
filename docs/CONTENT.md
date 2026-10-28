# How to add content

Balance and content live in `src/data/`, UI strings in `src/i18n/en.js`, and sprites in `assets/sprites/` with keys in `assets/sprites/manifest.js`. Each record describes its format in a comment at the top of its data file. For sprites, see `docs/ASSETS.md`.

Common to all recipes:

- i18n keys are derived from ids, as shown in the table in `docs/ARCHITECTURE.md`. Missing a key: `t()` returns the key itself and the game doesn't crash, but the screen shows `weapon.x.name` instead.
- Any sprite referenced by data must be in `manifest.js` and exist as a file. The test `manifest: every sprite has a file` checks this. While real art is being made, `npm run placeholders` creates dummy sprites from the manifest entry (existing files are untouched unless you pass `--force`).
- After edits, run `npm test`. Tests in `tests/unit/data.test.js` count content items (currently 7 regular weapons, 9 passives, 2 combos, 6 enemies). When adding an entity, deliberately update these numbers in the test.

## Weapon with existing behavior

Behaviors: `slash`, `melee_arc`, `projectile`, `orbit`, `aura`, `boomerang`, `chain`, `area_drop`, `beam`, `summon`, `cloud`, `slam`, `impale`, `ice_orb`. The meaning of level fields for each behavior is described in the header of `src/data/weapons.js`. A summary of recent changes:

- `slash` (Blade Arc, Crimson Arc): a sword sweep through the densest group of enemies, not a cone. Once per `cooldown`, a series of `amount` slashes with a pause of `WEAPON_BEHAVIOR.slash.gap` between them. Before each slash, the weapon finds the enemy center with the most enemies in a circle of radius `clusterR` within `searchRange` of the hero, selecting no more than `candidates`. The slash passes through the group's center of mass along its longest axis. An elongated group is cut lengthwise, a round group (see `elongation`) is cut across the direction from the hero. Later slashes in the series target other groups at least `apart` × `clusterR` away. If no other groups exist, the slash crosses the same group again. With no enemies, it targets the nearest object, otherwise it cuts along the hero's movement direction. A segment of length `area` and width `width` (both multiplied by the `area` stat) sweeps from start to end over `sweep` seconds, hitting each touched enemy once and knocking them away from the line. The bleeding status applies like other hits. No RNG. Visual: the slash zone in `src/render/zones.js` (trailing line, center, white core, additive blending, drawn above characters) is tinted by the weapon's `tint` color. The old `melee_arc` cone behavior remains in the registry but no weapons use it now.
- `slam` (Hammer, Titan Maul): a circular ground strike of radius `area`, not a cone. A series of `amount` strikes. The first strikes beneath the hero, offset toward the nearest target by `WEAPON_BEHAVIOR.slam.offset` × `area`. Each following strike happens in the next direction around the hero at the same distance, with a pause of `gap` between them. The hammer doesn't reach beyond `area` × (`offset` + 1). Each strike hits all enemies in the circle once and knocks them away from the center by `knockback`. At each impact point, a crack appears with radius `area` × `crack` that lasts `duration` seconds. Enemies in the crack move at `slow` × their normal speed and remain slowed for `slowTime` seconds after leaving it. The crack itself doesn't deal damage and fades out at the end. Visuals: the `boom` and `crack` zones in `src/render/zones.js` are tinted by the weapon's `tint` color.
- `impale` (Spear, Dragon Lance): one spear (`amount` 1) fires at the nearest target, pierces through `1 + pierce` enemies, and pins each one for `pin` seconds. Pinned enemies slow to 0 speed via `applySlow`, but bosses are affected at half strength. The spear then lodges in the ground and sticks out for `WEAPON_BEHAVIOR.impale.stuck` seconds. With a `burst` value, the embedded spear detonates in a circle of radius `burst` (multiplied by the `area` stat), dealing `damage` and pinning all enemies in the radius. A beam (`beam`) fired from the spear differs: it travels in a random direction and bounces off each hit.
- `ice_orb` (Frost Orb, Blizzard): a large slow-moving sphere (radius `area`, traveling at `speed`, lasting `duration` seconds) that fires at the nearest target, pierces all enemies, and hits each one inside once every `tick` for `damage` while chilling them. Chilled enemies move at `slow` × their normal speed for `slowTime` additional seconds. With a `turn` value in radians per second, the sphere's trajectory spirals, and `amount` orbs split in all directions evenly. Currently chill uses `applySlow`, but it will later use the `chill` status.

- `cloud` (Poison Cloud, Miasma): a cloud appears under the hero, or on a nearby object if no enemies are within `WEAPON_BEHAVIOR.cloud.propRange`. It lasts `duration` seconds and hits each enemy inside once every `tick` for `damage`. The `area` field sets the radius. With `amount` set, each cloud has its own `cooldown` timer, with the initial clouds staggered by `cooldown / amount`. Clouds from the same weapon don't hit the same enemy more often than once per `tick`.
- `beam` (Beam, Prism Ray): once per `cooldown`, it fires `amount` beams from a circle around the hero in random directions (sim RNG, with the i-th beam in its own sector of 360° / `amount`). The beam body grows to `length`, then trails behind the head. Only the head deals damage. On hitting an enemy or object, it turns 90 degrees left or right, deals `damage` multiplied by `WEAPON_BEHAVIOR.beam.bounceDamageMul`, and loses half its length by retracting the tail. After `bounces` bounces, the next hit extinguishes it. The `area` stat doesn't apply to beams. Drawn as a trail in Victory Sword style using `render/zones.js` and the `snake` effect.

Self-aiming weapons (`projectile`, `boomerang`, `chain`, `summon`) acquire targets through `sim.nearestTarget`: the nearest enemy or destructible object from a single list. New self-aiming weapons should work the same way.

### Status (damage over time) on weapons

An optional `status` field on a weapon record or level (level takes precedence): `status: { type, chance, share?, duration?, slow? }`. Status types and default values are in `src/data/status.js`, with logic in `src/behaviors/status.js`:

| type | stacking | effect |
|---|---|---|
| `poison` | each hit creates its own stack with its own timer, up to `maxStacks` | damage |
| `burning` | one per enemy, the strongest remains and timer resets | damage |
| `bleeding` | like `burning`, only on slash-type weapons `melee_arc` and `slash` (test checks this) | damage |
| `chill` | stronger and longer of current and new | slowdown without damage (`slow`, `duration`) |

DoT damage is calculated as `share` × hit damage (after the `attack` or `magic` stat is applied, before crit), spread over `duration` ticks of `DOT.tick`. Ticks don't crit and are credited to the weapon that applied the status. A `chance < 1` draws from the sim's RNG. The Codex shows a line "… chance" per level (`codex.p.status_<type>` in i18n).

Radii for `aura`, `melee_arc`, and `orbit` use a shared ring ladder `RINGS` from `src/data/weapons.js`. Aura and slash set `area: RINGS[k]`. Orbit sets `area: onRing(k, ORBIT_R[sprite] * size)` so the projectile's visual edge aligns with the ring. Add new orbit sprites to `ORBIT_R`. The test in `tests/unit/data.test.js` checks this. Shields don't scale: base shields are T2, defensive upgrades are T1, offensive upgrades are T3.

1. `src/data/weapons.js`: add a record following the `throwing_daggers` pattern:
   ```js
   throwing_daggers: {
     icon: 'icon_throwing_daggers', sprite: 'proj_dagger', behavior: 'projectile', maxLevel: 7,
     levels: [ { damage: 8, cooldown: 1.0, amount: 1, speed: 280, duration: 1.2, pierce: 0, knockback: 40 }, /* ... 7 more */ ],
   },
   ```
   `levels.length` must equal `maxLevel`. Standard weapons have `maxLevel: 7`, `damage > 0`, `cooldown >= 0`, and damage never decreases between levels.
2. `assets/sprites/manifest.js`: `art('proj_<name>', w, h)` for the projectile and `item('icon_<id>', 24, 24, '#color', 'rect')` for the icon.
3. `src/i18n/en.js`: add `weapon.<id>.name` and `weapon.<id>.desc`. Optionally add `weapon.<id>.lvl<N>` for per-level descriptions on the level-up card (LevelUp.js checks for this before falling back to `.desc`).
4. Sprites: the projectile and icon go on the corresponding sheets in `tools/sheets.json` (`projectiles` and `icons`). See `docs/ASSETS.md` for details.
5. Tests: the test suite checks `data: weapons have behavior, icon, sprite and full level tables` and `data: sprites referenced by content exist in manifest`. Balance testing runs via `npm test` using the bot from `tests/balance/`.

Weapons automatically enter the card pool from the `WEAPONS` list. Evolved weapons (`evolved: true`) don't appear on level-up cards; see the "Evolutions" recipe below.

## Weapon with new behavior

1. Create a file `src/behaviors/weapons/<name>.js` exporting `export const <nameCamelCase> = { init(w, sim), update(w, sim, dt) }`. Use named exports only (the linter forbids `export default`). The `w` object holds the weapon state: `w.id`, `w.level`, `w.def`, `w.params` (current level's numbers where `params.damage` is already multiplied by the `attack` or `magic` stat depending on `dmgType`, `params.cooldown` is divided by `haste`, and `area` and `duration` are multiplied by their respective stats), and `w.slot`. To create projectiles, call `sim.addProjectile('player', w.def.sprite)` and fill in `life`, `radius`, `dmg`, `vx/vy`, and so on. See `projectile.js` for a simple example and `orbit.js` for a projectile that manages its own movement using `p.bk = orbit` and a `moveProjectile()` method. Fire a `weaponFire` event with `sim.events.push({ type: 'weaponFire', weapon: w.id })`.
2. Register the behavior: import it as a named import and add a line to `WEAPON_BEHAVIORS` in `src/behaviors/index.js`. The key name must match the `behavior` value in the data.
3. Then follow the steps in the recipe above. Code in `src/core/` doesn't import Phaser or DOM. Use numbers from `w.params`, not hardcoded values.
4. Document any new level fields in the header of `src/data/weapons.js`.

## Passive

1. `src/data/passives.js`: add a record `{ icon: 'icon_<id>', stat, levels: [...], minLevel? }`. The `stat` must be a key from `src/data/stats.js`, which defines whether it's a percentage or flat stat and sets its caps. All passives are percentage increases. The optional `minLevel` field prevents the card from appearing until the team reaches that level. Values must strictly increase. `maxLevel` equals `levels.length`.
2. To add a new stat rather than a new passive for an existing stat: add it to the hero's `stats` in `src/data/heroes.js`, handle it in `src/core/stats.js`, and apply it where needed in `sim.js`. This requires code changes, not just data edits.
3. manifest: add `item('icon_<id>', 24, 24, ...)`. i18n: add `passive.<id>.name` and `passive.<id>.desc`.
4. Tests: the test `data: passives are well formed` checks this and counts passives (currently 9).

## Hero

Heroes are defined only in `src/data/heroes.js`. The menu, selection cards, sim, and tests all read this list directly, so no changes to scenes are needed.

1. `src/data/heroes.js`: add a record `id: { sprite, portrait, menu?, startWeapon, stats }`. The `stats` field contains the full set from `src/data/stats.js`: `maxHp, attack, magic, speed, crit, critDmg, area, duration, pickup, haste, luck, resistance, regen, xpGain, dodge, thorns`. The optional `menu: { art, side }` puts a picture next to the main menu buttons. With `side: 'left'` it is drawn mirrored, and several pictures on one side stand further from the buttons in order. The order of records determines the order of selection cards.
2. Sprites in `assets/sprites/manifest.js`: the walk animation `chara('<id>', '#color')` uses 110×110 frames, with the count read from PNG width. Frame 0 is the idle pose. See `docs/ASSETS.md` for how to create the sprite and example (PixelLab, `hd-frames.mjs`, and the Mage example).
3. i18n: add `hero.<id>.name`. Hero stats aren't shown as raw numbers on the selection card. Instead, traits are shown relative to `HERO_BASE`, the average hero (`+ATK` in green, `-HP` in red, calculated in `core/heroes.js` as `heroTraits`). Labels like `trait.<stat>` already exist.
4. Tests: `data: every hero is complete` checks sprites, menu art, name, and stat set. `data: hero start weapons exist` checks that start weapons are defined.

The selection screen (`src/ui/hero-picker.js`) shows large cards for 2 heroes, or a grid of tiles for 3 or more (threshold `GRID_FROM`). Rows are sized to fit the largest tile, heroes are divided evenly across rows (7 becomes 4 + 3, 13 becomes 7 + 6), each row is centered. Below the grid is a line with the focused hero's name, weapon, and traits. The layout is tested with 3, 4, 7, 13, and 20 heroes from the game's roster. The screenshot script is described in `docs/COOP.md`.

Selection rules (`src/core/heroes.js`): unknown ids are replaced with `DEFAULT_HERO`. In co-op, each player picks their own hero (`distinctHeroes`). In the lobby, a partner's chosen hero is unavailable. If both players try to pick the same hero simultaneously, the guest yields.

## Enemy

Behaviors: `chase`, `dash`, `ranged`, `swarm`, `phase` (only bosses use `boss`). Behavior-specific parameters live in the corresponding file in `src/behaviors/enemies/`.

1. `src/data/enemies.js`: add a record like this:
   ```js
   foxgirl: {
     sprite: 'foxgirl', behavior: 'dash', hp: 26, speed: 50, damage: 9, xp: 4, size: 9, knockbackResist: 0,
     params: { range: 140, windup: 0.45, dashSpeed: 240, dashTime: 0.35, cooldown: 2.2 },
     elite: elite(0xff8040),
   },
   ```
   The `size` field is the hitbox radius in world pixels. Never use 0 for `hp`, `speed`, `damage`, `xp`, or `size`.
2. manifest: use `girl('<id>', 56, '#color', 'humanoid' | 'blob' | 'flyer')` (bosses use frame size 96). For the sprite: add a line to the prompt `tools/prompts/roster.txt` and a key in the `items` array of the `roster` sheet in `tools/sheets.json`, then run `node tools/slice-sheet.mjs roster`.
3. i18n: add `enemy.<id>.name`.
4. To make the enemy appear in a stage, add it to the `timeline` (see the "Wave and event" recipe).
5. Tests: the suite checks `data: enemies have behavior, positive stats, elite block` and `stage: timeline sorted and references known enemies`.

For a new behavior: create a file `src/behaviors/enemies/<name>.js` with `init(e, sim)` and `update(e, sim, dt)` functions, then add a line to `ENEMY_BEHAVIORS` in `src/behaviors/index.js`. See `chase.js` for an example.

## Elite

An elite version is not a separate record. Enemies have an `elite` block, and the test requires it on every enemy (`hpMul > 1`, `sizeMul > 1`, `drop === 'chest'`).

1. In `src/data/enemies.js`, add the block `elite: elite()`. The helper provides `hpMul: 8, damageMul: 1.5, sizeMul: 1.5, xpMul: 6, glow: 0xff3d6e, drop: 'chest'`. The `glow` color is the aura around the silhouette. To use different values, write the object manually.
2. Elite appearance: add an event `{ at, type: 'elite', enemy }` to the `timeline` (see "Wave and event" recipe). Elites always drop a chest (`src/core/sim.js`, and the test `chest: elite always drops a chest, boss drops one too` confirms this).
3. No separate sprite or i18n entry is needed. The renderer adds a pulsing glow in the `glow` color (the sprite itself isn't recolored) and scales the sprite by `sizeMul` (the same multiplier applied to its hitbox).

## Boss

1. `src/data/bosses.js`: add a record with the same fields as an enemy plus `attacks`, `rage`, and `drop`:
   ```js
   dryad_queen: {
     sprite: 'dryad_queen', behavior: 'boss', hp: 30000, speed: 34, damage: 44, xp: 0, size: 26, knockbackResist: 1,
     attacks: [
       { type: 'dash', cooldown: 5, windup: 0.8, speed: 260, time: 0.6 },
       { type: 'summon', cooldown: 8, enemy: 'catgirl', count: 6, radius: 90 },
       { type: 'slam', cooldown: 6.5, count: 4, radius: 36, delay: 0.9, interval: 0.55, damage: 34 },
     ],
     rage: { hpFraction: 0.5, cooldownMul: 0.7, speedMul: 1.25 },
     final: true,
     drop: 'chest',
   },
   ```
   Attack types:
   - `dash`: `windup` (animation delay and `windup` pose), `speed`, `time` (dash duration).
   - `summon`: `enemy` (from `enemies.js`), `count`, `radius` (enemies spawn in a circle around the boss, `cast` pose lasts 0.6 seconds).
   - `fan`: `count` projectiles in a fan toward the hero, `spread` (angle in degrees, full width), `speed`, `damage`, `life`. Optional `volleys` (default 1) and `interval` (pause between volleys, 0.4 seconds).
   - `ring`: `count` projectiles in a circle, `volleys` times with `interval` between them, each following volley rotated by `spin` radians (spiral effect). `speed`, `damage`, `life`.
   - `slam`: `count` ground strikes with `interval` between them, each targeting the hero's position at warning time. After `delay` seconds, a circle of radius `radius` deals `damage` if the hero is inside. The warning marker lives in `sim.telegraphs`, rendered by `src/render/world.js` as a red circle with fill growing during `delay`. A `slam` event fires on impact.
   - `blink`: the boss fades out over `delay` seconds (`e.alpha` drops to 0), reappears at `distance` from the hero, and fades in over `fadeIn` (0.3 seconds). A `bossBlink` event fires.
   - Any attack can have `rageOnly: true` to activate only during rage. Projectile and strike damage scales with boss damage growth over time (`stage.scaling`).
   - `hpPerLevel`: if set, the boss's HP is `hpPerLevel × player level` when it spawns (Vampire Survivors rule), and `hp` is ignored.
   - Fairness (shared values in `BOSS` of `src/data/bosses.js` apply to all bosses): fan and ring attacks have a `castDelay` windup before firing. They don't start while the hero is closer than `minRange`. Dashes stop `dashStop` pixels from the hero. After a dash or blink, the boss stands still for `recover` seconds before attacking again.
   - `rage`: when `hp <= maxHp * hpFraction`, a `bossRage` event fires once. Cooldowns multiply by `cooldownMul` and walk speed by the optional `speedMul`.
   - `final: true`: killing this boss ends the run in victory. Other bosses just drop a chest, fire `bossDown`, and the run continues. Every boss also drops a loot chest (`BOSS_DROPS` in `src/data/items.js`). The boss drops a `loot_chest`, collecting it opens the loot screen for all players (Loot scene, see `docs/META.md` section 2.1). On the 3rd and 4th chests (final boss and Reaper), an "End run" button appears to finish.
   - New attack type: add a branch in `src/behaviors/enemies/boss.js` and add the type to the test `data: bosses use known behavior, attacks and summons`. Add a mechanics test in `tests/unit/boss.test.js`.
2. manifest: 3 frames: 0 idle, 1 walk, 2 cast/windup (in `anim.js`, boss poses `windup` and `cast` show frame 2). Example: `dryad_queen` (128×128, standard density).
3. i18n: add `boss.<id>.name`.
4. Stage timeline: add `{ at, type: 'boss', boss: '<id>' }`. In the forest, three bosses spawn at 5:00, 10:00, and at `duration` (15:00, the final event, marked `final: true`). The director sends `bossWarning` `bossWarning` seconds before each boss. The HUD shows a `boss.warning` banner, and the HP bar takes the boss's name from `boss.<id>.name`.
5. Victory occurs after defeating a boss marked `final: true` (the `victory` state in `sim.js`).
6. Tests: the suite checks `data: bosses use known behavior...` and `tests/unit/mechanics.test.js` for boss-specific tests (warnings, poses, rage).

## Stage (Map)

See the format documented at the top of `src/data/stages/forest.js`.

1. Create a new file `src/data/stages/<id>.js` exporting `const <id> = { id, name: 'stage.<id>', duration, bossWarning, tiles, props, scaling, timeline }`.
2. Registration: stages are currently hardcoded. Edit `const STAGES = { forest }` in `src/core/sim.js` (and its import) and `stage: 'forest'` in `src/scenes/Game.js`. Adding a second stage requires changes outside `data/`.
3. `props`: a list of `{ sprite, density, breakable, hp?, drop?, place?, big? }`. The `density` field is the average count per chunk of size `SIM.chunkSize` (320 pixels). Non-destructible props (`breakable: false`) are decoration rendered by `src/render/decor.js`. The sim doesn't know about them. Destructible props are created by the sim (see "Destructible object"). The `place` field can be `'ground'` (default, not on roads), `'any'`, `'road'` (on the road centerline, object faces the road direction), or `'roadside'` (beside the road, skipped if no road exists in the chunk unless `fallback: 'ground'` is set, like for lanterns). Set `big: true` for trees and bushes. These objects occupy a 4x4 chunk cell so they don't overlap (both sim and render use the same rule: `placeProp` and `Decor._place`).
   `roads: { spacing, width, chance, wobble, wave, wave2 }` defines a sandy road network (`src/core/roads.js`). Roads are strips spaced `spacing` pixels apart on both axes, each with probability `chance`, with waviness `wobble` and periods `wave` and `wave2`. Roads are defined by a formula across the whole world so they don't end. Sand is rendered per-chunk by `src/render/roads.js`.
4. `tiles`: a field exists in the format but the renderer currently draws the background from the `grass` sprite (`src/render/world.js`) and doesn't read this field. A different background would require editing `world.js`.
5. `scaling: { hpPerMinute, damagePerMinute }`: sets enemy HP and damage growth, multiplying by `1 + k × minutes`.
6. `timeline`: events sorted by `at` (in seconds). Timeline types (handled by the director in `src/core/director.js`):
   - `spawn`: `{ at, type: 'spawn', enemy, rate, rateEnd?, until?, group, min?, minEnd? }`. `rate` is groups per second, transitioning linearly to `rateEnd` until `until` (must be > `at`). `group` is the number of enemies per group. `min` and `minEnd` set a minimum number of living enemies of this type to maintain (scales linearly).
   - `ring`: `{ at, type: 'ring', enemy, count, radius? }`. A ring of enemies spawns around the hero.
   - `elite`: `{ at, type: 'elite', enemy }`. One elite enemy with a chest drop.
   - `burst`: `{ at, type: 'burst', enemy, count }`. A cluster of enemies appears at the edge of the screen.
   - `boss`: `{ at, type: 'boss', boss }`.
   - `wall`, `flyby`: a line and a flying pass of enemies (format documented in the header of `forest.js`).
   - Any event except `boss` can have an optional `afterBoss: N` field, making it wait until N bosses are killed (`sim.bossKills`, shared in co-op and deterministic). One-time events (`ring`, `elite`, `burst`, `wall`, `flyby`) fire at the moment a boss dies if their `at` time has already passed. `spawn` events run during their `at..until` window (rate and minimum scale by absolute time). If the window closes before the boss dies, the event doesn't start. Boss summons from `attacks: summon` don't gate on boss kills. In the forest, foxgirls have `afterBoss: 1` and succubi have `afterBoss: 2` (the test `forest: kitsune (foxgirl) waves after the 1st boss, succubi after the 2nd` in `tests/unit/director.test.js` verifies this).
7. `bossWarning`: the number of seconds before a `boss` event to send a `bossWarning` (0 or omitted means no warning).
8. i18n: add `stage.<id>.name`. manifest: sprites for props and background.
9. Tests: `stage: timeline sorted and references known enemies`, `data: pickups, props drops and timeline are consistent` (currently test the forest; add similar tests for new stages). Balance tests in `tests/balance/` run through the forest.

## Destructible object

1. Add to the stage's `props`: `{ sprite: 'barrel', density: 0.6, breakable: true, hp: 1, drop: { food: 0.3, coin: 0.35, magnet: 0.05 } }`.
   - `drop`: `{ pickupId: chance }`, with keys from `src/data/pickups.js`. Chances are in `(0, 1]`, multiplied together by luck, and at most one item drops (cumulative roll).
   - `hp` defaults to 1. Each hit removes 1 HP.
   - Any weapon can break objects. Projectiles hit objects along their path. Aiming weapons (daggers, axe, bomb, lightning) without enemies in range target the nearest object via `sim.nearestProp`. Lightning hits instantly, so it breaks objects along its own path using `sim.hitPropsOnSegment`. New instant-damage weapon behaviors must do the same. The test `every weapon breaks props on its own` checks all weapons.
2. manifest: add the sprite (`art('barrel', 18, 20, { origin: FEET })`), with origin at the base.
3. The sim sends `{ type: 'propBreak', x, y, sprite }` when an object breaks (the renderer shows debris and plays a sound).
4. Tests: `props: break from weapons, push propBreak, drop by table` in `tests/unit/mechanics.test.js`, and `data: pickups, props drops...`.

A new pickup type: add a record in `src/data/pickups.js` with a `kind` value (`xp | heal | magnet | coin | chest`), and add a sprite in the manifest. A new `kind` requires a branch in `sim.js`.

## Wave and event

Only edit the `timeline` in `src/data/stages/<stage>.js`.

```js
{ at: 150, type: 'ring', enemy: 'ghost', count: 16 },
{ at: 240, type: 'elite', enemy: 'slime' },
{ at: 510, type: 'burst', enemy: 'slime', count: 30 },
{ at: 390, type: 'spawn', enemy: 'bunnygirl', rate: 0.1, rateEnd: 0.25, until: 560, group: 2 },
{ at: 660, type: 'spawn', enemy: 'succubus', rate: 0.8, rateEnd: 1.5, until: 780, group: 2, afterBoss: 2 },
```

Keep the list sorted by `at`. The enemy limit `SIM.maxEnemies` (400) is shared. When space runs out, elites and bosses displace the farthest regular enemy. Verification: `npm test` checks structure and sorting, and balance tests ensure peak enemies don't exceed the limit.

## Evolution (super weapon)

Collaborations (weapon + weapon) have been removed (see `docs/META.md` 1.4). Each record in `src/data/combos.js` is an evolution (like in Vampire Survivors), one-to-one: `{ from: ['blade_arc', 'attack'], result: 'crimson_arc' }` requires a weapon at `maxLevel` and any level of its passive. The passive remains.

The result weapon takes the weapon's slot. Only skill chests (from elites, `docs/META.md` 1.4) provide evolutions. If an evolution is ready, the chest offers a choice of the ready ones (`chestChoices`, up to `CHEST.maxChoices`), with cards marked `evolved: true` and showing `from`. Evolutions never appear on level-up cards.

1. `src/data/weapons.js`: add a record with `evolved: true`, `maxLevel: 1`, one level, and the same `dmgType` as the base weapon. Use one behavior with stronger numbers and an optional projectile tint:
   ```js
   crimson_arc: {
     icon: 'icon_crimson_arc', sprite: 'proj_blade_arc', behavior: 'slash', dmgType: 'attack', maxLevel: 1, evolved: true, tint: 0xff5050,
     levels: [ { damage: 58, cooldown: 0.7, amount: 4, area: 200, width: 34, sweep: 0.1, knockback: 150 } ],
   },
   ```
2. Add a record to `src/data/combos.js`.
3. Icon: add `icon_<result>` to the manifest (`icon(...)`, 96×96 frame) and to `assets/raw/icons_evo.png` (set `icons_evo` in `sheets.json` and run `node tools/slice-sheet.mjs icons_evo`). i18n: add `weapon.<result>.name` and `weapon.<result>.desc`.
4. Tests: `data: combos use maxed regular weapons and evolved results` (one evolution per weapon and passive), `data: evolutions are weapon + passive`, and `combo: <id> works in sim` in `mechanics.test.js` (each super weapon deals damage in the sim).
5. To see it in action: `node tools/playtest.mjs 15 --god --weapons crimson_arc:1 --shot out.png --shot-at 12 --size 1280x720`.

## Pre-commit checklist

- [ ] All new ids are in data with i18n keys (name and description) in `src/i18n/en.js`. All UI strings use `t()`.
- [ ] Every new sprite is in `assets/sprites/manifest.js` with a corresponding file in `assets/sprites/` (placeholders are fine for now).
- [ ] `npm test` passes (unit and balance tests).
- [ ] `npm run smoke` passes if you edited scenes, UI, rendering, the manifest, or sprites.
- [ ] You didn't modify `.secrets/`, keys, or `tools/gen-ledger.json` by hand.
- [ ] New data fields are documented in the header of the corresponding file.
