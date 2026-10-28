# Fury Survivors

<p align="center"><img src=".github/assets/gameplay-loop.webp" width="100%" alt="The Mage walks down a forest road at 13:00 on Cursed while a ring of ghosts and a crowd of monster girls close in and die"></p>

A small game in the spirit of Vampire Survivors and HoloCure, built on Phaser 3 with no build step. The whole project was assembled by Claude Code from a single brief, [VISION.md](VISION.md), in two five-hour Claude Code sessions. Opus 5.5 ran the session, planned the work, wrote most of the code and reviewed it, while Sonnet 5.5 subagents took separate coding tasks in parallel (see [.claude/agents/coder.md](.claude/agents/coder.md)). The art was drawn by GPT 2.5 Flare and animated in PixelLab.

Two more five-hour sessions added a second heroine, two-player online co-op, the Cursed difficulty, overtime with the Reaper, roads and new scenery, a minimap and a DPS meter. The sessions after that rebuilt the weapon roster around evolutions and added the meta layer. Bosses drop item chests, items go into a bag you pack like Tetris, and a stash, crafting and achievements carry progress from run to run. A codex keeps every weapon, enemy and past run. The game runs in the browser at https://leinstay.github.io/fury-survivors/.

## Features

The run is 15 minutes in one forest stage with sandy roads, crossroads and roadside objects. Enemy waves follow a timeline with special events like an enemy wall, a flock flying over the screen, a ring that closes in and a horde around a chest. Elites drop skill chests, and a boss arrives every five minutes. Kitsune Empress comes at 5:00, Harpy Queen at 10:00 and the final Dryad Queen at 15:00. After the final boss the run goes into overtime with endless, ever stronger waves played for score, until the Reaper arrives at 20:00. Her touch kills. She is invulnerable unless someone carries the Bible, a unique item that makes holy circles appear, and she only takes damage while standing in one. Killing her ends the run in victory.

There are two heroes. Hero fights with a sword (Blade Arc) and Mage starts with chain lightning (Storm Chain). The arsenal has 16 weapons with five levels each and 16 passives. Every weapon has an evolution paired with one passive, so there are 16 evolutions. A skill chest offers one once the weapon is at full level and the passive is taken. Weapons carry tags for damage type (physical or magical) and targeting (area, cleave or single target), shown on the level-up cards and in the codex. Level-up cards come with reroll, skip and banish.

The bestiary has 8 enemy types with elite variants, three bosses with their own attacks, and the Reaper. Two difficulties are picked before a run. Cursed brings 40% more enemies with 8% more HP.

The meta layer lives between runs. Each boss drops a loot chest on the ground, and you have to fight your way to it, so a chest can be lost. The loot screen offers common, rare and epic items with random affixes, and 12 uniques that change the rules of a run. Only one unique fits in the bag at a time. Items go into a bag that starts at 7x4 cells and grows to 9x6 through achievements. Pieces rotate, and the bag gives a diversity bonus for mixing item types. The stash holds 100 items, and three presets switch whole bags. Crafting spends crystals, protection scrolls and chaos hearts to reroll affixes, raise rarity, merge and enchant items, and disassembly breaks them back into crystals. 24 achievements in six categories pay out currency, bag space and small permanent stat bonuses.

The codex has five tabs. Armory lists every weapon, evolution, upgrade and unique with stats per level. Characters shows the heroes, and Bestiary and Bosses show what you have met. Chronicle keeps totals and a history of past runs. The codex, stash and achievements save in the browser and sync to Firestore, so a codex ID restores them on another device.

Two-player online co-op works over P2P WebRTC with the lobby in Firestore. The host creates a lobby and shares a code, and the second player joins by code. Each player picks their own hero, and the host picks the difficulty. Both share one screen and take level-up cards in turns from their own pools. A fallen player turns into a coffin that comes back to life after a while, faster with the partner standing next to it. A co-op run spawns more enemies than a solo one.

The HUD shows score, a minimap and a per-weapon DPS meter. Online leaderboards on Cloud Firestore keep solo and co-op apart.

## Screenshots

<p align="center"><img src=".github/assets/gameplay.webp" width="100%" alt="The Mage on a forest road at 13:00 with a ghost ring closing in"></p>
<p align="center"><img src=".github/assets/inventory.webp" width="100%" alt="Inventory with the packed bag, the stash and the hero stats panel"></p>
<p align="center"><img src=".github/assets/codex.webp" width="100%" alt="Codex Armory with all weapons, evolutions, upgrades and uniques"></p>
<p align="center"><img src=".github/assets/chronicle.webp" width="100%" alt="Codex Chronicle with run totals and run history"></p>

## Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Move | WASD or arrows | left stick or d-pad | drag anywhere |
| Select | Enter or Space | A | tap |
| Back or pause | Esc | B or Start | pause button |

In the inventory, R or right click rotates an item and L locks it.

## Running

You need Node.js 20 or newer. There is no build step. The game is plain ES modules and Phaser 3.90 lives in `vendor/`.

```bash
npm install
npm run serve
```

Then open http://localhost:8080. Any other static server works too.

## Tests

```bash
npm test
npm run smoke
```

`npm test` checks mechanics, telemetry, data, replay and parity between the headless and lockstep simulations. `npm run smoke` drives the real UI and WebRTC in Playwright with a shared bot behaviour. Balance experiments are kept out of the unit tests and run with `npm run balance:quick` and `npm run sim:combat`. Performance is measured separately with `npm run perf`. The full list of commands, acceptance criteria and data limits is in [docs/SIMULATION_GUIDE.md](docs/SIMULATION_GUIDE.md).

## Layout

```
src/data/            all balance and content (weapons, passives, evolutions, enemies, bosses, items, stage timeline)
src/core/            simulation without Phaser, runs in Node for tests
src/behaviors/       weapon and enemy behaviours, registered by name
src/render/, src/scenes/, src/ui/    the Phaser layer
src/services/        leaderboard, online co-op, codex, stash and achievements sync (Firestore, WebRTC)
assets/sprites/manifest.js    every sprite by key, and assets/raw/ holds the model's originals
tools/               asset scripts (generation through OpenRouter, slicing, PixelLab animation, sounds) and balance bots
```

More in [CLAUDE.md](CLAUDE.md) for the map and rules, [docs/META.md](docs/META.md) for items, crafting and achievements, [docs/CONTENT.md](docs/CONTENT.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/ASSETS.md](docs/ASSETS.md), [docs/COOP.md](docs/COOP.md) and [docs/LEADERBOARD.md](docs/LEADERBOARD.md).

## License and credits

MIT License, see [LICENSE](LICENSE). The game runs on [Phaser](https://phaser.io) 3.90.0 (MIT). The Jersey 15 font is by The Soft Type Project Authors under the SIL Open Font License 1.1. The license text is in `assets/fonts/OFL.txt` and the source is at https://github.com/scfried/soft-type-jersey. Sound effects are generated by `tools/make-sfx.mjs`, an in-house sfxr-style synthesizer with no third-party samples. The background music is "Whispers of the Abyss", a royalty-free track. Art was generated by `openai/gpt-image-2.5-flare` through OpenRouter and animated in [PixelLab](https://pixellab.ai), then cleaned and sliced by the scripts in `tools/`. Mechanics are inspired by Vampire Survivors and HoloCure, and no assets or names from either game are used.
