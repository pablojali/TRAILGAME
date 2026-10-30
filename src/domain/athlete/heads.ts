import type { Sex } from './athlete'

/**
 * Heads (face and hairstyle together) from the owner's artwork, drawn over the body's basic head
 * (docs/AVATAR_ART_SPEC.md). The catalog comes from the prepared file names,
 * `lvl{level}_{men|women}_head_{NN}_tone{n}.webp`: one head per sex, level and design number,
 * offered in the skin tones it has a file for. Cosmetic only.
 */
const FILES = import.meta.glob<string>('/assets/runner/avatar/heads/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
})

const NAME = /\/lvl(\d+)_(men|women)_head_(\d{2})_tone(\d)\.webp$/

export interface HeadDefinition {
  /** Stable and saved, e.g. `head-l2-01`. */
  id: string
  sex: Sex
  /** Level the head unlocks at. */
  level: number
  /** Display name, e.g. "Hairstyle 3": numbered per sex in unlock order. */
  label: string
  /** Art URL by skin tone number (1–4). */
  art: Partial<Record<number, string>>
}

function buildCatalog(): HeadDefinition[] {
  const byId = new Map<string, HeadDefinition>()
  for (const [path, url] of Object.entries(FILES)) {
    const match = NAME.exec(path)
    if (!match) continue
    const [, level, sexName, design, tone] = match
    const sex: Sex = sexName === 'men' ? 'male' : 'female'
    const id = `head-l${Number(level)}-${design}`
    const key = `${sex}/${id}`
    const head = byId.get(key) ?? { id, sex, level: Number(level), label: '', art: {} }
    head.art[Number(tone)] = url
    byId.set(key, head)
  }
  const heads = [...byId.values()].sort((a, b) => a.level - b.level || a.id.localeCompare(b.id))
  for (const sex of ['female', 'male'] as const) {
    heads.filter((h) => h.sex === sex).forEach((h, i) => (h.label = `Hairstyle ${i + 1}`))
  }
  return heads
}

/** Every head, in unlock order (level, then design). */
export const HEADS: readonly HeadDefinition[] = buildCatalog()

export function getHead(sex: Sex, id: string): HeadDefinition | undefined {
  return HEADS.find((head) => head.sex === sex && head.id === id)
}

/** The art of a head for a skin tone number, if the head exists in that tone. */
export function headArt(sex: Sex, id: string, tone: number): string | undefined {
  return getHead(sex, id)?.art[tone]
}
