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

