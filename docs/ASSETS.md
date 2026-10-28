# Assets

Sprites are generated with `tools/gen-sprite.mjs`, cleaned to pixel art with `tools/clean-sprite.mjs` and `tools/slice-sheet.mjs`, and their keys and frame geometry are defined in `assets/sprites/manifest.js`. Sound and music are procedural, created with `tools/make-sfx.mjs` and `tools/make-music.mjs`. All scripts run from the repo root. The `sharp` package is installed via `npm install`. The game references sprites only by key from the manifest. A real sprite file replaces a placeholder with the same name, frame size, and origin.

## Pixel density

The world and UI use 640×360 coordinates, with the canvas at 1280×720 (`RENDER_ZOOM = 2`). Sprites are drawn at scale `1 / density` (`src/render/density.js`). The `density` field in the manifest tells how many image pixels map to one world pixel. All sprites scale by integer multiples without resampling.

| density | world scale | 1 image pixel on canvas | When to use |
|---|---|---|---|
| 2 | 0.5 | 1 px | currently unused; pixel is half the size of character sprites |
| 1 (default) | 1 | 2×2 px | everything: characters (~50 px in 56×56 frames), bosses (~95 px in 96×96 frames), environment, items, icons. Characters and environment are captured cell-by-cell from the model's native grid |
| 2/3 | 1.5 | 3×3 px | bosses: same sheet as characters but three times the hero's height |
| 0.4 | 2.5 | 5×5 px | menu background (`tools/snap-image.mjs`) |
| 4, smooth | 0.25 | smooth | `proj_blade_arc`: procedural slash arc (`tools/make-slash.mjs`), stored at maximum display size and scaled linearly (marked `smooth` in manifest), no pixel grid |

Selection rule: new sprites use density 1 on the same grid as characters (typical character height ~50 cells, tree ~100). Use 0.5 only for large effects stretching from 64 px width.

Canvas-to-screen scaling: with integer screen scale, pixels stay sharp (`image-rendering: pixelated`). With non-integer scale, soft antialiasing kicks in (`src/ui/scaling.js`).

## Generation: `tools/gen-sprite.mjs`

```
node tools/gen-sprite.mjs <name> [--ref path]... [--aspect 3:2] [--quality medium] [--bg transparent] [--model google/gemini-3-pro-image] [--resolution 2K] [--dry-run]
```

