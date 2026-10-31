import type { Sex } from './athlete'

/**
 * Shirts from the owner's artwork, drawn over the body (docs/AVATAR_ART_SPEC.md). Cosmetic only.
 *
 * Plain data, like the head catalog: the names of the prepared files in
 * `assets/runner/avatar/clothing`, `lvl{level}_{men|women}_shirt_{NN}.webp`, without the extension,
 * with a display name. The file name gives the sex, the unlock level and the design number. When
 * scripts/prepare_avatar_art.py adds or removes a shirt, update this list; a test checks that it
 * matches the folder.
 */
export const SHIRT_FILES: readonly { file: string; label: string }[] = [
  { file: 'lvl1_men_shirt_01', label: 'Charcoal T-shirt' },
  { file: 'lvl2_men_shirt_01', label: 'Navy T-shirt' },
  { file: 'lvl3_men_shirt_01', label: 'Burgundy T-shirt' },
  { file: 'lvl3_men_shirt_02', label: 'Green T-shirt' },
  { file: 'lvl1_women_shirt_01', label: 'Blue tank top' },
  { file: 'lvl2_women_shirt_01', label: 'Coral tank top' },
  { file: 'lvl3_women_shirt_01', label: 'Green tank top' },
]

const NAME = /^lvl(\d+)_(men|women)_shirt_(\d{2})$/

export interface ShirtDefinition {
  /** Stable and saved in `appearance.outfit`, e.g. `shirt-l2-01`. */
  id: string
  sex: Sex
  /** Level the shirt unlocks at. */
  level: number
  label: string
  /** Art file name (in SHIRT_FILES). */
  file: string
}

/** The catalog for a list of shirt files (exported for tests with other art). */
export function buildShirtCatalog(files: readonly { file: string; label: string }[]): ShirtDefinition[] {
  const shirts: ShirtDefinition[] = []
  for (const { file, label } of files) {
    const match = NAME.exec(file)
    if (!match) continue
    const [, level, sexName, design] = match
    shirts.push({
      id: `shirt-l${Number(level)}-${design}`,
      sex: sexName === 'men' ? 'male' : 'female',
      level: Number(level),
      label,
      file,
    })
  }
  return shirts.sort((a, b) => a.level - b.level || a.id.localeCompare(b.id))
}

/** Every shirt, in unlock order (level, then design). */
export const SHIRTS: readonly ShirtDefinition[] = buildShirtCatalog(SHIRT_FILES)

export function getShirt(sex: Sex, id: string): ShirtDefinition | undefined {
  return SHIRTS.find((shirt) => shirt.sex === sex && shirt.id === id)
}
