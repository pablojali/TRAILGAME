/** Where new avatar art waits until Claude prepares it for the game (CI does not read it). */
export const INCOMING = 'assets/runner/incoming'

export const AVATAR_KINDS = [
  { id: 'bodies', title: 'Bodies', live: 'assets/runner/bodies', hint: 'The whole body, on the runner\'s transparent 1024 × 1536 canvas.' },
  { id: 'heads', title: 'Heads', live: 'assets/runner/heads', hint: 'The head (face and hair), on the same canvas, in its place over the body.' },
] as const

/** Biggest PNG accepted (GitHub takes it in one proposal). */
export const MAX_BYTES = 15 * 1024 * 1024

/** A file name the repository accepts: lower case, letters, digits, `-` and `_`, `.png`. */
export function incomingName(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${base || 'imagen'}.png`
}


/** One head design in the game (all its skin tones and closed-eyes faces), as Trail Studio lists it. */
export interface HeadGroup {
  /** The design, e.g. `lvl2_women_head_01`. */
  key: string
  sex: 'men' | 'women'
  level: number
  design: string
  /** The art files of this head (originals in assets/runner/heads). */
  files: { name: string; path: string; url: string }[]
}

const HEAD_ART = /^(lvl(\d+)_(men|women)_head_(\d{2}))_tone\d(?:_blink)?\.png$/

/**
 * The heads in the game, one per design, in unlock order (owner request, 24 November 2026: delete
 * heads in Trail Studio). Deleting a group deletes all its files; CI then prepares the art again and
 * rewrites the game's head list (scripts/prepare_avatar_art.py), so the head leaves the game.
 */
export function headGroups(files: readonly { name: string; path: string; url: string }[]): HeadGroup[] {
  const groups = new Map<string, HeadGroup>()
  for (const file of files) {
    const match = HEAD_ART.exec(file.name)
    if (!match) continue
    const [, key, level, sex, design] = match
    const group = groups.get(key!) ?? { key: key!, sex: sex as 'men' | 'women', level: Number(level), design: design!, files: [] }
    group.files.push(file)
    groups.set(key!, group)
  }
  return [...groups.values()].sort((a, b) => a.sex.localeCompare(b.sex) || a.level - b.level || a.design.localeCompare(b.design))
}
