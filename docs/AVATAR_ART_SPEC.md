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

The owner uploads new bodies and heads in Trail Studio › Avatares; they wait in
`assets/runner/incoming/` until Claude prepares the batch: moves them to `assets/runner/bodies` or
`heads` with the names above, runs `scripts/prepare_avatar_art.py`, adds the heads to `HEAD_FILES`
(`src/domain/athlete/heads.ts`) and new body tones to `SKIN_TONES`
(`src/domain/athlete/appearance.ts`).

First batch: the women's tone 4 body, and men's heads at levels 2, 3, 5 and 8 in all four tones.


Second batch (same day): women's heads at levels 2 (tones 1 and 3), 3 and 5 (tones 1–4) and 8 (tone 3),
the women's level 1 head in tone 4, and new art replacing the women's tone 1 body, the level 1 head in
tones 1 and 2 and the level 5 head in tone 3. The ids stay the same, so careers keep their choice; the
labels ("Hairstyle N") are renumbered in unlock order.
