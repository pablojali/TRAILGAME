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
- **Runner size:** how much of the screen's height the player takes (60% by default, the owner's
  choice of 24 November 2026), from the top of the head to the
  bottom edge, which cuts the legs at mid-thigh (owner, 24 November 2026: like the reference GIF, but
  smaller). The camera moves to match.
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
| `projection.ts` | The pseudo-3D camera. scale = FOCAL / z; a rival's z = player's z − gap; things fade in from the horizon and out near the lens; the trail's slow bends. The camera's height and the player's depth follow from the framing (where the head sits and where the bottom edge cuts the legs). |
| `world.ts` | The scenery as a fixed pool (pines, bushes, rocks, grass, pebbles). Pieces that pass the camera go back to the horizon; none are created or destroyed per frame. Rivals ease their gap and fade in and out. |
| `runnerRig.ts` | **Animation only:** a pose from a stride phase that follows the speed: which drawn frame to show (one per quarter stride), the bounce and the hip sway. |
| `backSprites.ts` | The runner's art: finds each layer's pictures per frame (mirroring frames 1 and 2 for 3 and 4), and puts each look together once per size, so a runner costs one picture per frame. |
| `drawRunner.ts` | **Drawing only:** draws a runner from behind from a pose: the art's frame moved by the bounce and sway, or coded shapes while there is no body art. |
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

Owner decisions of 24 November 2026: **drawn frames stacked in layers**, like the avatar of the other
screens, instead of coded body parts.

- **Canvas:** every layer is a transparent picture on one **1024 × 1536** canvas, drawn in its place,
  stacked with no offsets. The spine's axis is at x = 512 and the feet stand on y = 1440; the runner
  is 1390 px tall from the top of the head to the ground (1.75 m in the view).
- **Frames:** the owner draws the first half of a stride, the game mirrors it for the second half:
  - 2 drawn frames (`_f1`, `_f2`): 1 left fist high, legs apart (the left foot pushing off behind);
    2 fists at the waist, the left heel up. 4 frames in all.
  - 3 drawn frames (`_f1` to `_f3`): the same with an in-between frame in the middle, for a smoother
    stride (owner, 24 November 2026: 4 frames look mechanical). 6 frames in all.
  - 4 or more drawn frames are the whole stride, with no mirroring.

  The frames share the stride evenly. The trunk, head and shorts are the same in every frame: only
  the arms and legs change. The code adds the bounce and the sway by moving the whole picture.
- **Layers, back to front:** body → shirt → pack → hair. A layer with `_f1`, `_f2`… has a picture per
  frame, as many as the body; without them one picture serves every frame (a tank top, a
  pack, the hair) and is not mirrored.
- **Feet:** the runners are barefoot and there are no shoe layers: the player's feet are below the
  screen's edge and the rivals' are a few pixels.

| Key | What | Per frame |
|---|---|---|
| `runner/bodies/{men\|women}_body_01_tone{n}_f{1,2}` | Bald, shirtless body with shorts | Yes |
| `runner/clothing/{shirt file}` | A shirt, named like the avatar's (`lvl1_men_shirt_01`) | Sleeves: `_f1`, `_f2`. Tank top: one |
| `runner/accessories/{pack file}` | A pack, named like the avatar's (`lvl1_men_back_01`) | No |
| `runner/heads/{head file}` | The hair seen from behind, named like the avatar's head in that tone (`lvl1_men_head_01_tone2`) | No |

While a skin tone has no body, another tone (then the other sex) stands in. A shirt, pack or hair
with no art is left out. With no body art at all, the coded runner is drawn.

**In the game now:** `runner/bodies/men_body_01_tone2_f1` and `_f2` (owner art of 24 November 2026,
background removed and placed on the canvas by Claude). The demo's player and rivals all use it, bald
and shirtless, until hair and shirts arrive.

**Appearance ids:** the demo's rivals still carry placeholder ids (`red`, `short-dark`…) with no
art. When this view is connected to the game, the appearance will use the avatar's ids (sex, skin,
head, shirt and pack).
