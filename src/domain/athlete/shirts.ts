import type { Sex } from './athlete'

import { SHIRT_FILES } from './shirtFiles'

export { SHIRT_FILES }

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
