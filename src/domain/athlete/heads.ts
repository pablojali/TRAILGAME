import type { Sex } from './athlete'

/**
 * Heads (face and hairstyle together) from the owner's artwork, drawn over the body's basic head
 * (docs/AVATAR_ART_SPEC.md). Cosmetic only.
 *
 * Plain data, so the domain runs anywhere (browser, Node, a server): the names of the prepared
 * files in `assets/runner/avatar/heads`, `lvl{level}_{men|women}_head_{NN}_tone{n}.webp`, without
 * the extension. One head per sex, level and design number, offered in the skin tones it has a
 * file for. When scripts/prepare_avatar_art.py adds or removes a head file, update this list; a
 * test checks that it matches the folder. The avatar component turns a file name into its bundled
 * URL (src/components/avatar/Avatar.tsx).
 */
export const HEAD_FILES: readonly string[] = [
  'lvl1_men_head_01_tone1',
  'lvl1_men_head_01_tone2',
  'lvl1_men_head_01_tone3',
  'lvl1_men_head_01_tone4',
  'lvl1_women_head_01_tone1',
  'lvl1_women_head_01_tone2',
  'lvl1_women_head_01_tone3',
  'lvl1_women_head_02_tone1',
  'lvl1_women_head_02_tone2',
  'lvl5_women_head_01_tone3',
]

const NAME = /^lvl(\d+)_(men|women)_head_(\d{2})_tone(\d)$/

export interface HeadDefinition {
  /** Stable and saved, e.g. `head-l2-01`. */
  id: string
  sex: Sex
  /** Level the head unlocks at. */
  level: number
  /** Display name, e.g. "Hairstyle 3": numbered per sex in unlock order. */
  label: string
  /** Art file name (in HEAD_FILES) by skin tone number (1–4). */
  files: Partial<Record<number, string>>
}

/** The catalog for a list of head file names (exported for tests with other art). */
export function buildHeadCatalog(files: readonly string[]): HeadDefinition[] {
  const byId = new Map<string, HeadDefinition>()
  for (const file of files) {
    const match = NAME.exec(file)
    if (!match) continue
    const [, level, sexName, design, tone] = match
    const sex: Sex = sexName === 'men' ? 'male' : 'female'
    const id = `head-l${Number(level)}-${design}`
    const key = `${sex}/${id}`
    const head = byId.get(key) ?? { id, sex, level: Number(level), label: '', files: {} }
    head.files[Number(tone)] = file
    byId.set(key, head)
  }
  const heads = [...byId.values()].sort((a, b) => a.level - b.level || a.id.localeCompare(b.id))
  for (const sex of ['female', 'male'] as const) {
    heads.filter((h) => h.sex === sex).forEach((h, i) => (h.label = `Hairstyle ${i + 1}`))
  }
  return heads
}

/** Every head, in unlock order (level, then design). */
export const HEADS: readonly HeadDefinition[] = buildHeadCatalog(HEAD_FILES)

export function getHead(sex: Sex, id: string): HeadDefinition | undefined {
  return HEADS.find((head) => head.sex === sex && head.id === id)
}

/** The art file name of a head for a skin tone number, if the head exists in that tone. */
export function headFile(sex: Sex, id: string, tone: number): string | undefined {
  return getHead(sex, id)?.files[tone]
}
