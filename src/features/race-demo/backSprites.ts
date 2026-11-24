import { artUrl, type ArtLibrary } from './assets'
import { RUNNER_HEIGHT } from './projection'
import type { RunnerAppearance } from './types'

/**
 * The runner seen from behind, from the owner's art (docs/RACE_BACK_VIEW_DEMO.md): transparent
 * layers on one 1024 × 1536 canvas, stacked with no offsets, like the avatar of the other screens.
 * The body has a picture per frame; the shirt, the pack and the hair have one or one per frame.
 * Frames 3 and 4 that are not drawn are frames 1 and 2 mirrored.
 *
 * Each look is put together once per size into four small canvases, so a runner costs one picture
 * per frame on screen however many layers it has.
 */

export const BACK_CANVAS = {
  width: 1024,
  height: 1536,
  /** Where the feet stand: the spine's axis and the ground line. */
  footX: 512,
  footY: 1440,
  /** The runner, from the top of the head to the ground, is 1390 px tall. */
  pxPerMetre: 1390 / RUNNER_HEIGHT,
} as const

export const FRAMES = 4

/** Sizes the looks are put together at: large for a runner near the camera, small for the far ones. */
export const SPRITE_SIZES = {
  large: { width: 640, height: 960 },
  small: { width: 192, height: 288 },
} as const

export type SpriteSize = keyof typeof SPRITE_SIZES

/** The art's folders under assets/race/back-view/runner, back to front. */
const LAYER_ORDER = ['bodies', 'clothing', 'accessories', 'heads'] as const

/** One layer of a frame: the art to draw and whether to mirror it. */
export interface FrameArt {
  key: string
  mirror: boolean
}

/**
 * The art of one layer for a frame (0–3): `{base}_f{n}` if drawn; frames 3 and 4 not drawn are
 * frames 1 and 2 mirrored; a layer with no `_f` pictures is the same in every frame. Null if the
 * layer has no art.
 */
export function frameArt(base: string, frame: number, has: (key: string) => boolean): FrameArt | null {
  const own = `${base}_f${frame + 1}`
  if (has(own)) return { key: own, mirror: false }
  const twin = `${base}_f${(frame % 2) + 1}`
  if (frame >= 2 && has(twin)) return { key: twin, mirror: true }
  if (has(base)) return { key: base, mirror: false }
  return null
}

function hasAnyFrame(base: string, has: (key: string) => boolean): boolean {
  return [0, 1, 2, 3].some((frame) => frameArt(base, frame, has) !== null)
}

const hasArt = (key: string) => artUrl(key) !== undefined

/**
 * The layers of a look (art keys without the frame), or null when there is no body art at all (the
 * view then draws its coded runner). The body follows the skin tone; while a tone has no body yet,
 * another tone of the same sex stands in, then the other sex. The shirt, pack and hair are named
 * like the avatar's files (`lvl1_men_shirt_01`…) and are left out while they have no art.
 */
export function backLayers(appearance: RunnerAppearance, has: (key: string) => boolean = hasArt): string[] | null {
  const sex = appearance.sex ?? 'men'
  const tone = appearance.skin.replace('tone-', '')
  const other = sex === 'men' ? 'women' : 'men'
  const bodies = [`${sex}_body_01_tone${tone}`, ...[sex, other].flatMap((s) => ['1', '2', '3', '4'].map((t) => `${s}_body_01_tone${t}`))]
  const body = bodies.map((name) => `runner/bodies/${name}`).find((base) => hasAnyFrame(base, has))
  if (!body) return null
  const layers = [body]
  const named: Record<(typeof LAYER_ORDER)[number], string | null> = {
    bodies: null,
    clothing: appearance.shirt,
    accessories: appearance.pack,
    heads: appearance.hair,
  }
  for (const folder of LAYER_ORDER.slice(1)) {
    const name = named[folder]
    const base = name ? `runner/${folder}/${name}` : null
    if (base && hasAnyFrame(base, has)) layers.push(base)
  }
  return layers
}

/** The four frames of each look, put together once per size and kept. */
export class SpriteCache {
  private readonly looks = new Map<string, HTMLCanvasElement[]>()
  private readonly art: ArtLibrary
  private readonly has: (key: string) => boolean

  constructor(art: ArtLibrary, has: (key: string) => boolean = hasArt) {
    this.art = art
    this.has = has
  }

  /**
   * The frames of a look at a size, or null while its pictures are still loading. Call
   * `backLayers` first: a look without art never becomes ready.
   */
  frames(layers: readonly string[], size: SpriteSize): HTMLCanvasElement[] | null {
    const id = `${size}|${layers.join('|')}`
    const cached = this.looks.get(id)
    if (cached) return cached
    const plan: { image: HTMLImageElement; mirror: boolean }[][] = []
    for (let frame = 0; frame < FRAMES; frame++) {
      const parts: { image: HTMLImageElement; mirror: boolean }[] = []
      for (const base of layers) {
        const art = frameArt(base, frame, this.has)
        if (!art) continue
        const image = this.art.image(art.key)
        if (!image) return null
        parts.push({ image, mirror: art.mirror })
      }
      plan.push(parts)
    }
    if (typeof document === 'undefined') return null
    const { width, height } = SPRITE_SIZES[size]
    const frames = plan.map((parts) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.imageSmoothingQuality = 'high'
        for (const { image, mirror } of parts) {
          ctx.save()
          if (mirror) {
            ctx.translate(width, 0)
            ctx.scale(-1, 1)
          }
          ctx.drawImage(image, 0, 0, width, height)
          ctx.restore()
        }
      }
      return canvas
    })
    this.looks.set(id, frames)
    return frames
  }
}
