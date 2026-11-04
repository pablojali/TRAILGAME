# Shop pictures (owner art)

One picture per equipment item, shown on its shop and equipment cards (owner request, 4 November 2026).

- **Size:** 512 × 512 px, square. **Format:** PNG with a transparent background, ideally under 300 KB.
- **Framing:** the item centred with a 5–10 % margin on each side, no shadow or background (the card has its own).
- **Name:** `thumb_` + the name of the item's art, e.g. `thumb_lvl2_back_01.png`.

Then put the file name in the `thumbnail` column of `src/data/equipment.csv` (after uploading: the
checks fail if the table names a file that does not exist). A picture here is used before the one cut
from the avatar art in `assets/ui/equipment`.
