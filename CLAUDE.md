# Fury Survivors: Project Map

A Vampire Survivors / HoloCure-style game. JavaScript (no TypeScript, no build step), Phaser 3.90, deployed to GitHub Pages.
Vision: `VISION.md`. Meta (items, crafting, achievements, rebalancing, Reaper): `docs/META.md`. How to add content: `docs/CONTENT.md`. Assets and image pipeline: `docs/ASSETS.md`.

## Where everything is

```
index.html                 entry point, loads vendor/phaser.min.js and src/main.js (ES modules), registers sw.js
sw.js                      service worker: each request validated against the server (ETag), cache for offline only
eslint.config.js           style rules (npm run lint)
vendor/phaser.min.js       Phaser 3.90.0, in the repo, not CDN
src/
  main.js                  Phaser config (canvas 1280x720, world 640x360 via zoom 2), scene list
  data/                    ALL BALANCE AND CONTENT. Logic does not go here
    constants.js           global numbers: enemy limits, i-frames, magnet, experience curve, SIM (tick), NET (lockstep), CLEAR (clear metric frame)
    difficulty.js          difficulties: normal, cursed (spawnMul)
    coop.js                co-op: spawn and HP multipliers for enemies, slots, revival
    net.js                 network: Firestore rooms (code, timeouts), STUN
    leaderboard.js         leaderboard: nick limits, pair, cooldown
    codex.js               codex: history (maxRuns), px per meter, sight radius, minimum for quit
    telemetry.js           telemetry for balance: fury_runs collection, snapshot interval, limits
    stats.js               hero stats: percentage (increased/more) and flat, caps (resistance as percent)
    status.js              enemy statuses: poison (stacks), burning, bleeding (fraction per time), chill (slowdown without damage)
    items.js               items: types and shapes, affixes, rarity, chest tables, uniques, crafting, bag, stash
    achievements.js        achievements: conditions, rewards (currency, bag columns and rows), permanent stat bonus, storage
    heroes.js              heroes: stats, starting weapon, sprite (Hero is blade user, Mage is caster); choice in menu and lobby
    weapons.js             weapons: behavior, dmgType (steel/magic), 5 levels (damage, cooldown, count, area...)
    passives.js            passives and stats per level
    combos.js              evolutions: { from: [weapon, passive], result }, 16 total, no collabs
    enemies.js             enemies: behavior, hp, speed, damage, xp, size, sprite, elite variants
    bosses.js              bosses
    pickups.js             experience, food, magnet, coins, chest
    stages/forest.js       map: tiles, objects, wave and event timeline, boss
  core/                    PURE LOGIC WITHOUT PHASER (runs in Node for tests)
    sim.js                 simulation tick: player, enemies, projectiles, damage, experience, levels
    grid.js                spatial grid for collision
    stats.js               final stats: base × (1 + Σ increased) × Π more, flat by sum, caps, statReport
    upgrades.js            upgrade card generation, reroll/skip/banish
    director.js            wave spawning by stage timeline
    rng.js                 seeded RNG
    items.js               items: generation, names, bag (rotation, open zone), bag bonuses, stash, crafting
    loadout.js             bag in a run: verification, stats with bag, unique rules, telemetry snapshot
    inventory.js           bag/stash transfer, presets, sorting, loot collection after run
    achievements.js        achievement checking at run end and in stash/crafting
    run-summary.js         run end tracker for achievements (like codex tracker)
    reaper.js              Reaper with Bible: holy circles, hourglasses, phases
    lockstep.js            network co-op: input with tick-based delay, screen commands, state hash
    actions.js             screen actions (card, chest, pause) through single interface for solo and co-op
    nick.js                nick and pair nick validation
    roads.js               roads: deterministic grid by chunks
    heroes.js              hero choice: validHero, freeHero, distinctHeroes (different heroes in co-op)
    codex.js               codex: run tracker (events, frames), mergeRun, normalizeCodex
    telemetry.js           run telemetry: snapshots once per minute (level, damage and swing per weapon), card choices (sim.pickLog), levels, bosses, cause of death
  behaviors/
    weapons/<type>.js      slash (blade: arc through densest group), melee_arc (cone, unused), projectile, orbit, aura,
                           boomerang, chain, area_drop (bomb, meteor, mines), beam (snake: grows, bounces at 90 degrees),
                           summon, cloud (poison cloud), slam (hammer: circular hit and crack), impale (spear: pierces and pins),
                           ice_orb (ice ball: pierces all and freezes)
    status.js              enemy statuses per src/data/status.js: DoT ticks, slowdown, root
    enemies/<type>.js      chase, dash, ranged, swarm, phase, boss, drift (wall and gap: straight course, disappears off edge)
  render/                  Phaser layer: syncs sprites with sim, animation, effects; decor.js decorator with placement logic, roads.js sand roads by chunks, reaper.js Reaper circles and hourglasses
    anim.js                procedural walk/sway/tilt/flash/death
    fx.js                  particles, damage numbers (BitmapText on digit font digits.js), shake, hitstop
  scenes/                  Boot, Menu (hero choice, Co-op view), Lobby (code, heroes, difficulty, start), Game, LevelUp, Chest, Pause, GameOver, Victory, Leaderboard, Codex (Armory, Bestiary, Bosses, Chronicle; from menu and pause), Inventory (bag, stash, presets, crafting), Achievements, Toast (achievement badges over all scenes)
  services/                leaderboard.js (solo and co-op tables, ip), net.js (WebRTC + signaling through Firestore rooms, logs `[fury-net]` to console), codex.js (codex in localStorage + copy in Firestore fury_codex/{id}, recovery by id), telemetry.js (run in Firestore fury_runs), inventory.js (stash and bag: localStorage + fury_inventory), achievements.js (localStorage + fury_achievements), firebase.js, nick-store.js
  ui/                      focus navigation (focus.js) (keyboard/mouse/gamepad), HUD (score, DPS, minimap), on-screen joystick; settings.js options (projectile glow, hero glow, minimap, DPS, last hero and difficulty); hero-picker.js hero choice cards (grid of 3 heroes); dom-input.js text field (nick, code) over canvas; clipboard.js copy to buffer (lobby code on tap); text-align.js centers text by pixels; fullscreen.js fullscreen on phone (Play button and option, not any touch); items.js item picture, tooltip, bag grid, stats panel; loot.js loot screen after run; toast.js achievement badges
  audio/sfx.js             sound playback, random pitch, simultaneous limit
  debug.js                 window.__game.debug(), error logging to localStorage
  i18n/                    en.js, en-items.js, en-achievements.js + index.js (t('key')). All UI strings through t() only
assets/
  sprites/manifest.js      sprite key -> file, frame size, anchor point; characters frame 128 (CHAR), bosses 256 (BOSS), frames per PNG width (Boot.js)
  sprites/*.png            sprites (placeholders and real with same name and frame)
  audio/sfx/*.wav          effects (jsfxr)
  audio/music/theme.mp3    background music (Whispers of the Abyss, royalty-free), replaced by file substitution
  fonts/                   pixel font (OFL)
tools/                     local Node scripts, not included in game
  gen-sprite.mjs           generation via OpenRouter (key from .secrets/, budget from ledger)
  clean-sprite.mjs         pixel art cleanup: chroma key, downscale, palette, outline, frame
  slice-sheet.mjs          sheet slicing (characters, environment, items, icons, projectiles) per tools/sheets.json; "hd" means smooth downscale without grid
  snap-image.mjs           full image (menu background) by native model grid, cell to pixel
  crop-raw.mjs             figure from raw sheet at original resolution (hero in menu)
  hd-frames.mjs            animation strip from finished animation (PixelLab) without grid capture: smooth downscale, 1:1 display
  approved-to-raw.mjs      approved 3x3 sheets (tools/out/first-frames-256/approved, edited by hand) → assets/raw/<key>_walk256_pixellab and strips: characters x0.5 (128), bosses and Reaper x1 (256)
  sprite-frames.mjs        animation strip frame count by PNG width for scripts and tests (like Boot.js)
  demouth.mjs              removes mouth that PixelLab adds to animation frames (assets/raw/*_pixellab)
  trim-wisps.mjs           erases extra flame wisps on Reaper frames (frame zones), strip then via hd-frames
  pixellab-anim.mjs        animation from first frame via PixelLab (key in env PL_KEY only)
  turn-worker.js           Cloudflare Worker: temporary TURN credentials for co-op (docs/COOP.md)
  make-grass.mjs           procedural grass tile
  make-slash.mjs           procedural blade swing (smooth crescent, proj_blade_arc)
  make-ragged-balls.mjs    rough balls one color no outline: meteor, ice ball, wisp bullet (rings inside - FX.zones.pulse)
  sprite-table.mjs         sprite table in docs/ASSETS.md from manifest and sheets.json
  make-music.mjs           procedural chiptune loop (backup, writes theme.wav; game loads theme.mp3)
  palette.json             common palette for all sprites
  placeholders.mjs         placeholders per manifest.js
  make-sfx.mjs             sound generation from jsfxr presets
  contact-sheet.mjs        preview sheet of sprites for human review
  runs-report.mjs          telemetry fury_runs analysis: per minute level and damage/swing per weapon (--archive: with cleanup archive)
  firestore-cleanup.mjs    Firestore cleanup (Spark no TTL): place report, --apply archives old runs and deletes them and abandoned lobbies (docs/FIRESTORE.md)
  telemetry/               export (fury_runs export), audit (sessions, build remainder per minute), holdout, weapons, movement, food, audit-chart
  simulation/audit-bots.mjs bot cohort with same telemetry scheme; audit results: docs/BALANCE_AUDIT.md
  simulation/bags.mjs, targets.mjs  T2 bag generator for bots; META 1.1 goals: clear and ladder
  simulation/clear.mjs, defense.mjs, ladder.mjs  clear metric (mob life from CLEAR frame entry, mobs in frame), defense strike reserves
                           on paper, weapon ladder by range and quirks (goal vs actual)
  telemetry/hits.mjs       hits per minute and movement in humans from fury_runs export
  gen-ledger.json          generation spending log
tests/
  unit/                    node --test: grid, stats, upgrades, data validation
  balance/                 node --test: headless bot plays a run on core/sim (players: 2 for co-op)
  smoke/                   Playwright: startup, start, 30 s of gameplay, no errors, fps; coop.spec.js two windows over WebRTC; input.spec.js movement stickiness (focus, RMB, mouse)
docs/                      CONTENT.md, ARCHITECTURE.md, ASSETS.md, LEADERBOARD.md, COOP.md (co-op summary: done, by hand, limitations), FIRESTORE.md (collections, Spark limits, what and when to clean)
references/                references, NOT in git (screenshots from other games)
.secrets/                  keys, NOT in git, never read in game code
```

## Rules

- Balance and content in `src/data/` only. No hardcoded numbers in logic.
- `src/core/` does not import Phaser and does not touch DOM.
- New weapon or enemy with existing behavior: data entry and sprite only. New behavior: new file in `behaviors/`, registered by name.
- UI strings through `t()` from `src/i18n/` only.
- Network co-op: sim is deterministic, clients exchange input only (`core/lockstep.js`). Nothing non-deterministic in `core/sim.js` (Math.random, Date, Map insertion order OK).
- State for verification: `window.__game.debug()` returns JSON (scene, fps, enemies, hp, level, weapons, errors). Unhandled error shows as red line over game and writes to localStorage (`window.__game.lastError()`): Phaser stops the frame loop on it.
- Tests and style: `npm run lint` (ESLint, Google JS Style Guide subset), `npm test` (unit and balance), `npm run smoke` (Playwright). All three green before commit.
- Named exports only (`export default` forbidden by linter except `*.config.js`).
- Only one process runs asset generation at a time. Budget $5, stop at $4.50 (`tools/gen-ledger.json`).
- Never commit `.secrets/`, never read it in agents, never put it in code.
- Subagents do not commit. Main session commits, pushes, and deploys.
