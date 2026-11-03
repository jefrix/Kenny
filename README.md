# Kenny

Home of **Robot Arena**: design a robot, program it with blocks, and watch it fight on its own. You never steer during a battle.

Open `index.html` through any static web server, or publish the repo with GitHub Pages. There is no build step and nothing to install; Three.js and the fonts are in the repo.

## How the game works

**Build.** You get 1,000 credits to spend on a chassis, movement (wheels, tracks, legs, hover), an engine, armor, radar, a turret, a CPU, weapons and modules. A chassis limits how many weapons and modules fit, and weight slows you down. Every part appears on the 3D model.

**Program.** Programs are made in Brick, a small block language. The program runs top to bottom on every CPU cycle, and there are no loops, so it can never hang. A better CPU runs more often and allows more blocks. Blocks cover if/else, and/or/not, comparisons, sensors, movement, radar, aiming, firing, modules, memory and math.

**Sense.** A robot knows only what falls inside its radar's range and cone. Walls and smoke block radar, and a target's position goes stale once it is out of view.

**Fight.** Up to 8 robots, free for all or in teams, across 5 arenas with lava, mud, pits, spikes, breakable crates, explosive barrels and repair pads. Robots start at random spots facing random directions, so the same matchup plays out differently each time. After two minutes, the walls close in.

## Sharing robots

- **Your robots** are saved in your browser.
- **Share links and files** carry the whole robot and work for anyone.
- **The public hangar** reads open issues on this repo whose titles start with `[BOT]`. Publishing opens a pre-filled issue, which needs a free GitHub account. Close an issue to remove that robot. Every robot is checked against the rules when it loads, so an over-budget or malformed robot never appears.

The public hangar requires Issues to be enabled on this repo. GitHub allows about 60 unauthenticated reads an hour per network; results are cached for 5 minutes.

## Code map

| Path | What it does |
| --- | --- |
| `arena/js/parts.js` | Parts catalog, budget and derived stats. Balance changes go here. |
| `arena/js/lang.js` | Brick block definitions, validation and interpreter |
| `arena/js/sim.js` | Deterministic battle simulation with no DOM |
| `arena/js/arenas.js` | Arena layouts |
| `arena/js/presets.js` | Stock robots, which also serve as example programs |
| `arena/js/blocks-ui.js` | Drag-and-drop block editor |
| `arena/js/robot-model.js` | Builds 3D robots from their parts |
| `arena/js/render.js` | Three.js arena, effects and turntable |
| `arena/js/storage.js` | Local saves, share links and the public hangar |
| `arena/js/main.js` | Screens: hangar, garage, battle, results |

## Tests

```
node tests/sim.test.mjs      # rules, every part, every arena, stock robot round robin
python3 -m http.server 8765  # then, with Playwright installed:
node tests/browser.cjs http://localhost:8765
```

## Credits

Three.js (MIT), Bungee and Barlow (SIL Open Font License). Licenses are alongside the files. All models and sounds are generated in code.
