# Avatar artwork: folders and file names (owner decisions, 30 October 2026)

**Status:** bodies and heads are in the game (see DEVELOPMENT.md, "Owner's bodies and heads").
Tops, bottoms and accessories follow the same pattern when their art arrives.

How the owner's avatar parts are organised in the repository, so the preparation script
(`scripts/prepare_avatar_art.py`) can find them, read their unlock level and build the
Appearance options. Cosmetic only: no part gives points or race effects.

## Folders

```
assets/runner/
  bodies/        bodies, one per sex and skin tone (exists)
  heads/         complete heads: face and hairstyle together
  tops/          T-shirts, vests, jackets
  bottoms/       shorts, tights
  accessories/   caps, sunglasses, bandanas, watches…
  footwear/      equipment, not cosmetics (see below)
```

## File names

`lvl{level}_{sex}_{part}_{number}[_tone{n}].png`, lower case, no spaces.

| Part | Example | Notes |
|---|---|---|
| Head | `lvl1_men_head_01_tone2.png` | One file per skin tone. |
| Top | `lvl3_unisex_top_02.png` | `men` or `women` when the cut differs. |
| Bottom | `lvl4_women_bottom_01.png` | |
| Accessory | `lvl10_unisex_accessory_01.png` | |

- **Level:** the level at which the part unlocks; below it the option shows locked ("Lvl N").
  Renaming a file changes its level.
- **Sex:** `men`, `women` or `unisex`, always spelled the same way.
- **Number:** two digits (01, 02…), one design per number. The same number across tones is the
  same design: `lvl1_men_head_01_tone1.png` … `lvl1_men_head_01_tone4.png`.
- **Tone:** heads only (`tone1` to `tone3` for women, `tone1` to `tone4` for men, matching the
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
unlocked by level. Their art is named by the item id, for example `trail-shoes.png`,
`trail-shoes-light.png`, `trail-shoes-basic.png`, `poles.png`, `poles-2.png`,
`hydration-backpack.png` and `hydration-backpack-2.png`. It replaces the current placeholders:
the recoloured starter shoes, the vector poles and the vector vest.

## Drawing order (back to front)

poles → body → head → bottoms → footwear → tops → backpack → accessories.