- Prompt: `tools/prompts/_style.txt` (general style, goes first) plus `tools/prompts/<name>.txt` (character or sheet). Output: `assets/raw/<name>.png`, the raw model response.
- References `--ref`: `references/main.png` (technique and chibi proportions) for the character roster sheet; finished `assets/raw/roster.png` for other sheets to maintain cell size and style. The `references/` folder is not in git.
- Characters: one shared roster sheet (`tools/prompts/roster.txt`, `--aspect 21:9 --quality high`) with the hero, enemies, and three bosses twice as tall, all in idle pose facing three-quarters right. Walking is procedural (`src/render/anim.js`). Environment or item sheets have objects spaced apart, with sizes given relative to the character (e.g., "twice as tall as the girl").
- `--model`: defaults to the ledger model (Flare). Gemini (Nano Banana Pro, `google/gemini-3-pro-image`, ~$0.136 per 1K/2K image): ignores `quality`, `background`, and `moderation` flags. The background is opaque (the prompt requests magenta #FF00FF), and `_style.txt` is not added. Gemini's grid is soft and uneven (18–22 px per cell), so frames often need downscaling.
- Halo: Flare draws glows (fire, lightning, runes) as soft semi-transparent mist around objects. On a checkerboard it's invisible, but on dark backgrounds or in JPEG it appears as colored fog. Check a sheet with `node tools/alpha-check.mjs assets/raw/<sheet>.png` (outputs the proportion of semi-transparent pixels and previews on black and white in `tools/out/`). A clean sheet has almost no semi-transparent pixels. The `icons_all.txt` prompt (all 45 game icons in one 9×5 sheet) forbids glows outside outlines. If mist remains, a second pass with `icons_all_fix` and the sheet in `--ref` asks the model to remove only the halo.
- OpenRouter key: locally from `.secrets/openrouter-flare`, in cloud sessions from the `OPENROUTER_API_KEY` env variable.
- Editing a finished sheet: pass the sheet in `--ref` and a prompt like "return the same image but change only…" (in a separate `tools/prompts/` file, delete it after use). Flare preserves layout and grid but doesn't erase tiny details like a 1–2 cell mouth.
- All model-sheet sprites go through HD: in `sheets.json`, set `"hd": { "default": k, "<key>": k }`. The figure isn't sampled by grid but smoothly downscaled from the source (lanczos3, alpha by threshold) by factor k and displayed 1:1 on canvas (`density: 2`, constant `HD` in manifest).
  Scale factors: characters 0.392 (like the hero), bosses 0.588, environment 0.28, items and projectiles 0.152, slash arc 0.62 (256 frame, density 4, smooth), holy circle 0.28, icons 0.31.
  Frame size in the manifest is in canvas pixels (twice world size). An element `{ "key", "hd": false }` provides only the source (`--raw`): the hero and cat have their own walk strips.
- Icons are 96×96, and `src/ui/icons.js` downscales them once for each display size and renders 1:1.
- Character animation: PixelLab `animate-with-text-v3` (first frame up to 256×256, source from `assets/raw/roster/`), frames in `assets/raw/<animation>/`, then create a strip with `node tools/hd-frames.mjs <out.png> <scale> --canvas 110x110 <frames...>` and `chara(...)` in manifest. Don't trim these frames by grid; details are 1 pixel.
  Standard character frame (all except bosses and Reaper): 110×110 (`CHAR` in manifest), feet on the bottom line centered, art unscaled, margin around for hair and weapon. Frame 0 is idle, then the walk cycle. Frame count comes from PNG width (`src/scenes/Boot.js`). Use 4, 9 or 24 frames. Append 110×110 squares to the right, don't edit code or manifest. The test `tests/unit/sprites.test.js` verifies width is divisible by frame size. Bosses and Reaper use their own frame size, frame count read the same way.
  Canvas margins don't recover what PixelLab already trimmed. The hero, Mage, and bosses touch the top edge of the 192×256 canvas (256×256), with hair already cropped there. Fix this only with a new first frame with margin and regeneration.
  First frame: source from `assets/raw/roster/<key>.png`, scaled to 256/261 (like the hero), bottom-aligned to the 192×256 canvas, then run `tools/pixellab-anim.mjs`.
  Cycle seam: if the idle pose (frame 0) is silhouette-wise closer to frames 8 and 1 than they are to each other, it's placed as a transition (`seam: true`: cycle 1..N-1, then 0; all PixelLab animations do this). Custom frame order: `walk: [...]`.

### PixelLab animation plan by character

The 192×256 canvas costs 6 of the trial budget generations (the hero and cat used 33 of 40 budget, leaving 27: room for 4 more characters).

Actions go to PixelLab in English as-is (`PL_ACTION`), with a translation reference below.

| Character | Action (PL_ACTION) | Reference | Status |
|---|---|---|---|
| catgirl | walking to the right in place, light graceful cat-like walk cycle, small steps, arms swing gently, cat tail sways behind her, ears twitch | walks right in place with a light, graceful cat gait, tiny steps, gentle arm swing, tail sway, ear twitch | done |
| foxgirl | walking to the right in place, playful bouncy walk cycle, arms swing, big fluffy fox tail swishes side to side | walks right with a playful, bouncy gait, swinging arms, fluffy tail swishing | done |
| succubus | hovering in place facing right, slow wing flaps, gentle up and down float, tail sways | hovers right, slow wing flaps, gentle bobbing, tail sway | done |
| bunnygirl | hopping in place facing right, small rabbit hops, ears bounce, knees bend on landing | hops in place facing right, small hops, bouncing ears, knees bend on landing | done |
| harpy | hovering in place facing right, strong wing flaps, talons dangle, gentle bob | hovers right with strong wing flaps, dangling talons, gentle bobbing | done |
| lamia | slithering to the right in place, snake tail undulates in waves, upper body sways, arms relaxed | slithers right in place, snake tail undulates, swaying upper body, relaxed arms | done |
| slime | bouncing in place, squash and stretch, jelly body wobbles, hair-like drips sway | bounces in place, squashes and stretches, wobbling jelly body, swaying drip-like strands | done |
| ghost | floating in place facing right, gentle bob up and down, wispy tail and sleeves drift | floats right, gentle up-down bob, wispy tail and sleeves drift | done |
| kitsune_empress (boss) | standing idle facing right, nine tails sway in slow waves, sleeves and hair drift, calm breathing | stands idle right, nine tails sway in slow waves, sleeves and hair drift, calm breathing | done |
| harpy_queen (boss) | hovering in place facing right, large slow wing flaps, crown and feathers ruffle | hovers right with large slow wing flaps, crown and feathers rustle | done |
| dryad_queen (boss) | standing idle facing right, swaying like a tree in wind, leaves and vines in her hair rustle | stands idle right, sways like a tree in wind, leaves and vines in hair rustle | done |
| mage (hero Mage) | walking to the right in place, light elegant walk cycle, small steps, the staff stays in her raised right hand and bobs gently with each step, her left arm swings slightly, long twin tails and starry cape sway behind her, the big witch hat stays on her head | walks right with a light, elegant gait, staff in raised hand bobbing gently, twin tails and starry cape sway, witch hat stays on | done (canvas 256×256: hat and staff don't fit in 192×256; strip ×0.4282, same pixel size as hero; 8 generations) |
| reaper (overtime Reaper) | hovering in place facing right, slow gentle up and down float, long white hair and tattered cloak drifting in the wind, scythe sways slightly, cyan soul-fire flickers | hovers right, slow gentle float, long white hair and tattered cloak drift, scythe sways slightly, cyan soul-fire flickers | done (first frame from assets/raw/reaper.png, strip ×1.5) |

- `--dry-run` prints the request body without sending or spending budget.
- Budget: `tools/gen-ledger.json` tracks `budget` (5), `stop` (4.5), `spent`, and the list of costs. The script refuses to run if `spent + estimate > stop` (estimate is the priciest past cost or `estimatePerImage`). Costs are logged even if the response contains no images. Don't manually edit the ledger.
- One process at a time: a lock file `tools/.gen.lock` (in `.gitignore`). A second run exits with code 4. If a process dies and the lock remains, delete the file.
- Only this script reads the key from `.secrets/`. It doesn't reach the game, logs, or agents.
- Don't regenerate the same character more than once. Fix details with the cleaning script or keep the procedural animation.

## Cleaning: `tools/clean-sprite.mjs`

```
node tools/clean-sprite.mjs <raw.png> <spriteKey> [--frames N] [--colors 16 | --palette] [--threshold 0.4] [--dark 0.3]
  [--no-outline] [--grid | --resample] [--height N] [--frame N] [--out path]
```

Frame size, origin, and height come from the `spriteKey` record in the manifest. Output is written to `assets/sprites/<key>.png` as a horizontal strip. `--out` writes to a different file (for testing). The script prints JSON showing mode and size for each pose. A non-zero `clipped` value means the art didn't fit in the frame. Increase the frame in the manifest or set `--height`.

Steps: background removal (alpha or magenta chroma key, removes halo), pose detection (columns are split at empty gaps), then one of the modes, remove stray pixels, align to frame with origin at feet.

- `--grid` is on by default for sprites with `density > 1`. The model draws pixel art on its uneven grid. Cell boundaries are found by color shifts, and the most common color in each cell is extracted. Art is transferred one art-pixel to one pixel, without resampling or new outline (it already has one).
- `--resample` (default for density 1): downscales to the manifest height, quantizes using `--colors N` or the shared `tools/palette.json` (with `--palette`), and draws a 1 px outline.
- Shrink: if native height after `--grid` exceeds `manifest.size[1]` (or `--height`) by more than 10%, the art is downscaled by block voting. This handles varying cell sizes across model sheets.
- Stuck poses: poses are detected by empty columns. If adjacent poses overlap horizontally (as happened with a boss), they merge into one frame. Manually separate the sheet first: distribute poses by connected regions with gaps between them, then feed the result to `clean-sprite`. For the boss this was `assets/raw/dryad_queen_split.png`. Separation used a one-time script: find 8-connected mask regions, treat the three largest as poses, attach small pieces to the nearest pose by x, copy poses without resampling with 80 px gaps. Feed the split file to `clean-sprite`. Alternatively, regenerate the sheet requesting larger gaps between poses.

Verify output: `node tools/contact-sheet.mjs <key>` and review by eye.

## Object sheets: `tools/slice-sheet.mjs` and `tools/sheets.json`

For environment, items, icons, and projectiles: a single image with scattered objects.

```
node tools/slice-sheet.mjs <sheet> [--report]
```

- `tools/sheets.json`: `{ "<sheet>": { "raw": "assets/raw/x.png", "items": [...] } }`. Sheets: `roster`, `env_props`, `items`, `icons`, `projectiles`. Optional sheet fields: `step: [min, max]` (model grid cell step bounds in source pixels, ~4.5–7 for `--quality high`), `rows: "center"` (align rows by center, for tall figures on two rows), `mergeGap` (merge regions closer than this, default 14, use 0 for tight figures), `cuts: [[x, y0, y1], ...]` (vertical mask cuts if adjacent figures touch with glow or tail; `[x0, x1, y, "h"]` for horizontal step cuts around protrusions), `boxes: [[x0, y0, x1, y1], ...]` (bounding box for each item: region goes to the box where its center lands, each figure gets its own mask; `roster` uses this), `drop: [[x0, y0, x1, y1]]` (regions with center inside are discarded), `align: "head"` (step frames align by head).
- `items` are read in order (rows top to bottom, left to right). Each item is a sprite key, or `{ "key", "frame", "flip" }` for a frame of a multi-frame sprite (`tree`, `flower`), or `null` to skip a found object (the last `null` in `icons`).
- `--raw` (for sheets with `boxes`): each figure also at source resolution with transparent background, `assets/raw/<sheet>/<key>.png`. These are references for Nano Banana and the hero in the menu (`heroine_menu` = `assets/raw/roster/heroine.png`).
- `--report` only prints found objects and their native sizes, doesn't write files. Run this first. The count should match `items`.
- Objects larger than `manifest.size` are downscaled by block voting, smaller ones keep native size. With `origin[1] = 1` they're bottom-aligned to the frame, otherwise center-aligned.
- New object: add key to manifest, add to `items` in the sheet in the right position, add a prompt in `tools/prompts/<sheet>.txt`.

## Other scripts

- `node tools/contact-sheet.mjs [key ...] [--scale 4] [--out tools/out/contact-sheet.png] [--bg grass]`: preview sprites on a checkerboard or grass with label and origin line. Without keys, uses all from manifest. `tools/out/` is in `.gitignore`.
- `node tools/snap-image.mjs <raw.png> <out.png> [--step N]`: a whole image (background) sampled from the model's native grid losslessly, displayed at integer scale via `density` in the manifest.
- `node tools/make-grass.mjs [--seed 7]`: a procedural seamless tile `assets/sprites/grass.png` (128×128).
- `node tools/make-slash.mjs`: sword slash arc `assets/sprites/proj_blade_arc.png`, with a conical strike edge as an SVG ring arc around the hero in off-white (the evolved weapon's tint colors it). Frame geometry is in `WEAPON_BEHAVIOR.melee_arc` in `src/data/weapons.js` and read by the weapon. After editing numbers, rerun the script.
- `node tools/make-weapon-art.mjs [wisp|shot|meteor|spear|bolt|mine|frost|beam|cloud]...`: procedural weapon sprites (all if no args) in the style of projectile sheet daggers: pixel art without smoothing, `tools/palette.json` palette, outline on hard objects (spear, bolt, mine, ball), glow without outline using stepped alpha. Frame strips: wisp spark `proj_wisp` (8: core, halo, color shift blue ↔ cyan ↔ white, pulse, flame flicker) (meteor `meteor` is deferred: game uses old sprite, script doesn't redraw it without args), mine `proj_mine` (6: blinking spark), ice ball `proj_frost` (4: sparkles), beam link `proj_beam` (4: scrolling glints). Frame count comes from PNG width, projectiles play them by sim time (`FX.projAnim` in `src/render/world.js`). Wisp shot `proj_wisp_shot` is `proj_enemy` from the sheet with hue shift to blue. `proj_poison_cloud` is for Codex only (in-game cloud is a zone). New weapon icons remain placeholders until real art. Frame sizes from manifest; after edits, rerun the script.
- `node tools/trim-wisps.mjs [apply]`: PixelLab added stray flame flicks above the Reaper's hood and in her hair. This script erases scattered spots and cyan pixels stuck to the figure in set zones, then reassembles the strip with `hd-frames.mjs` at scale 1.5.
- `node tools/demouth.mjs [key...] [--dry] [--debug]`: PixelLab draws mouths on characters that had none in the source. The script finds the head on each frame (offset from frame 0), looks for closed non-skin patches under the eyes, and fills them with surrounding skin. It edits `assets/raw/<key>_{anim|walk}_pixellab/*.png` in place, then reassembles strips with `tools/hd-frames.mjs` (0.4 for characters, 1 for bosses). Face points per character and manual rectangles for tricky frames are set at the start of the script. `--debug` writes a check sheet to `tools/out/demouth-debug.png`.
- `node tools/sprite-table.mjs`: rebuilds the "Sprite table" section in this file. Run after manifest edits.
- `node tools/placeholders.mjs [--force]` (or `npm run placeholders`): colored placeholder sprites from manifest (shape from `shape`, color from `color`). Existing files are left alone without `--force` to avoid overwriting real sprites.
- `node tools/playtest.mjs`: headless playtest with `__game.debug()` log and screenshot for testing results in-game.

## Sound

- Effects: `node tools/make-sfx.mjs [name...]` (or `npm run sfx`) writes `assets/audio/sfx/<name>.wav` (22050 Hz, mono, 16-bit) from `PRESETS` at the script's start. Preset fields are documented there as comments (`wave`, `freq`, `slide`, `attack/sustain/decay`, `steps`, `lp`, `noiseMix`). Synthesis is deterministic. New sound: add a preset, add the name to `SFX_NAMES` in `src/audio/sfx.js` (used for loading and simultaneous count limits), call `playSfx(scene, '<name>')` or add a branch in the event handler in that file.
- Override with a file: drop a .wav with the same name in `assets/audio/sfx/`. Then run `make-sfx.mjs` with explicit names only; without args it regenerates all effects.
- Music: `assets/audio/music/theme.mp3` is "Whispers of the Abyss (Loop)" (2:40, 128 kbps, royalty-free, not credited), with key `music_theme` in `src/audio/sfx.js`. Backup procedural loop: `node tools/make-music.mjs` writes `theme.wav` (A minor, 140 bpm, ~41 s). To use that, change the path in `preloadAudio`. Add the source and license of external audio to the Credits section in `README.md`.

## Font

`assets/fonts/Jersey15-Regular.ttf` (OFL license, `assets/fonts/OFL.txt`), loaded via `FontFace` in `src/scenes/Boot.js`. Source is noted in README.md, Credits section. To replace: use another file at the same path or change `FONT_NAME` and the path in `Boot.js`.

## Sprite table

Built by `node tools/sprite-table.mjs` from `assets/sprites/manifest.js` (frame, frame count and density) and `tools/sheets.json` (source sheet).

| Key | Frame | Frames | density | Source |
|---|---|---|---|---|
| `heroine` | 128×128 | 9 | 2 | `assets/raw/heroine_walk256_pixellab/` (PixelLab Edit Pro stance and Animate V3 walk, 256×256, tools/hd-frames.mjs ×0.5) |
| `heroine_portrait` | 48×48 | 1 | 1 | placeholder (tools/placeholders.mjs) |
| `mage` | 128×128 | 9 | 2 | `assets/raw/mage_walk256_pixellab/` (PixelLab Edit Pro stance and Animate V3 walk, 256×256, tools/hd-frames.mjs ×0.5) |
| `mage_menu` | 164×223 | 1 | 2 | `assets/raw/roster/mage.png`: cut from `assets/raw/mage.png` (tools/crop-raw.mjs), scaled ×261/637 to match the copy of the Hero on the same sheet |
| `mage_portrait` | 48×48 | 1 | 1 | placeholder (tools/placeholders.mjs) |
| `heroine_menu` | 114×209 | 1 | 2 | tools/crop-raw.mjs |
| `catgirl` | 128×128 | 9 | 2 | `assets/raw/catgirl_walk_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `foxgirl` | 128×128 | 9 | 2 | `assets/raw/foxgirl_anim_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `succubus` | 128×128 | 9 | 2 | `assets/raw/succubus_anim_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `slime` | 128×128 | 9 | 2 | `assets/raw/slime_anim_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `ghost` | 128×128 | 9 | 2 | `assets/raw/ghost_anim_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `bunnygirl` | 128×128 | 9 | 2 | `assets/raw/bunnygirl_anim_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `harpy` | 128×128 | 9 | 2 | `assets/raw/harpy_anim_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `lamia` | 128×128 | 9 | 2 | `assets/raw/lamia_anim_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `kitsune_empress` | 256×256 | 9 | 2 | `assets/raw/kitsune_empress_anim_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `harpy_queen` | 256×256 | 9 | 2 | `assets/raw/harpy_queen_anim_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `reaper` | 256×256 | 9 | 2 | `assets/raw/reaper_anim_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `dryad_queen` | 256×256 | 9 | 2 | `assets/raw/dryad_queen_anim_pixellab/` (PixelLab, tools/hd-frames.mjs) |
| `xp_small` | 20×24 | 1 | 2 | `assets/raw/items.png` |
| `xp_medium` | 24×30 | 1 | 2 | `assets/raw/items.png` |
| `xp_large` | 28×40 | 1 | 2 | `assets/raw/items.png` |
| `food` | 34×34 | 1 | 2 | `assets/raw/items.png` |
| `magnet` | 32×32 | 1 | 2 | `assets/raw/items.png` |
| `coin` | 24×28 | 1 | 2 | `assets/raw/items.png` |
| `chest` | 44×40 | 1 | 2 | `assets/raw/items.png` |
| `proj_blade_arc` | 256×256 | 1 | 4, smooth | tools/make-slash.mjs |
| `proj_crescent` | 256×256 | 1 | 4, smooth | tools/make-slash.mjs |
| `proj_dagger` | 40×20 | 1 | 2 | `assets/raw/projectiles.png` |
| `proj_shield` | 44×44 | 1 | 2 | `assets/raw/projectiles.png` |
| `proj_holy_ground` | 128×128 | 1 | 2 | `assets/raw/projectiles.png` |
| `proj_axe` | 44×44 | 1 | 2 | `assets/raw/projectiles.png` |
| `proj_chain` | 44×44 | 1 | 2 | `assets/raw/projectiles.png` |
| `proj_firebomb` | 44×44 | 1 | 2 | `assets/raw/projectiles.png` |
| `proj_enemy` | 20×20 | 1 | 2 | `assets/raw/projectiles.png` |
| `proj_spear` | 48×16 | 1 | 2 | tools/make-weapon-art.mjs |
| `proj_bolt` | 36×12 | 1 | 2 | tools/make-weapon-art.mjs |
| `proj_mine` | 28×28 | 6 | 2 | tools/make-weapon-art.mjs |
| `proj_frost` | 44×44 | 1 | 2 | tools/make-weapon-art.mjs |
| `proj_poison_cloud` | 128×128 | 1 | 2 | tools/make-weapon-art.mjs (codex only, in game it is a zone) |
| `proj_beam` | 28×12 | 4 | 2 | tools/make-weapon-art.mjs |
| `proj_wisp` | 28×28 | 8 | 2 | tools/make-weapon-art.mjs |
| `proj_wisp_shot` | 20×20 | 1 | 2 | tools/make-weapon-art.mjs (proj_enemy, tinted blue) |
| `proj_meteor` | 56×56 | 1 | 2 | tools/make-weapon-art.mjs |
| `icon_blade_arc` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_throwing_daggers` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_guardian_shields` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_holy_ground` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_war_axe` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_storm_chain` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_firebomb` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_spear` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_hammer` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_crossbow` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_mines` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_frost_orb` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_poison_cloud` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_beam` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_wisp` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_meteor` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_max_hp` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_attack` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_speed` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_crit` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_pickup` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_haste` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_luck` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_armor` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_regen` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_magic` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_crit_dmg` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_area` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_duration` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_xp_gain` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_dodge` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_thorns` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_heal` | 96×96 | 1 | 2 | `assets/raw/icons.png` |
| `icon_crimson_arc` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_thousand_edge` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_aegis_bastion` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_soul_garden` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_death_spiral` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_thunder_loop` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_napalm_rain` | 96×96 | 1 | 2 | `assets/raw/icons_redo.png` |
| `icon_dragon_lance` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_titan_maul` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_ballista` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_minefield` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_blizzard` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_miasma` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_prism_ray` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_spirit_choir` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_starfall` | 96×96 | 1 | 2 | `assets/raw/icons_new.png` |
| `icon_unique_bible` | 96×96 | 1 | 2 | `assets/raw/icons_uniques.png` |
| `icon_unique_glass_cannon` | 96×96 | 1 | 2 | `assets/raw/icons_uniques.png` |
| `icon_unique_kaom_heart` | 96×96 | 1 | 2 | `assets/raw/icons_uniques.png` |
| `icon_unique_sprinter` | 96×96 | 1 | 2 | `assets/raw/icons_uniques.png` |
| `icon_unique_turtle` | 96×96 | 1 | 2 | `assets/raw/icons_uniques.png` |
| `icon_unique_berserk` | 96×96 | 1 | 2 | `assets/raw/icons_uniques.png` |
| `icon_unique_spiked_shell` | 96×96 | 1 | 2 | `assets/raw/icons_uniques.png` |
| `icon_unique_last_chance` | 96×96 | 1 | 2 | `assets/raw/icons_uniques.png` |
| `icon_unique_myopia` | 96×96 | 1 | 2 | `assets/raw/icons_uniques.png` |
| `icon_unique_clock` | 96×96 | 1 | 2 | `assets/raw/icons_uniques.png` |
| `icon_unique_monk` | 96×96 | 1 | 2 | `assets/raw/icons_uniques.png` |
| `icon_unique_dice` | 96×96 | 1 | 2 | `assets/raw/icons_uniques.png` |
| `menu_bg` | 265×150 | 1 | 0.4 | `assets/raw/menu_bg.png` (tools/snap-image.mjs) |
| `grass` | 128×128 | 1 | 1 | tools/make-grass.mjs |
| `tree` | 128×208 | 2 | 2 | `assets/raw/env_props.png` |
| `rock` | 56×56 | 1 | 2 | `assets/raw/env_props.png` |
| `bush` | 64×64 | 1 | 2 | `assets/raw/env_props.png` |
| `flower` | 44×44 | 2 | 2 | `assets/raw/env_props.png` |
| `barrel` | 44×52 | 1 | 2 | `assets/raw/env_props.png` |
| `lantern` | 52×80 | 1 | 2 | `assets/raw/env_props.png` |
| `cart` | 112×104 | 1 | 2 | `assets/raw/env_props2.png` |
| `signpost` | 96×128 | 1 | 2 | `assets/raw/env_props2.png` |
| `stump` | 80×72 | 1 | 2 | `assets/raw/env_props2.png` |
| `fence` | 112×72 | 1 | 2 | `assets/raw/env_props2.png` |
