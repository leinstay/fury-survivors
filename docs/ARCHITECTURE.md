# Architecture

Two layers: `src/core/` (pure logic, no Phaser, runs in Node for tests) and the Phaser layer (`src/scenes`, `src/render`, `src/ui`), which advances the sim every frame and keeps sprites in sync with its state. Content and balance are read from `src/data/`.

Code style: a practical subset of Google JavaScript Style Guide, checked via `npm run lint` (`eslint.config.js`): `const`/`let` not `var`, `===`, single quotes, semicolons, one variable per declaration, lines up to 100 characters, named exports only, JSDoc with `@param`/`@return` on exported functions in `src/core/` and `src/services/`.

## Sim contract (src/core/sim.js)

The renderer reads sim fields and calls its methods. The renderer doesn't access sim's internals.

```js
import { createSim } from './core/sim.js';

const sim = createSim({ hero: 'heroine', stage: 'forest', seed: 12345, difficulty: 'normal' });
// hero: id from data/heroes.js; stage: stage id (currently the STAGES = { forest } table is hardcoded in sim.js);
// seed: same seed produces the same run (core/rng.js), balance tests rely on this;
// difficulty: id from data/difficulty.js (spawnMul for director, xpMul for XP), defaults to normal
// players: 1 (default) or 2 for co-op (data/coop.js), see "Co-op" section below;
// heroes: ['heroine', 'mage'] heroes by player index in co-op (duplicates are replaced, core/heroes.js)

sim.step(dt, input);   // dt in seconds (Game.js caps at 1/20, sim at 0.1), input = { x, y } movement vector in [0, 1]
                       // co-op: input = { players: [{ x, y }, { x, y }] } per player
                       // in states 'levelup' / 'chest' / 'gameover' / 'victory' step does nothing
```

### State (read-only for renderer)

```js
sim.state      // 'running' | 'levelup' | 'chest' | 'gameover' | 'victory'
sim.won        // final boss killed: run will end in victory (in overtime, death gives 'victory', not 'gameover')
sim.overtime   // overtime start time (stage.overtime: endless strengthening waves for score) or -1
sim.finishOvertime()  // end overtime early: state = 'victory'
sim.time       // seconds since run start
sim.kills
sim.coins       // collected coins
sim.player = {
  x, y, hp, maxHp, level, xp, xpNext,
  facing,                 // 1 right, -1 left
  moving,                 // bool, for walk animation
  iframes,                // > 0 while invincible (renderer blinks)
  hurtFlash,              // > 0 after taking damage
  weapons:  [{ id, level }],
  passives: [{ id, level }],
  stats,                  // final stats (core/stats.js)
}
sim.enemies     // [{ uid, type, sprite, x, y, hp, maxHp, size, facing, elite, boss, hitFlash, moving, pose, rage }]
                // size: hitbox radius (for elites, already multiplied by elite.sizeMul)
                // pose: 'idle' | 'windup' | 'cast'. Only boss behavior sets this; others are always 'idle'.
                //   anim.js: for bosses, windup and cast show frame 2 (dash startup, summon pose)
                // rage: bool, true after reaching rage.hpFraction HP threshold (bosses only)
sim.telegraphs  // [{ uid, x, y, radius, delay, t, dmg }] warnings for boss strikes (slam), renderer draws circles
sim.boss        // living boss (same entity from sim.enemies, hp and maxHp fields for HP bar) or null
sim.projectiles // [{ uid, sprite, x, y, angle, scale, alpha, owner: 'player' | 'enemy' }]
                // scale is set by behavior (e.g., orbit: size from weapon level); renderer multiplies by 1/density
sim.pickups     // [{ uid, type, sprite, kind, value, x, y }]  type = id from data/pickups.js
sim.props       // [{ uid, sprite, x, y, angle, breakable, hp, drop }]  destructible only; decor is rendered by render/decor.js
sim.roads       // sand road network (core/roads.js: distance(x, y), onRoad, pointInChunk) or null; renderer draws
                // sand per-chunk (render/roads.js), object placement considers roads (place in stage.props)
sim.events      // events this step, cleared at step() start:
                //   { type: 'hit', x, y, amount, crit, weapon }
                //   { type: 'kill', x, y, enemy, elite, boss, sprite, size }
                //   { type: 'playerHurt', amount, player }
                //   { type: 'pickup', kind, player }
                //   { type: 'levelup', level }
                //   { type: 'weaponFire', weapon }
                //   { type: 'chest', items: [...] }          format below
                //   { type: 'propBreak', x, y, sprite }      barrel/lantern broken
                //   { type: 'bossWarning', boss, seconds }   once, stage.bossWarning seconds before boss (seconds: remaining)
                //   { type: 'bossSpawn', boss }
                //   { type: 'bossDown', boss }               non-final boss killed (chest dropped, run continues)
                //   { type: 'slam', x, y, radius }           ground strike triggered
                //   { type: 'bossBlink', x, y }              boss reappeared after blink
                //   { type: 'bossRage', x, y }               boss fell below rage.hpFraction HP (once);
                //                                            fx: shake, sound: boss_spawn at lower pitch
                //   { type: 'horde', x, y, enemy }           elite killed: enemy ring around its chest (stage.chestHorde)
                //   { type: 'overtime' }                     final boss killed, overtime started (hud: banner)
                //   { type: 'gameover' } | { type: 'victory' }  victory: death or finishOvertime in overtime
                //                                            (without stage.overtime comes right after boss kill)
sim.damageByWeapon  // { weaponId: totalDamage }
// Projectiles with rehit hit a target no more than once per rehit: usually one timer per weapon (e.g., e.hitAt[slot] for aura, burning),
// with rehitOwn each projectile has its own timer (shields orbit: four shields = four hits)
```

