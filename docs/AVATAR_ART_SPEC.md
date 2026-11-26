# Avatar artwork: folders and file names (owner decisions, 30 October 2026)

**Status:** bodies, heads, shirts and shoes are in the game (see DEVELOPMENT.md, "Owner's
bodies and heads" and "Owner's shirts, shoes and men's art"). Bottoms and accessories follow the
same pattern when their art arrives.

How the owner's avatar parts are organised in the repository, so the preparation script
(`scripts/prepare_avatar_art.py`) can find them, read their unlock level and build the
Appearance options. Cosmetic only: no part gives points or race effects.

## Folders

```
assets/runner/
  bodies/        bodies, one per sex and skin tone (exists)
  heads/         complete heads: face and hairstyle together
  Clothing/      shirts (T-shirts, tank tops), one design per file
  bottoms/       shorts, tights
  accessories/   caps, sunglasses, bandanas, watches…
  footwear/      equipment, not cosmetics (see below)
```

## File names

`lvl{level}_{sex}_{part}_{number}[_tone{n}].png`, lower case, no spaces.

| Part | Example | Notes |
|---|---|---|
| Head | `lvl1_men_head_01_tone2.png` | One file per skin tone. |
| Head, eyes closed | `lvl1_men_head_01_tone2_blink.png` | Optional (21 November 2026; changed 24 November 2026): **only the closed eyes** (eyelids and the skin around them), everything else transparent, on the same canvas and in the same place as that head's eyes. It is drawn over the open face for a moment now and then, so the runner blinks on the large avatars (not while the runner is being chosen). One per skin tone. |
| Shirt | `lvl3_men_shirt_02.png` | `men` or `women`; in `Clothing/`. |
| Bottom | `lvl4_women_bottom_01.png` | |
| Accessory | `lvl10_unisex_accessory_01.png` | |

- **Level:** the level at which the part unlocks; below it the option shows locked ("Lvl N").
  Renaming a file changes its level.
- **Sex:** `men`, `women` or `unisex`, always spelled the same way.
- **Number:** two digits (01, 02…), one design per number. The same number across tones is the
  same design: `lvl1_men_head_01_tone1.png` … `lvl1_men_head_01_tone4.png`.
- **Tone:** heads only (`tone1` to `tone4` for both sexes since the women's tone 4 body of 13 November 2026, matching the
  bodies `men_body_tone{n}.png` / `women_body_tone{n}.png`). A runner with skin tone 2 is offered every head in `tone2`; a head design missing
  for that tone is not offered.

## Heads are drawn over the body's basic head

Painting hair over a bald head does not look right, so a head part is a complete head (face,
hair and ears together) drawn over the body's own head.

- **Bodies keep a basic head** (owner decision, 30 October 2026), one body per sex and tone, for
  example `men_body_tone2.png`: men and women bald (women's bodies redrawn bald on 30 October 2026). With no head part chosen, the
  runner shows that basic head ("As drawn", the default).
- **A head must fully cover the basic head**, so nothing of it shows around the new head. With
  bald bodies any haircut, short or long, covers the basic head.
- **The neck stays the body's:** each head should end where it meets the body's neck, matching its
  tone, so the join does not show.

## Canvas

- **Size:** every part uses the bodies' canvas, 1024 × 1536 px, as a PNG with a transparent
  background.
- **Position:** each part is drawn in its exact place, like the current T-shirt and starter
  shoes. A cap is drawn at head height on the full canvas, not cropped.
- **Conversion:** the script converts the parts to light WebP layers on a 640 × 960 canvas, as it
  does for the bodies.

## Not cosmetics: shoes, poles, backpack

Shoes, poles and backpacks are **equipment**: bought in the shop, with race effects, and not
unlocked by level. Shoe art can have any name in `footwear/`; the preparation script assigns each
file to a shop item (`FOOTWEAR` in `scripts/prepare_avatar_art.py`). Today (owner decision,
31 October 2026):

| File | Item |
|---|---|
| `lvl0_shoes_01.png` | Starter shoes |
| `lvl1_shoes_01.png` | Trail shoes (level 1) |
| `lvl2_shoes_01.png` | Technical trail shoes (level 2) |
| `lvl2_shoes_02.png` | Light trail shoes (level 2) |
| `lvl3_shoes_01.png` | Mountain trail shoes (level 3) |
| `lvl1_shoes_02.png` | none yet: prepared, waiting for a shop item |

Poles and backpacks come from `accesories/` (backpacks per body: `lvl{L}_{men|women}_back_{NN}.png`).

## Drawing order (back to front)

poles → body → head → bottoms → footwear → shirt → backpack → accessories.

## New art from Trail Studio (13 November 2026)

The owner uploads new bodies, heads and (since 24 November 2026) shirts in Trail Studio › Avatares; they wait in
`assets/runner/incoming/` until Claude prepares the batch: moves them to `assets/runner/bodies`,
`heads` or `Clothing` with the names above (shirts also go into `src/domain/athlete/shirtFiles.ts` with their name), runs `scripts/prepare_avatar_art.py` (which also rewrites the head list,
`src/domain/athlete/headFiles.ts`) and adds new body tones to `SKIN_TONES`
(`src/domain/athlete/appearance.ts`).

**One model per level (owner decision, 26 November 2026):** heads and shirts can be named without
a design number, `lvl1_men_head_tone2.png` and `lvl3_men_shirt.png`. The game reads them as design 01,
so their ids (`head-l1-01`, `shirt-l3-01`) and saved looks are the same as with `_01`.

**Deleting a head (24 November 2026):**
- **Where:** Trail Studio › Avatares › Heads, list "En el juego". It shows every head picture, one
  card per tone and closed-eyes face, each with its own **Borrar** button. A tone takes its closed eyes
  with it.
- **What the proposal does:** it deletes the original files in `assets/runner/heads`. A head with no
  tone left leaves the game; one with some tones stays in those.
- **What CI does next:**
  - `prepare_avatar_art.py` drops the prepared art and rewrites `headFiles.ts`, so the head leaves
    the game, the server included.
  - On `main`, CI commits those changes.
- **Players who wore it:** their saved head becomes the basic head.
- **Names:** the remaining hairstyles are numbered again in unlock order.

**Deleting a shirt (25 November 2026):**
- **Where:** Trail Studio › Avatares › Shirts, list "En el juego". Each shirt has a **Borrar** button.
- **What the proposal does:** it deletes the original in `assets/runner/Clothing`.
- **What CI does next:** `prepare_avatar_art.py` drops the prepared art and removes the shirt from
  `src/domain/athlete/shirtFiles.ts`. The other shirts keep their names, and a new shirt is added as
  "New shirt" until Claude names it.
- **Players who wore it:** they have no shirt, which is the game's normal starting look.

First batch: the women's tone 4 body, and men's heads at levels 2, 3, 5 and 8 in all four tones.


Second batch (same day): women's heads at levels 2 (tones 1 and 3), 3 and 5 (tones 1–4) and 8 (tone 3),
the women's level 1 head in tone 4, and new art replacing the women's tone 1 body, the level 1 head in
tones 1 and 2 and the level 5 head in tone 3. The ids stay the same, so careers keep their choice; the
labels ("Hairstyle N") are renumbered in unlock order.

Renamed (owner, 14 November 2026): the women's level 1 head 02 became the level 8 head in tone 1
(`lvl1_women_head_02_tone1` → `lvl8_women_head_01_tone1`) and the level 2 head in tone 2
(`lvl1_women_head_02_tone2` → `lvl2_women_head_01_tone2`). No career had chosen `head-l1-02`. A save
with it loads with the basic head.
