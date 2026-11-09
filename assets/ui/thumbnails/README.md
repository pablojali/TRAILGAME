# Shop pictures (owner art)

One picture per equipment item, shown on its shop and equipment cards (owner request, 4 November 2026).

- **Size:** 512 × 512 px, square. **Format:** PNG with a transparent background, ideally under 300 KB.
- **Framing:** the item centred with a 5–10 % margin on each side, no shadow or background (the card has its own).
- **Name:** `thumb_` + the name of the item's art, e.g. `thumb_lvl2_back_01.png`. For a picture per body:
  `thumb_lvl1_men_back_01.png` and `thumb_lvl1_women_back_01.png`, named `thumb_lvl1_{sex}_back_01.png` in the table.

Then put the file name in the `thumbnail` column of `src/data/equipment.csv` (after uploading: the
checks fail if the table names a file that does not exist). A picture here is used before the one cut
from the avatar art in `assets/ui/equipment`.

The game shows each picture cropped to the item (`scripts/prepare_shop_art.py`, run by CI, writes
`assets/ui/shop/`), so the margin in the file does not make the item small on the cards.