All entity arrays persist across frames. The renderer matches sprites by `uid` (creating new ones and pooling removed ones).

### Co-op (players: 2)

Like local co-op in Vampire Survivors: one screen, shared XP and level, players choose upgrade cards in turn, death turns a player into a coffin. Numbers live in `src/data/coop.js`.

```js
sim.coop           // true when players > 1
sim.players        // [{ ...sim.player fields, id, slots: { weapons, passives }, dead, coffinT, revives, tint }]
sim.player         // = sim.players[0]; shared XP and level (xp, xpNext, level) live only on this player
sim.local          // index of the player at this screen (HUD and upgrade screens show their build); network sets 1 for the guest
sim.view           // { x, y, dirX, dirY } screen center: midpoint between players (coffins too), solo player only in solo mode
sim.alive          // living players
sim.target(x, y)   // closest living player to the point: target for enemies and projectiles (behaviors/enemies/*)
sim.spawnMul       // director spawn multiplier: difficulty × COOP.spawnMul
sim.levelUp.player // whose turn to choose upgrade cards (players alternate via sim.levelTurn; dead players also choose)
sim.chest.player   // who gets the chest (whoever picked it up)
sim.hurtPlayer(raw, pl)  // in co-op, death: pl.dead = true, pl.coffinT = COOP.reviveTime; 'gameover' only when all are dead
```

