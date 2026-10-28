import type { ProfileId, Sex } from '../../domain/athlete/athlete'

/**
 * Final creation illustrations, one per sex × profile, at
 * `assets/runner/creation/{sex}/{profile}.webp` (or `.png`). Missing files fall back to placeholders,
 * so artwork can be added later without code changes.
 */
const CREATION_ART = import.meta.glob<string>('/assets/runner/creation/*/*.{webp,png}', {
  eager: true,
  query: '?url',
  import: 'default',
})

export function getCreationArtUrl(profile: ProfileId, sex: Sex): string | null {
  for (const ext of ['webp', 'png']) {
    const url = CREATION_ART[`/assets/runner/creation/${sex}/${profile}.${ext}`]
    if (url) return url
  }
  return null
}
