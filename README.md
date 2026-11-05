# Sky Breakout

A multiplayer sky obby for the browser, built with **Three.js** and **Colyseus** for Bloxity. **One long run through the sky: 135 stages, nine worlds, harder all the way.** Every stage starts on a checkpoint. Reach the Breakout Balloon at the end, claim your Star, and run it again for bigger pay. Every few minutes everyone is invited to a **Storm Rush**: eight racers on one course with a storm rolling up behind them.

The genre, the core loop and the pacing follow the Roblox game *[Escape Parkour Obby](https://www.roblox.com/games/15266716361/Escape-Parkour-Obby)* (see the video in `reference/`). The name, the worlds, the art, the items and the wording are all our own, drawn by this game's code; nothing is taken from the reference.

**There are no in-app purchases.** Everything costs Coins (from stages, quests and races), Gems (from quests, daily tasks, gifts, winning, the daily reward and codes) or Stars (one a Breakout), all earned in the game.

It shares its engine with the other Legion games (the server, Bloxity login and avatars, the top games' character animation, the camera and lighting rig, the quality system, profiles, saves, play stats; forked from Parkour Spiral, the newest game in the folder and the closest in genre).

## Project layout

| Folder | What it is |
|---|---|
| `client/` | Vite + Three.js client: `main.js` (boot and warm-up, your character on the shared physics, the camera, keyboard / mouse / touch / controller, other players smoothed on the server's clock, the queue and Storm Rush, the network, the QA autopilot), `world.js` (a course on screen: every part and prop's look, the near stages batched into one draw, the far picture, the sea, the clouds), `surfaces.js` (one array of painted tiles, the one material the whole course is drawn with, and everything that moves, moved in the vertex shader), `kit.js` (rounded boxes and discs, tori, tubes), `hub.js` (the home island: the Start Gate, the stalls, the portal, the boards, palms instanced per square), `crowd.js` (the buddies), `signs.js` (every floating sign in one draw), `asmr.js` (every little sound synthesised sample by sample at load), `chars.js` (a character), `smooth.js` (the server's clock and the snapshot buffer), `icons.js` (the HUD's drawn icons), `ui.js` + `index.html` (HUD and panels), `audio.js`, `fx.js`, `engine.js`, `geo.js`, `blobs.js`, `avatar.js`, `animator.js` |
| `server/` | Colyseus 0.18 server: the `obby` room (`ObbyRoom.js`: the stages, the balloon, the queue and invitations, gear, trails, eggs, tasks, quests, rewards, codes, its bots), `match.js` (one Storm Rush: phases, racers, bots, the storm, the pay), `guard.js` (what moves are possible), profiles (MongoDB on Legion), leaderboards, play stats |
| `shared/` | `config.js` (levels, pay, gear, trails, buddies, eggs, tasks, quests, rewards, codes, the storm), `course.js` (the courses: the 27 obstacles, the 135-stage run, the Storm Rush maps; both sides build the same course from the same numbers), `physics.js` (moving and jumping: your screen runs it for you, the server for the bots), `pilot.js` (runs a course: the bots, the QA autopilot and the headless test all use it) |
| `tests/` | The test scripts (see Testing) and the setup-page generator |
| `covers/` | The two store covers (1920x1080, 800x800), rendered from the game |

## Run it locally

Needs Node 20 or newer. Double-click `start-local.bat`, or:

```sh
npm install          # installs client and server too
npm run build        # builds the client into client/dist
npm start            # server + game on http://localhost:2933
```

For development run `npm run dev:server` and `npm run dev:client`, then open http://localhost:5495 (the client talks to the server on port 2933; `VITE_SERVER_URL` overrides that). Dev builds (or a build with `VITE_QA=1`) expose `window.__qa` (the autopilot, perf readings, teleports). Restart the server after changing `shared/`. For testing only, `QA=1` lets the client give itself Coins, Gems and levels (`__qa.give`); it is refused on Legion.

## Gameplay

- **No start menu.** A new player lands on the home island, the daily reward offers itself, and chevrons on the ground lead to the Start Gate. Coming back, you land on your last checkpoint.
- **The long run.** 135 stages, 12,900 studs, zigzagging up into the sky over the sea, the next stretch always in sight ahead of you. The bar at the top says which stage you're on. A bot that never slips takes 15 minutes; a person takes far longer.
- **Harder all the way.** Every stage is harder than the one before, by one formula (`stageD` in `shared/config.js`): smaller platforms, wider gaps, more of everything, quicker movers, up to about 1.5 times the top the first version had. Each number has a limit, and `tests/courses.mjs` proves a bot can still beat it. A world's last stage is a **gauntlet**: two to four obstacles in a row with no checkpoint between them.
- **Nine worlds**, fifteen stages each, each with its own sky, sea, colours, far-off islands and scenery: **Bounce Bay** (pool toys over a lagoon), **Candy Clouds** (wafers and gumdrops in a pink sky), **Emerald Ruins** (mossy temples over the jungle), **Neon Arcade** (glowing grids at dusk), **Clockwork Yard** (brass gears under a low sun), **Frost Peaks** (ice under the aurora), **Ember Rift** (black rock over a lava sea), **Starfall Orbit** (planets and drifting rocks among the stars), **Sunfire Crown** (gold and fire).
- **Seven new obstacles** came with them: crumbling bridges that drop away behind you, stone rollers to hop, pistons pumping up and down, rows of flame jets, conveyors that throw you off the side, platforms in orbit round a little planet, and rocks drifting in space.
- **20 kinds of obstacle**: stepping pads, candy-ring pads, broad stairs, spiral staircases round a stack of rings, thin beams with corners, platforms sliding across a gap, lifts, tiles that blink on and off, conveyors running against you, spinning discs, a bar sweeping a disc (time it or hop it), swinging hammers, sliding walls, laser curtains, floors of deadly tiles with one safe way across, ladders up truss towers, spring pads, slides with a leap off the lip, tunnels of hoops with hurdles, guess-the-door walls, slippery ice, and pillars rising like stairs. They get harder the further you go.
- **Checkpoints** are every stage's start: they pay Coins and XP, and it's where you come back to. A fall, a deadly tile or a knock into the sky and you're back on your last one.
- **The Breakout Balloon** at the end: climb in for Coins, Gems and a **Star**, then start again from Stage 1, every stage paying 25% more per Breakout. A clean run (no skip) gets a time and a rank from S to D.
- **Stuck?** A skip past the stage costs Gems you earned: 3 in the first world, 2 more in each world after it. No gear is ever needed to beat a stage.
- **Storm Rush**: every few minutes a card comes up for everyone (`Starts in 0:30`, `Join (3)`, `Dismiss`); **Rush** (or Enter) joins now or starts one. Everyone joining at about the same time goes into the same race and the card shows how many have been found; someone joining while it's still getting ready takes a bot's place, and bots fill only the empty places and carry on for a player who leaves. 3-2-1-GO, and after a head start the storm rolls along the course, faster and faster. It catches you and you're out. First to the finish wins; how far you got and your place decide the pay. There are six maps, one per world, by turns.
- **It grows with you**: seven tiers by level, from 6 stages at Level 1 to 20 at Level 30, harder obstacles, a quicker storm, and bigger pay.
- **Spending**: **gear** for Coins (Wind Shoes and Spring Boots, five levels each; Twin Hop; Feather Fall, tap to turn it on and off; the Cloud Cape, hold JUMP to glide), **buddies** out of eight eggs, 32 of them, Common to Mythic, following you and adding to your Coins; 17 **trails**, the best bought with Stars. Bloxity's own avatar is your character.
- **The rest of a session**: a chain of 29 **quests**; 3 **daily tasks**; a 7-day **daily reward**; **FREE gifts** at 2 / 5 / 9 / 14 / 20 / 30 / 45 minutes; codes (`SKY`, `BREAKOUT`, `BALLOON`, `BLOXITY`, `LEGION`, `STORM`); leaderboards for the fastest run, the most Breakouts and Storm Rush wins.
- **Pacing** (`tests/economy.mjs`, a simulated typical first session; it's a simulation, not a person's session, and numbers move between runs): gear in the first seconds, a new goal every minute or so (about 35 buys, levels, quests, gifts and races in the first 20 minutes), Stage 16 at about 11 minutes, Stage 31 at about 30, Twin Hop at 14 to 18 minutes, a Storm Rush every 5 minutes or so; after an hour Level 10, best stage 45 to 47, 12 to 17 of the 29 quests. The first Breakout is hours away. The simulation's time per stage is an estimate that hasn't been checked against people playing the harder stages.
- **The HUD** is out of your way while you run: only the stage bar, the clock and the Players list; stop and the menu comes back (Quests, Rush, Gear, Avatar, Music, Options, your Coins, Gems and Stars, the powers, your level).
- **The server decides** rewards and progress: every move (a budget of how far you could have run, how high you could have got from the last ground you stood on, allowing for a spring pad or a ladder near you, whether there's anything under you), every checkpoint (only one you're standing on, next in line or a couple ahead, once a run), the balloon, the storm, the pay. Your own movement runs on your device. Everything that moves is a pure function of one clock, so the bots, your physics and what you see all agree with no messages at all.
- **Far from the servers** (300-400 ms round trip from Sri Lanka): the server's clock corrected for the round trip, others drawn a little in the past between snapshots stamped with server time (twenty a second, only to those who can see them), each one's delay following how late their own snapshots really arrive and gliding as it changes.
- **Portrait phones**: the HUD sizes itself by the screen's width; the stage bar and menu sit right of the Bloxity corner; the Players list folded away; the stick and JUMP above the level bar; the camera widens and pulls back.

## Controls

| Action | Keyboard / mouse | Controller | Touch |
|---|---|---|---|
| Move | WASD / arrows | Left stick | The stick |
| Jump (again in the air with Twin Hop; hold in the air with the Cloud Cape to glide) | Space | A | JUMP |
| Up a ladder | Walk into it | Left stick | The stick |
| Feather Fall on / off | X, or its button | | FLOAT, or its button |
| Storm Rush | Enter, or the button | | The button |
| Camera | Drag, wheel (it also eases round to look the way the course goes; Options can turn that off) | Right stick | Drag, pinch |
| Back to your checkpoint | R | | |
| Quests / Avatar / Gear | Q / P / U | | The buttons |

## Sound

- **The little sounds** are synthesised sample by sample while the game loads (filtered noise, resonances, pitch sweeps; a few variations of each): a footstep for each kind of ground, jumps, landings and bounces. A sound in play is one buffer source and a gain (and a panner for someone else's), never more than 22 at once.
- **Music**, all generated: an easy bossa on the island, a driving one out on the course and in a Storm Rush. Each is rendered once into loops by an OfflineAudioContext (starting behind the loading screen, carrying on a few notes at a time in idle moments, the audio itself off the main thread) and plays from memory. The music is never played note by note, at any quality: a song whose loops aren't ready yet waits.

## Graphics and performance

**The look.** Matte Lambert and unlit materials only: no reflections, no environment maps or PMREM, no bloom, no post-processing. The top games' light rig everywhere: hemisphere 1.1, ambient 0.45, sun 1.5, PCFShadowMap, NoToneMapping; a world only tints it. What makes it look expensive is geometry and colour: every platform is a rounded slab or disc whose bevel catches the light, with its sides fading dark toward the bottom, painted tiles, a sky and sea that change with each world, and the whole course always in sight ahead of you.

**How it stays fast.**

- **One draw for a whole stretch of course.** The near stages are slots of one BatchedMesh, built a little at a time (at most 1 to 1.6 ms a frame) with our own culling per stage, so it doesn't send its draw list again every frame. The rest of the course is one plain mesh a world, with that world's islands and clouds as another; a world past the haze isn't drawn at all, and the stages drawn in detail are left out of the plain mesh in the vertex shader, with no buffer touched.
- **What moves costs nothing per frame.** Platforms, discs, bars, hammers, blinking tiles and curtains are all moved in the vertex shader from one small table of numbers, on the same clock as the physics (their shadows too). There's no matrix to write and no extra draw.
- **Instanced by square, with LOD.** The island's palms and umbrellas are instanced per square of the map, so what's off screen is skipped, each square with a near and a far version. Far characters lose their pets, trail and name tag and animate every other frame.
- **Weak devices.** Phones and weak PCs start on Low (4 cores or fewer, 4 GB or less, older Intel HD/UHD 6xx, small Radeons, software renderers): no shadow code at all, fewer parts, smaller tiles. Multisampling is decided before the WebGL context exists. Below about 54 FPS the resolution comes down first, then the quality.
- **The HUD** never reads layout or style in the frame loop, writes text only when a value changes and moves bars with transforms.
- **No hitches.** Every shader (batched, instanced, shadow variants) and every HUD screen is warmed up behind the loading screen; the GPU's name is read once while loading; every emoji is drawn once before play. Music is rendered once into loops by an OfflineAudioContext.

**Measured** (`LOW_GPU=1 node tests/perf.mjs`) on this PC's integrated Intel UHD Graphics. The weak laptop and the phones are simulated: Chrome's CPU throttle at 4x and the screen size, on the same chip, not real devices. FPS is what the game drew; on a screen over 100 Hz a touch device draws every other refresh, so about 70 there means it's keeping up. Work is the game's own time per frame on the main thread.

| Device | Where | FPS | Frame p95 | Work per frame | Draw calls | Triangles |
|---|---|---|---|---|---|---|
| Desktop 1600x900, Medium | Island | 144 | 7.1 ms | 1.61 ms | 38 | 76k |
| | Running | 144 | 7.1 ms | 1.72 ms | 27 | 86k |
| | Storm Rush, 8 racers | 144 | 7.1 ms | 2.27 ms | 37 | 27k |
| | Late in the run (Stage 113) | 144 | 7.1 ms | 1.48 ms | 20 | 46k |
| Weak laptop 1366x768, Low, CPU 4x | Island | 97 | 14 ms | 6.31 ms | 35 | 22k |
| | Running | 62 | 13.9 ms | 6.06 ms | 26 | 22k |
| | Storm Rush, 8 racers | 93 | 14 ms | 7.73 ms | 29 | 8k |
| | Late in the run (Stage 113) | 113 | 13.9 ms | 4.42 ms | 18 | 8k |
| Phone 844x390 @2x, Low, CPU 4x | Island | 92 | 14 ms | 6.64 ms | 35 | 22k |
| | Running | 64 | 13.9 ms | 6.15 ms | 24 | 22k |
| | Storm Rush, 8 racers | 77 | 13.9 ms | 7.89 ms | 32 | 10k |
| | Late in the run (Stage 113) | 73 | 14 ms | 6.18 ms | 16 | 8k |
| Phone 390x844 @2x, Low, CPU 4x | Island | 64 | 13.9 ms | 5.82 ms | 27 | 22k |
| | Running | 67 | 13.8 ms | 5.91 ms | 24 | 20k |
| | Storm Rush, 8 racers | 83 | 20.7 ms | 9.11 ms | 26 | 8k |
| | Late in the run (Stage 113) | 65 | 13.9 ms | 6.25 ms | 13 | 6k |

A figure like 62 or 64 FPS here is the frame pacing drawing every other refresh of a screen over 100 Hz, not the game falling behind. The numbers depend on what else the PC is doing: a run with other programs busy read 37 FPS for the portrait phone's Storm Rush (its work per frame 17.5 ms) where this quiet one reads 83 at 9.1 ms.

Load and join took 5.5 s on the desktop, 9.3 to 10.6 s at CPU 4x, with the page served by the dev server.

**The CPU profile** (`node tests/perf.mjs profile`, the unminified dev build, the weak laptop in a Storm Rush) is flat: 1.25 ms updating, 0.2 ms for the camera and sky, 3.29 ms rendering, with no function of the game's own above 5% of the time. **Known pauses:** going into a race builds its course behind the white fade, about a second at CPU 4x; and a frame of 50 to 70 ms can turn up now and then while a new stage is copied in on a throttled CPU. These numbers come from a simulated weak laptop and simulated phones: nothing here has run on a real phone yet.

## Testing

Test tools install on their own: `npm --prefix tests install`. Browser runs need Chrome (`CHROME=<path>` chooses which).

- **`tests/server.test.mjs`, a headless server test** (72 checks): a new player's start, ping and the clock, snapshots, the bots; the guards (too far, too high, a speed hack, standing on nothing, a deadly tile stood on, over the line before GO); the run over the network from the shared physics (a stage paying, not twice, a checkpoint far ahead, near one but not on it, a skip, the warps, the balloon); the queue (showing who's found, the same race for everyone, bots filling the empty places, joining before it really starts); a bot taking over for a player who leaves; a whole Storm Rush (one running, one standing still: who lasts, who gets what); gear, trails, eggs, codes once, the daily reward once a day, gifts on time, quests and tasks once; the save on rejoining.
- **`tests/courses.mjs`, every course can be beaten**: the pilot runs the long run and all 63 Storm Rush courses (9 maps x 7 tiers) on the shared physics, headless, at full speed and at the slowest bot's speed. On a Storm Rush map the full-speed bot also has to stay ahead of the storm all the way.
- **`tests/economy.mjs`, a simulated first session**, for the pacing above.
- **`tests/autopilot.mjs`, browser runs with the autopilot**: one press of SPACE gives one jump; the first stages of the run and of every world with the checkpoints paying and the server agreeing; a full Storm Rush on every map, at a different tier each; no snaps, no console errors. `node tests/autopilot.mjs full` runs all 135 stages to the balloon and claims it.
- **`tests/latency.mjs`, a 350 ms round trip** through a relay, two real browser players pressing Rush together: the round trip measured, the queue showing both, the same race, seeing each other, the other player and a bot each smooth from far away with a new snapshot every 90 ms or less, no snaps.
- **`tests/prod.mjs`, the production build with real input only** (no QA hooks; keyboard, mouse, touch; the game's words on screen as the only way to know what happened): the daily reward, holding W through the gate to the first stages, the clock, the bar, the menu coming back when you stop, every menu button, a typed code, buying gear, Rush, the queue, the card, GO, the storm, the results, back to your run; `loadingEnd()` called once, after joining a server (with a stand-in for the SDK); then a portrait phone by touch: both thumbs at once, Rush, the queue, the race.
- **`tests/screens.mjs`, screenshots of every screen** (the HUD, running, stopped, every panel, an egg opening, the queue, the card, the countdown, the race, the results) at 390x844, 360x800, 375x667, 844x390 and 1280x720, with the HUD's boxes and touch controls measured for overlaps, anything cut off and the Bloxity corner.
- **`tests/textfit.mjs`, every word on every screen** at 11 sizes (phones both ways up, tablets, desktops up to 1920x1080), with the biggest numbers, a clock of hours and several messages up at once: words on words or on an icon, spilling out of their box, cut off or off the screen. `NORACE=1` skips the race screens, `ALWAYS=1` saves a picture of each.
- **`tests/perf.mjs`, frame rates** (`LOW_GPU=1` for the integrated chip; `profile` for a CPU profile of the dev build; `watch` for the automatic drop in resolution and quality), **`tests/gallery.mjs`** (a picture of every stage), **`tests/covers.mjs`** (the two store covers).

## Hosting

See `bloxity-setup.html` (every field of Bloxity's Create New Game form, with copy buttons, and the two covers; `node tests/setup-page.mjs` writes it) and `.github/workflows/deploy.yml` (deploys to Legion on a push to `main`; prod at https://sky-breakout.play.bloxity.io once hosted). Play stats: `GET /api/stats?key=<stats key>&days=7` (the key is in `server/STATS_KEY.local.txt`, not in the repo): session length, time to the first race, races, wins, stages, levels gained, frame rate by device, errors.