Movement: players cannot stray more than `COOP.edge` pixels from the screen center in any direction (`_clampToPartners`). Coffin timer: speeds up while the partner is nearby (`allyRadius`, `allyBoost`) and slows down while an enemy stands on the coffin (`enemySlow`).
When the timer expires, the player stands up with `reviveHp` HP and `reviveIframes` invulnerability frames. Enemies: spawned at `spawnMul` rate, common enemies with `enemyHpMul` HP (0.85), bosses with `bossHpMul` HP (0.5: boss HP scales from the shared level, but each player's damage is half the normal scaling).
Each player has `COOP.slots` weapon and passive slots (fewer than `SLOTS`). Each weapon knows its owner (`w.owner`), and crit chance and stats come from that player. Loot luck uses the best value among living players. Events include `player` field: `playerHurt`, `playerDown { x, y }`, `revive { x, y }`, `pickup`, `chest`, `autoHeal`. Rendering: `render/world.js` draws a sprite for each player (second player tinted with `tint`, dead players as coffins), camera centered on `sim.view`. HUD shows only the local player (HP, weapons, DPS), as in solo. XP for two players multiplied by `COOP.xpMul` (hidden bonus).

### Skill chest

Drops from every elite and boss (`drop: 'chest'` in data). On pickup it applies immediately (`UP.skillChest`, no choice): in solo the picker gets it, in co-op each player rolls separately. `sim.state = 'chest'`, `sim.chest.rolls = [{ player, cards }]`, event `{ type: 'chest', player, rolls }`. Each card:

```js
{ kind: 'weapon' | 'passive' | 'heal', id, level, isNew, icon,
  evolved?: true,        // evolution only
  prev?: number,          // level before upgrade (shows "Lv 2 → 3")
  from?: [weapon, passive] } // evolution only: components from data/combos.js; the source weapon removed, result takes its slot
```

If the picker has at least one evolution ready (an entry in `combos.js`: weapon at maxLevel plus their passive), the chest does not apply anything: `sim.state = 'chest'`, up to `CHEST.maxChoices` cards in `sim.chest.cards`, event `{ type: 'chest', items: [], choice: true }`. `sim.chooseChest(i)` applies a card, `sim.skipChest()` gives normal upgrades instead (`skillChest`). Both send `{ type: 'chest', items, applied: true }`. In co-op, both players then see the reveal (`'reveal'`, closed when the owner triggers `revealDone` or a timer expires).

Otherwise, `UP.skillChest`: plus one level to a random passive and plus one level to a random weapon (in solo the picker gets both, in co-op each player rolls separately). `sim.chest.rolls = [{ player, cards }]`, event `{ type: 'chest', player, rolls }`, `sim.state = 'chest'` with empty `chest.cards`. Confirm with `sim.chestOk(who)` (co-op: command `chestOk`), world pauses until everyone confirms. If only heal drops, skip the screen (event `autoHeal`).

### Boss loot

A defeated boss rolls each player a chest of items (`pl.loot`, each with its own RNG `lootRng`). With `createSim({ lootScreen: true })` (game mode), the sim enters `state 'loot'` as soon as it would otherwise become `'running'`. The Loot scene shows the player's items and handles decisions (stash, essence) outside the sim; only `sim.lootFinish(who)` returns to the sim (co-op: command `lootDone`). Victory from the boss waits for the screen to close (`winAfterLoot`). Without the option (bots), loot just accumulates.

### Level upgrades

When a player gains a level, `sim.state = 'levelup'`, `sim.picker` is the index of the choosing player, and their `players[picker].levelUp` field is filled (in solo `sim.levelUp` is `players[0].levelUp`):

```js
pl.levelUp = {
  cards: [{ kind: 'weapon' | 'passive' | 'heal', id, level, isNew, icon }], // up to 4 cards
  rerolls, skips, banishes,  // remaining (each player has their own)
  banished,                  // Set 'kind:id', cards banished by this player
  done,                      // not their turn, or they already chose
}
sim.chooseCard(i, who = 0)  // apply card i; if more levels remain, generate new cards immediately, else 'running'
                            // when nothing to choose (all maxed), heal card applies automatically without
                            // screen, event { type: 'autoHeal' }
sim.reroll(who = 0)
sim.skip(who = 0)
sim.banish(i, who = 0)      // remove card i from this player's pool for the rest of the run and show replacement
```

Co-op: XP and level are shared, cards chosen in turn (`levelTurn`), but each player draws from their own pool and spends their own reroll/skip/banish. Damage and DPS per weapon are also per-player (`pl.damageByWeapon`, `pl.dpsByWeapon`): HUD and run summary show only the local player's stats.

Card text is rendered via `t()` following the key convention below. Description: `<kind>.<id>.lvl<N>` if the key exists (`hasKey`), else `<kind>.<id>.desc`. Heal cards use `card.heal.desc` (`src/scenes/LevelUp.js`). The card pool includes everything from `WEAPONS` (except `evolved` ones and weapons already consumed by the player's evolution) and `PASSIVES`: a new card appears when a slot is free (`SLOTS`), level increases until maxed.

## i18n key conventions

| What | Keys |
|---|---|
| Weapon | `weapon.<id>.name`, `weapon.<id>.desc` |
| Passive | `passive.<id>.name`, `passive.<id>.desc` |
| Hero | `hero.<id>.name` |
| Enemy, boss | `enemy.<id>.name`, `boss.<id>.name` |
| Stage | `stage.<id>.name` |
| Heal card | `card.heal.name`, `card.heal.desc` |

Data files (`src/data/*`) store only the id. String keys are derived from the id using this table.

## Behaviors

`src/behaviors/weapons/<behavior>.js` and `src/behaviors/enemies/<behavior>.js` export objects and register themselves in `src/behaviors/index.js` by name. New behavior means a new file plus a line in the registry. Data entries reference a behavior by its string `behavior` field.

Weapons: `{ init(w, sim), update(w, sim, dt) }`, where `w = { id, level, def, params, slot, ... }`. `params` is a copy of the level row from data with adjustments: `damage` multiplied by the owner's `attack` or `magic` stat (based on `dmgType`), `cooldown` divided by `haste`, `area` and `duration` multiplied by `area` and `duration` stats. Other fields (`amount`, `area`, `speed`, ...) are as in data. Projectiles are drawn from the pool via `sim.addProjectile(owner, sprite)`. A behavior that needs to move projectiles itself sets `p.bk` and implements `moveProjectile(p, w, sim)` (the `orbit` behavior does this).

The level fields that each behavior reads are listed in the header of `src/data/weapons.js`. For `orbit`, these are `amount`, `area` (orbit radius), `speed` (radians/second), `duration`/`cooldown`, plus `size` (shield sprite scale, defaults to 1) and `hitRadius` (hit detection radius, defaults to 10). `duration: 1e9` and `cooldown: 0` create permanent shields (the `aegis_storm` evolution).

Enemies: `{ init(e, sim), update(e, sim, dt) }`. `e.params` is `params` from data. The `boss` behavior reads `def.attacks` (`dash`: `windup`, `speed`, `time`; `summon`: `enemy`, `count`, `radius`) and `def.rage`. It writes to `e.pose` and `e.rage`, and sends `bossRage` when the threshold is crossed.

The Director (`src/core/director.js`) executes the stage's `timeline`: `spawn` (maintains minimum live enemies via `min`/`minEnd`), `ring`, `elite`, `burst`, `boss`. It sends `bossWarning` `stage.bossWarning` seconds before the boss event. Enemy scaling over time: `stage.scaling`.

## Network co-op

Two players in one world, P2P via WebRTC DataChannel, no game server. Everything relies on sim determinism: both clients run the same simulation (shared seed) in fixed-step ticks and exchange only input.

- `src/core/lockstep.js` (no Phaser): `createLockstep({ sim, local, send, onDesync })`. `advance(input, dt)` records input for tick `tick + NET.inputDelay`, sends it to the partner (`{ t, x, y, c? }`), and advances the tick only when the partner's input has arrived (returns `false` otherwise, HUD shows "waiting for partner"). To avoid stuttering: Game accumulates wait time (`NET.backlog`) and catches up to `NET.maxCatchUp` ticks per frame. Based on `ls.drift()` (how far ahead the partner is, from the `a` field in input), the local clock slows slightly (`NET.syncSlow`). The local hero is drawn with an offset from pending input (`ls.predictOffset`), so input delay (`NET.inputDelay`, 100 ms) is not felt. Screen choices (upgrade card, reroll, chest, pause, end overtime) go as commands in the same message and apply to both players on the same tick (`applyCommand`: the card applies only to the choosing player, the chest only to its owner). Every `NET.hashEvery` ticks the state hash (`hashSim`) is compared with the partner's. A mismatch triggers `onDesync` (Game just marks it).
- `src/core/actions.js`: `createActions(sim, ls)` is a single action interface for screens: solo calls sim immediately, co-op sends commands. `LevelUp`, `Chest`, `Pause` screens don't wait for a result. They watch `sim.state` in `update()` and close when the sim leaves the choice state. In co-op, Game doesn't pause under them (lockstep keeps running, the sim pauses itself in `levelup`/`chest`). Global pause is a flag `ls.paused` set by the `pause`/`resume` command.
- `src/services/net.js`: `createRoom()` (host: writes offer to Firestore document `rooms/<code>`, polls for answer), `joinRoom(code)` (guest: writes answer to the same document), then only DataChannel (ordered, reliable). `Conn` API: `send(obj)`, `onMessage(fn)` (messages queue without a handler; Lobby passes the channel to Game), `onClose(fn)`, `close()`. Uses Google's STUN, no TURN: symmetric NAT may block connection (`lobby.failed`). Numbers in `src/data/net.js`. For smoke tests, signaling is mocked via `globalThis.__furySignal`.
- `src/scenes/Lobby.js`: host sees a code and waits, guest enters by code. After connection, they exchange `hello { name, hero }`, `hero { id }` (change your hero; partner's hero is locked, guest gives way if there's a clash, click your own again to release it, `id: ''`, partner can then pick it), `diff` (difficulty, host chooses), `start { seed, difficulty, names, heroes }`, `leave`. Both start Game with `data.coop = { net, local, seed, difficulty, names, heroes }` (host is player 0). Menu: "Co-op" view with nickname and code fields.
- `src/scenes/Game.js` in co-op: fixed step via `ls.advance`, hitstop disabled (would pause ticks for only one player), channel loss (`onClose` or `NET.dropAfter` on silence) ends the run with a summary screen marked `lost`.
- Determinism: `Math.sin/cos/atan2` can differ between JS engines in the last bits. In practice Chrome and Android Chrome match, and the hash catches divergence. Co-op balance numbers live in `src/data/coop.js`.

## Codex

The `Codex` scene (`src/scenes/Codex.js`) has tabs: Armory (weapons, evolutions "weapon + passive", upgrades: description, stats per level, recipe), Bestiary and Bosses (walking animation sprite, stats, attacks, own count), Chronicle (run summary, history paged, one run's summary like the end screen). Opens from menu and pause. Pause stays under the codex with input disabled (`Pause.openCodex` / `codexClosed`), back returns to pause. Numbers in `src/data/codex.js` (`CODEX`).

- Tracking (`src/core/codex.js`, no DOM): `createRunTracker` lives for one run in Game (except in `data.sim` playtests). `onEvents` from `handleEvents` every tick, `observe(sim)` once per frame, `finish` at run end (status `victory`, `dead`, `disconnected`) or on scene exit (`quit` if the run lasted longer than `CODEX.minQuitTime`). In co-op each player tracks their own: `kill.by` (which player dealt the final blow), `playerHurt.src` (enemy or boss id; `sim.actor` marks projectiles and ground impacts), their own pickups and damage. Anything seen is shared. `mergeRun` folds the result into the codex.
- Unlocking entries (`seen`): weapon and passive unlock when shown on their upgrade or chest card, dropped from a chest, or in the build. Enemy unlocks when killed by anyone, hit the player, or was in `CODEX.seenRange` of the hero. Boss unlocks when it appears. Locked entries show a dark silhouette and "???", recipe hidden.
- Storage (`src/services/codex.js`): `localStorage['fury-survivors.codex']`, JSON with schema version `v` (`CODEX.version`; newer schemas are not read), history up to `CODEX.maxRuns` runs. Reading passes through `normalizeCodex`: junk and corrupted data are dropped. The codex has a random `id` (20 characters `[a-z0-9]`, via `crypto.getRandomValues`) and `nick` (latest nickname).
- Backup: after each run `setDoc(fury_codex/{id}, { nick, data: JSON string, v, updatedAt })`. Errors are silently ignored (offline, rules). Not written under automation (`navigator.webdriver`, Playwright). Firestore rules `match /fury_codex/{id}` allow: `get` yes, `list` no, write only with id of the right form and exactly these fields, `data` under 800 KB, `updatedAt == request.time`, delete no.
- Player recovery: Chronicle → tap `ID …` to copy id. On a new device, `Restore` → enter id → confirm → local codex is replaced with the downloaded one (then writes to the same document).
- Owner recovery: Firebase console → Firestore → `fury_codex` collection → filter by `nick` field (player's nickname) → the document id is the codex id. Send this to the player, they enter it in `Restore`. If there are multiple nicknames, check `updatedAt` and the contents of `data` (`runs`, dates `at`).

## Render

`src/scenes/Game.js` creates the sim. Each frame it reads input (`src/ui/input.js`: keyboard, gamepad, on-screen joystick), accumulates time, and advances the sim by fixed step `1 / SIM.tickRate` (no more than `SIM.maxTicksPerFrame` per frame). Then `handleEvents(sim.events)` (hitstop, effects, sound), `src/render/world.js` syncs sprites, `src/ui/hud.js` updates HUD. On `levelup`, chest, `gameover`, or `victory`, Game pauses (`scene.pause('Game')`) and `LevelUp`, `Chest`, `GameOver`, or `Victory` launches on top. `Pause` is launched by button. Screens receive `{ sim, act }` (`core/actions.js`) and close themselves when `sim.state` changes.

Files in `src/render/`: `world.js` (sprites by uid, shadows, camera, elite glow color from `elite.glow`), `anim.js` (procedural animation), `fx.js` (particles, damage numbers, shake), `decor.js` (stage decor per chunk), `density.js` (sprite scale).

## Render and coordinates

- World, data, and UI use coordinates 640×360 (`GAME_WIDTH`, `GAME_HEIGHT` in `src/data/constants.js`). Canvas is `RENDER_ZOOM` = 2 times larger: 1280×720 (`src/main.js`).
- Each scene gets a camera with origin (0, 0) and `zoom` = `RENDER_ZOOM` on startup (wrapped by `zoomed` in `main.js`), so scene code, HUD, and menu don't know about scaling. Text is created with `resolution: RENDER_ZOOM` so it doesn't blur.
- Phaser: `pixelArt: true`, `roundPixels: true`, Scale FIT. Canvas scaling to screen: integer scale gives `image-rendering: pixelated`, fractional scale uses soft smoothing so pixels don't shimmer when moving (`src/ui/scaling.js`). On phone, first touch enables fullscreen and locks landscape where the browser allows it (`src/ui/fullscreen.js`). Canvas is recalculated on every window resize.
- `density` in the manifest is texture pixels per world pixel. Sprites are drawn at scale `1 / density` (`src/render/density.js`): density 2 shows each texture pixel on canvas, density 1 gives 2×2 px blocks, density 0.5 gives 4×4 px blocks. Choosing density: `docs/ASSETS.md`.
- Camera follows the player (`scrollX/scrollY` in world coordinates). The `grass` background is a `tileSprite` with `scrollFactor` 0. Sprite anchor (`origin` in manifest) is at feet for characters. Character depth equals their `y`, projectiles draw on top (`PROJ_DEPTH`).
- Elite on-screen size and hitbox both use one multiplier `elite.sizeMul`.
