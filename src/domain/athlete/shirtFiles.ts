/**
 * Shirts from the owner's artwork, drawn over the body (docs/AVATAR_ART_SPEC.md). Cosmetic only.
 *
 * Plain data, like the head catalog: the names of the prepared files in
 * `assets/runner/avatar/clothing`, `lvl{level}_{men|women}_shirt_{NN}.webp`, without the extension,
 * with a display name. The file name gives the sex, the unlock level and the design number. When
 * scripts/prepare_avatar_art.py adds or removes a shirt, update this list; a test checks that it
 * matches the folder. Game tests use a fixed copy (src/test/fixtures/shirtFiles.ts), so adding a
 * shirt never breaks them.
 */
export const SHIRT_FILES: readonly { file: string; label: string }[] = [
  { file: 'lvl1_men_shirt_01', label: 'Charcoal T-shirt' },
  { file: 'lvl2_men_shirt_01', label: 'Navy T-shirt' },
  { file: 'lvl3_men_shirt_01', label: 'Burgundy T-shirt' },
  { file: 'lvl3_men_shirt_02', label: 'Green T-shirt' },
  { file: 'lvl2_men_shirt_02', label: 'Brick red T-shirt' },
  { file: 'lvl3_men_shirt_03', label: 'Steel blue T-shirt' },
  { file: 'lvl1_women_shirt_01', label: 'Blue tank top' },
  { file: 'lvl2_women_shirt_01', label: 'Coral tank top' },
  { file: 'lvl3_women_shirt_01', label: 'Green tank top' },
  { file: 'lvl1_women_shirt_02', label: 'Cream tank top' },
  { file: 'lvl2_women_shirt_02', label: 'Teal and grey tank top' },
  { file: 'lvl3_women_shirt_03', label: 'Pink and white tank top' },
]
