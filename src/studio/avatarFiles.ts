/** Where new avatar art waits until Claude prepares it for the game (CI does not read it). */
export const INCOMING = 'assets/runner/incoming'

export const AVATAR_KINDS = [
  { id: 'bodies', title: 'Cuerpos', live: 'assets/runner/bodies', hint: 'El cuerpo entero, sobre el lienzo transparente de 1024 × 1536 del corredor.' },
  { id: 'heads', title: 'Caras', live: 'assets/runner/heads', hint: 'La cabeza (cara y pelo), sobre el mismo lienzo, en su sitio sobre el cuerpo.' },
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

