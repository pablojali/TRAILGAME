# Race seen from behind: demo (24 November 2026)

A prototype of the race screen seen from behind the runner, from the owner's brief: the trail runs
to the horizon, trees and rocks grow and slide to the sides as they come near, the mountains stay
almost still, and rivals can be added and removed at any time. It is a separate screen and does not
touch the game's races.

## How to run it

- In the game: open **`/race-demo`** (for example `http://localhost:5173/race-demo` with
  `npm run dev`, or the same path on a preview deploy).
- On a phone on the same network: `npm run dev:lan`, then open the address it prints, followed by
  `/race-demo`.

**Debug panel (top left):**
- **Speed:** the player's speed in m/s; 0 stops the runner.
- **+ rival / − rival:** adds a rival (far ahead, or now and then coming from behind) or removes the
  selected one. Both fade in or out; nothing pops.
- **Rival + Gap:** holds the selected rival at a gap. Negative means ahead, positive means behind.
  **Let it run** releases it.
- **fps:** frames per second, measured by the view.
- **Hide:** folds the panel away.

## How it is built

Everything is in `src/features/race-demo/`. It uses plain 2D canvas, with no new library.

| File | What it does |
|---|---|
| `types.ts` | The state the view draws: `{ speed, runners: [{ id, gapMetros, appearance }], player: { appearance } }`. |
| `projection.ts` | The pseudo-3D camera. scale = FOCAL / z; a rival's z = player's z − gap; things fade in from the horizon and out near the lens; the trail's slow bends. |
| `world.ts` | The scenery as a fixed pool (pines, bushes, rocks, grass, pebbles). Pieces that pass the camera go back to the horizon; none are created or destroyed per frame. Rivals ease their gap and fade in and out. |
| `runnerRig.ts` | **Animation only:** a pose (bounce, hip sway, shoulder roll, arm swing, heel kick) from a stride phase that follows the speed. A bone rig (DragonBones or other) can replace this file without touching the drawing. |
| `drawRunner.ts` | **Drawing only:** draws a runner from behind from a pose, part by part, using art when it exists and coded shapes otherwise. |
| `raceView.ts` | The engine: the frame loop and the layers. Sky and mountains, then the far forest, then the ground and trail, then scenery, rivals and player sorted by depth, then the light. |
| `RaceView.tsx` | The React component. It reads its state from a `source()` function once per frame, so React does not render each frame. |
| `simulation.ts` | The made-up race for the demo. The real race simulation replaces it by giving `RaceView` the same state. |
| `RaceDemoScreen.tsx` | The `/race-demo` screen and its debug panel. |

**Performance:**
- The scenery is about 100 pieces from one pool, and the sort reuses one list.
- The sky, mountains and far forest are drawn once per screen size.
- The canvas is drawn at no more than 1.5× pixel density (`maxPixelRatio`).
- Results:
  - **Desktop browser:** 60 fps with 10 rivals.
  - **Headless test browser** (no GPU, CPU slowed 4×): 17–25 fps. The canvas calls themselves take
    about 0.3 ms per frame; the time goes into painting the pixels in software.
  - **Real phone:** not tested yet, mid-range Android included. Open `/race-demo` and watch the fps
    counter.

## Where the final art goes

Drop files into **`assets/race/back-view/`**, as `.webp` or `.png`, with the names below. A file
that exists replaces its placeholder with no code change. One that does not exist keeps the coded
drawing.

### Scene

**`decor/<kind>-<n>`:** scenery pieces, standing on the bottom centre of the picture.
- `<kind>` is `pine`, `rock`, `bush` or `grass`.
- `<n>` is the variant: 0, 1 or 2.
- Height comes from the pool's sizes; width comes from the picture's proportions.
- Pebbles on the trail stay coded.

**Not yet wired:**
- The sky, mountains and far forest are coded drawings (`assets.ts`: `makeBackdrop`,
  `makeForestBand`).
- They can take art in the same way (`scene/sky`, `scene/mountains`, `scene/forest`) when there is
  some to try.

### Runner, seen from behind

Each part is a separate picture, so the code can move it. Sizes and pivots are in metres in
`PART_BOXES` (`drawRunner.ts`). Every part is drawn into its box around its pivot.

| Key | Part | ids from the appearance |
|---|---|---|
| `runner/torso-<shirt>` | Back of the shirt (rigid, rolls with the shoulders) | shirt |
| `runner/shorts-<shorts>` | Shorts | shorts |
| `runner/head-<skin>` | Head and neck from behind | skin (`tone-1`…`tone-4`) |
| `runner/hair-<hair>` | Hair over the head | hair |
| `runner/pack-<pack>` | Pack or running vest | pack |
| `runner/arm-<skin>` | Right arm, hanging from the shoulder (the left is mirrored) | skin |
| `runner/leg-<skin>` | Right leg, hanging from the hip (the left is mirrored) | skin |
| `runner/leg-shoe-<shoes>` | Right shoe, on the leg's canvas | shoes |

The race number is drawn by the code over the back.

**Appearance ids:**
- The demo's ids are in `simulation.ts`: `red`, `blue`, `short-dark`, `ponytail-red`, `vest-black` and
  so on.
- When this view is connected to the game, the appearance will use the avatar's ids instead (skin,
  hair, shirt, shoes and equipment).
