# Network co-op: status and next steps

Full design in `docs/ARCHITECTURE.md` ("Network co-op"), tables and rules in `docs/LEADERBOARD.md`. Brief summary here for continuing work.

## Done

- Simulation for two (`src/core/sim.js`, numbers in `src/data/coop.js`): shared experience and level, cards take turns but each player has their own pool (own banished and reroll/skip/banish), own DPS and damage on summary, chest goes to whoever picked it, coffin instead of death (revives on timer, faster near partner), players don't drift beyond screen, spawn x1.4, enemy HP x0.85, boss HP x0.5, experience hidden x1.25, 4 slots per player.
- Heroes: blade user (Blade Arc) and caster (Storm Chain, `HEROES.mage`). Hero choice in solo (menu: Play > hero > difficulty, last choice saved in setting `hero`) and in lobby (each picks themselves, message `hero`, host sends `heroes` in `start`). Cannot both pick the same hero: in lobby the partner's hero is unavailable. On simultaneous choice the guest yields. Sim also assigns different ones (`src/core/heroes.js`). Mage sprite: PixelLab from `assets/raw/mage.png`, in menu she's on the left mirrored, symmetric to blade user.
- Lockstep (`src/core/lockstep.js`): input with 6-tick delay (100 ms; own hero drawn with prediction), screen commands, state hash once per second. Fixed 60 Hz step in `Game.js` (solo too). In co-op wait time accumulates and catches up. Leader slows clock if partner lags.
- Connection (`src/services/net.js`): WebRTC DataChannel, offer/answer via Firestore `rooms/<code>`, Google STUN, no TURN.
- Lobby (`src/scenes/Lobby.js`), Co-op view in menu, HUD like solo (own player only), results with pair of nicks, co-op table `fury_scores_coop` with `ip` field and IP dedup, Solo and Co-op tabs.
- Tests: `tests/unit/coop.test.js`, `tests/unit/lockstep.test.js`, balance bot for two (`players: 2`), `tests/smoke/coop.spec.js` (two windows, real WebRTC, signaling via localStorage).

## Manual setup needed

- Publish `firestore.rules` in Firebase console (collections `rooms`, `fury_scores_coop`, field `ip`, host heartbeat `aliveAt` in `rooms`). Without this, lobby won't create.
- Mage portrait (`mage_portrait`, 48×48) is still placeholder, not shown anywhere in game.

## TURN via Cloudflare

Without TURN, browsers only connect directly (STUN): strict NAT, CGNAT on mobile carriers, or closed UDP on one player, and the channel doesn't open. TURN relays traffic through Cloudflare. TURN keys can't go in the game, so a small Worker (`tools/turn-worker.js`) gives temporary credentials.

1. dash.cloudflare.com → Realtime (formerly Calls) → TURN Server → Create: copy **Turn Token ID** and **API Token**.
2. Workers & Pages → Create → Worker (Hello World), name like `fury-turn` → Deploy → Edit code: paste
   all of `tools/turn-worker.js` → Deploy.
3. Worker → Settings → Variables and Secrets: `TURN_KEY_ID` and `TURN_KEY_API_TOKEN`, type Secret → Deploy.
4. Worker address (`https://fury-turn.<account>.workers.dev`) in `RTC.turnUrl` in `src/data/net.js`. It's not secret.
   Worker only responds to sites in `ALLOWED`.

The game asks the worker before each connection (`RTC.turnTimeoutMs`). No answer, connects without TURN. Console shows
`[fury-net] turn servers N urls`. In candidates, `relay` appears. Route through TURN shows `relay -> ...`.

## Known limitations

