import type { Sex } from '../../domain/athlete/athlete'
import { headFile } from '../../domain/athlete/heads'

/**
 * The owner's layered artwork, prepared by scripts/prepare_avatar_art.py. Every layer shares one
 * 640 × 960 canvas, so layers line up when stacked:
 * `bodies/{sex}-{tone}`, `heads/{file}`, `clothing/{outfit}` and `footwear/{item}`.
 */
const ART = import.meta.glob<string>('/assets/runner/avatar/**/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
})

/** The bundled URL of a layer, e.g. `bodies/female-2`, or undefined if there is no such art. */
export function art(path: string): string | undefined {
  return ART[`/assets/runner/avatar/${path}.webp`]
}

/** The bundled art of a head (named by the domain's head catalog) in a skin tone. */
export function headArt(sex: Sex, hair: string, tone: number): string | undefined {
  const file = headFile(sex, hair, tone)
  return file === undefined ? undefined : art(`heads/${file}`)
}

/**
 * The files an equipment table entry names for a runner (owner request, 5 November 2026: backpacks
 * drawn for men and for women): `{sex}` stands for `men` or `women`, and the men file is the
 * fallback while there is no women one. A name without `{sex}` is the same for everyone.
 */
export function filesForSex(file: string, sex: Sex): string[] {
  if (!file.includes('{sex}')) return [file]
  const own = file.replaceAll('{sex}', sex === 'female' ? 'women' : 'men')
  const men = file.replaceAll('{sex}', 'men')
  return own === men ? [men] : [own, men]
}

/** The bundled URL of a file in assets/runner/avatar named by the equipment table, e.g. `footwear/trail-shoes.webp`. */
export function avatarFile(file: string, sex: Sex = 'male'): string | undefined {
  for (const candidate of filesForSex(file, sex)) {
    const url = ART[`/assets/runner/avatar/${candidate}`]
    if (url) return url
  }
  return undefined
}
