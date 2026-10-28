# Fury Survivors

## What we're building

A Vampire Survivors-style game, visually and in animation and gameplay closest to HoloCure. A hero runs across a field. Crowds of enemies attack from all sides. Weapons fire automatically. Experience drops from enemies. At each new level, you pick an upgrade from several options. The stage lasts a fixed amount of time, with a boss at the end.

For now we need a demo, but a complete one. It should have a start screen with a play button, pause on Esc, menu exit, and a death screen with results. Visually the demo should have everything: animations, effects, damage numbers, screen shake, particles, and sound.

## References

The references folder has screenshots from HoloCure (gameplay, main menu, upgrade choice screen, shop), a Vampire Survivors screenshot, and a pixelated girl (main.png) in whose style and graphics I want to see the game.

## Graphics

Everything in pixel art like the reference girl: dark one-pixel outline, soft pastel colors, two or three shades per color. We take only the drawing technique from the reference, with adult proportions. Pixels are sharp, no blur on scaling. Hero and enemies should have at least idle, walk, damage, and death poses. Different enemy types, all in one style matching the reference so the game doesn't look assembled from different sources.

The main hero is a red-haired knight woman. Enemies are monster girls in anime style: cat girls, fox girls, slimes, ghosts, succubi and so on. The more variety, the better.

All characters are adult women. Costumes are daring in an anime and JRPG spirit, within PG-16: exposed thighs and belly, short skirts and shorts, stockings, some with large breasts, no nudity. If you generate images, describe only the outfit and figure in the prompt, without words like sexy, fanservice, seductive, or busty, so the drawing model's filter doesn't reject requests.

We'll generate assets via API using references (the .secrets/ folder holds the OpenRouter key, gpt-image-2.5-flare). If the sprites come out dirty, we need to clean them programmatically into real pixel art with a script. The OpenRouter key has a budget that we need to watch and not burn with repeated generation, especially when agents work in parallel.

Assets are generated in parallel with code. Until they're ready, the game has placeholders the same frame size with the same anchor point. Finished sprites are submitted for review one at a time or in batches and swapped in without code changes.

We do not copy assets, names from HoloCure or Vampire Survivors. We can take mechanics and balance, but not images, sounds, and names.

The base resolution is like HoloCure. Character sizes relative to each other must be consistent. Humanoids should be the same pixel height, monsters can be different sizes from tiny bats to large slimes. Graphics should not be muddy.

Graphics should hold direction. Characters shouldn't face the viewer. Walk frames shouldn't look identical. Consider that enemies move toward the hero in all 360 degrees. The system should be simple and not dependent on the drawing model. For example, all characters in one three-quarter view to the right, and we just mirror for the left side. Procedural walk. Suggest a better way or your own option.

Animation can be added procedurally too: sway, squeeze, tilt, white flash on damage, puff on death, recolor one enemy into variants.

Suggest what's best or your own option.

## Sound

Sounds should be dopamine-friendly, nice but not intrusive, like in Roblox. One background song, free from the internet, separate file so it's easy to replace. Suggest where to get sound effects (generate procedurally, free packs, or model generation).

## Controls

On desktop the hero walks on WASD or arrow keys in eight directions. Esc pauses. You navigate the menu and upgrade cards with keyboard and mouse.
On phone there's no keyboard, so you need finger control (for example on-screen joystick) and a pause button instead of Esc.
Whether gamepad support is needed, let me know.

## Performance

The game should hold hundreds of enemies on screen at 60 fps, including on phone.

## Language

Interface in English, with easy ability to add other languages later.

## Content

The demo should already have several types of active weapons and passives so there's something to choose at levels. You can take them fully from similar games along with their balance. Data can be found online: Vampire Survivors and HoloCure wikis. As a backup you can find open source implementations of games in this genre and see how they did it.

I know these mechanics from those games and want to see them or at least discuss them:
- Weapons fire automatically on a timer
- Experience drops from enemies, magnet pulls it to the player, magnet radius upgrades
- Choice of several upgrades at new level, with reroll
- Stats: health, attack, speed, crit, pickup radius, attack speed
- Combination of two upgraded weapons into one super weapon (collabs in HoloCure, evolutions in Vampire Survivors)
- Enemy knockback
- Brief invincibility after taking a hit
- Elite enemies, recolored, stronger with better drops
- Boxes and chests with bonuses
- Food that heals
- Boss at stage end

Review this list and suggest what else should apply.

## Structure for future growth

Even though this is a demo, it's the start of a big game, not a one-off prototype. After the demo is done, in separate sessions I'll add new content. The structure should be convenient for growth from day one.

What should be easy to add:
- new active weapon and its levels
- new passives and stat upgrades
- new heroes with their own starting weapon and stats
- new enemies, elite variants, and bosses
- new maps, environments, and objects (trees, stones, boxes)
- enemy waves and events over stage time
- weapon combinations

Ideally new weapon, enemy, or hero is added as data description and sprite, without rewriting the engine or fixing code. All balance (damage, speed, health, experience, wave frequency) sits in one place so it can be tuned without touching logic. Document how to add each of these so both a person and an agent can do it.

## Technology

I don't know what we'll build with. There's only one requirement: JavaScript and multiplatform, meaning it works in a browser, on phone, and if desired, builds for desktop. For the demo stage we only need a website.
JavaScript is needed because neural networks understand it best. We don't use TypeScript because the build would complicate the project.

Given all of the above I need the pros and cons of using existing libraries, engines, or building the game without them. Also suggest what you think is best for agents.
Focus on what will give the most beautiful result in the least time.

Still have questions about the technical side:
- How agents will see what came out on screen
- If we use an engine, how to keep its documentation handy
- What automated tests we need so balance is checked at the test level, same as minimal game launch
- Git from the start for versioning, backups, and rollbacks. Repository on GitHub (help set it up, I have an account) and deploy to GitHub Pages so friends can open the game from a link on their phone right away

Any keys and secrets live outside the repo. The .secrets/ folder is in .gitignore from the first commit. The key never goes into the repo or game code. Asset generation runs as a local script, not from the browser. The game will be on public GitHub Pages and the key would be stolen from the page code in minutes.

## How we work

You build the project structure yourself based on the discussion, answers, and brainstorm. I don't know how it should be set up correctly. Lay out documentation so agents have somewhere to write and somewhere to read.

Set up a Sonnet agent to write code in advance. State the model explicitly in the agent description. The main session on Opus plans, assigns tasks, verifies results, commits, pushes, and deploys. Two to three agents work at the same time, no more, and only on tasks that don't touch the same files.

We check the game mostly through text, game state, console, tests. We take screenshots in small size and only at key stages.

Put a short project map in the root where things are and where to add them, so agents don't study the whole codebase.

All work should fit in one 5-hour Pro subscription window. The main session checks spending after each stage and reports when we reach 75%.

After brainstorming I'll open another session and ask you to start work. I'll leave this one open for questions.

Ask me anything before you start building.

## Goal

Playable demo in 30 minutes from the start of development, deployed to a link. The brainstorm is unlimited in time.