- No TURN: behind symmetric NAT (mobile carriers, CGNAT) or blocked UDP, connection won't work (lobby says "Could not connect"). Diagnosis: browser console (F12), filter `fury-net`. ICE candidates on both (no `srflx` means no external address, STUN unavailable), ICE states, picked path, break reason.
- Versions: `hello` in lobby has game fingerprint (`simFingerprint`: hash of data and short run). Different versions block start, both reload page. Same fingerprint as six hex in top left of menu (`ee3c62`). Should match on both.
- Network stats: every 15 s, `[fury-net] stats`. Fraction of frames waiting for partner, ticks per second (60 normal), fps, longest frame, clock skew, lead (roughly network delay in ticks).
- Desync: console shows `[fury-net] DESYNC` with tick and state fields that diverged (clients share their `hashParts`).
- Desync only recorded (`__game.debug().desynced`), game doesn't fix state. Chrome with Chrome converges.
- Skill chest in co-op: if evolution ready, picker chooses, then both see (state `chest`, then `reveal` on `CHEST.revealTime`, owner can close early with `revealDone` command). No evolutions: each gets their own upgrade roll, world paused until both hit Ok (command `chestOk`). Boss loot: screen on both (state `loot`), decisions to own stash locally, in lockstep just `lootDone`. World moves when both done. After any choice and pause, world waits another `SIM.resumeDelay` (0.5 s, state `resume`; same in solo). Choice screen fades (`ui/fade.js`) during that.
- Own coffin: timer for revival instead of HP.
- Repeat run in co-op only through new lobby. If partner left, code won't work. Cancel and new lobby.
- Host closed tab before guest arrived: room deleted on `pagehide`. If request didn't go through, guest sees "lobby not found" by `aliveAt` (host marks every `ROOMS.beatMs`, stale after `ROOMS.staleMs`) and deletes room. Needs published `firestore.rules` with `aliveAt` field. Old rules won't mark it, guest uses `createdAt` by `ROOMS.waitMs`.
- Minimized tab stops Phaser loop: input doesn't go out. Partner sees loss after `NET.dropAfter` (20 s).
- Desync shown as line in HUD (`coop.desync`), game continues, score can differ. Reason in console (see above).
- Ping over roughly 100 ms one way (input delay) causes frequent pauses. No adaptive delay.

## Testing hero choice screen on many heroes

Test heroes don't land in the repo. A screenshot script in browser adds entries to `HEROES` with sprites and enemy/boss names (up to N heroes) and captures hero choice in solo and lobby (two windows, signaling via `__furySignal`). Script was in session workfolder (`heroes-n.mjs`). Gist: `import('/src/data/heroes.js')` in page, `HEROES[id] = { ...HEROES.heroine, sprite: ENEMIES[x].sprite, startWeapon }`, `en['hero.' + id + '.name'] = ...`, then Menu → Play.

## Pause arriving after choice

Command `pause` checks `sim.state === 'running'` on the tick it's applied, not just on Esc press. Network delay could have started levelup/chest or `resume` transition already. Before, such a command would stop the `resume` timer while UI waited for running state to open Pause. World stalled with no visible menu, but network ticks kept going.
Pause during choice/transition is ignored. Normal shared pause and resume stay.
This is a race of commands, not an event tied to the sixth minute.

Regressions: delayed channel with each player's choice. WebRTC scenario
with explicit fixture at 6:11, Esc from both during guest's choice, late pause,
world resume and then normal pause/resume. Fixture checks UI transition, not six minutes of natural play.
Network stats additionally log state, paused, overlay, and picker.

### Waiting for choice without pause

Regular WebRTC smoke keeps guest's choice open 65 seconds of real time, no keys, clicks, or pause commands. Checks continuous tick exchange, LevelUp visibility and input, then picks card and checks continuation. Separate from Esc race: passing one doesn't prove other hangs are fixed.

`window.__game.debug()` additionally returns network (tick, local/picker, paused,
resumeT, pending levels/commands, network wait/silence) and state of each LevelUp/Chest/Pause: active/paused/closed, camera alpha, input and item count.
Periodic `fury-net` line has local, resume and closed/input/alpha of UI.
This tells waiting for choice apart from invisible/disabled screen and stopped tick exchange, without assuming user hit Esc.

For extended diagnostics of UI transitions there's a separate mode:

```bash
FURY_DUO_STRESS_SECONDS=400 npx playwright test tests/smoke/coop.spec.js --reporter=line
```

Incoming damage off only in this mode, network ticks sped up fourfold, world camera hidden to cut software GL load. Real choice screens, keyboard/clicks, RNG of offers, progression, and WebRTC stay. Interface stress, not normal six-minute play or proof of game balance.

Final telemetry also gets `terminal` with sim state and network/UI transition.
Diagnostic data collection, not claim of fix without pause. Export from Oct 23 found 6 new duo records at version e23cd83.
One disconnected at 371.4s, LV48, after guest picked Holy Ground3 at 371s.
Those records lack terminal. Version is before 835f460. Can't tell state of hung screen or confirm fix from them.

Checked: 188 unit/contract tests, 7 smoke, separate WebRTC rerun after changing telemetry capture moment. Opt-in stress ran 400s with matching hashes, then passed 65s wait and choice. In these scenarios hang without Esc didn't reproduce.
No fix is yet claimed for it.
