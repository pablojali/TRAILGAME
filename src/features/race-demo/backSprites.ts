import { artUrl, type ArtLibrary } from './assets'
import { RUNNER_HEIGHT } from './projection'
import type { RunnerAppearance } from './types'

/**
 * The runner seen from behind, from the owner's art (docs/RACE_BACK_VIEW_DEMO.md): transparent
 * layers on one 1024 × 1536 canvas, stacked with no offsets, like the avatar of the other screens.
 * The body has a picture per frame; the shirt, the pack and the hair have one or one per frame.
 * The owner draws the first half of the stride (2 or 3 frames: `_f1`…) and the game mirrors it for
 * the second half; with 4 or more drawn frames, they are the whole stride.
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

/** Frames drawn up to this many are half a stride, mirrored for the other half. */
export const MAX_HALF = 3

/** How many frames a layer has drawn: `_f1`, `_f2`… in a row. */
export function drawnFrames(base: string, has: (key: string) => boolean): number {
  let n = 0
  while (has(`${base}_f${n + 1}`)) n++
  return n
}

/** The frames in a stride for a body with this many drawn: half a stride is mirrored, a whole one is not. */
export function strideFrames(drawn: number): number {
  if (drawn === 0) return 1
  return drawn <= MAX_HALF ? drawn * 2 : drawn
}

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
 * The art of one layer for a frame (0 to count-1) of a stride of `count` frames: `{base}_f{n}` if
 * drawn; in the second half of a mirrored stride, the same frame of the first half mirrored; a layer
 * with no `_f` pictures is the same in every frame. Null if the layer has no art.
 */
export function frameArt(base: string, frame: number, count: number, has: (key: string) => boolean): FrameArt | null {
  const own = `${base}_f${frame + 1}`
  if (has(own)) return { key: own, mirror: false }
  const half = count / 2
  if (count % 2 === 0 && half <= MAX_HALF && frame >= half) {
    const twin = `${base}_f${frame - half + 1}`
    if (has(twin)) return { key: twin, mirror: true }
  }
  if (has(base)) return { key: base, mirror: false }
  return null
}

function hasArt(base: string, has: (key: string) => boolean): boolean {
  return has(base) || has(`${base}_f1`)
}

const bundled = (key: string) => artUrl(key) !== undefined

/**
 * The layers of a look (art keys without the frame), or null when there is no body art at all (the
 * view then draws its coded runner). The body follows the skin tone; while a tone has no body yet,
 * another tone of the same sex stands in, then the other sex. The shirt, pack and hair are named
 * by level, like the avatar's files (`lvl3_men_shirt`…), and are left out while they have no art.
 */
export function backLayers(appearance: RunnerAppearance, has: (key: string) => boolean = bundled): string[] | null {
  const sex = appearance.sex ?? 'men'
  const tone = appearance.skin.replace('tone-', '')
  const other = sex === 'men' ? 'women' : 'men'
  const bodies = [`${sex}_body_tone${tone}`, ...[sex, other].flatMap((s) => ['1', '2', '3', '4'].map((t) => `${s}_body_tone${t}`))]
  const body = bodies.map((name) => `runner/bodies/${name}`).find((base) => hasArt(base, has))
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
    if (base && hasArt(base, has)) layers.push(base)
  }
  return layers
}

/**
 * The first row (from the top) of a picture's central columns with an opaque pixel: the top of the
 * runner's head. `data` is RGBA pixels, `width` × `height`. -1 when the columns are empty.
 */
export function topRow(data: ArrayLike<number>, width: number, height: number): number {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3]! > 128) return y
  }
  return -1
}

/** The band searched for the top of the head: the central tenth of the canvas, its top 40%. */
const HEAD_BAND = { x: 0.45, width: 0.1, height: 0.4 }

/** A part of a frame: the picture and whether it is mirrored. */
interface Part {
  image: HTMLImageElement
  mirror: boolean
  /** The layer is the hair, which follows the head of the body in that frame. */
  hair: boolean
}

/** The frames of each look, put together once per size and kept. */
export class SpriteCache {
  private readonly looks = new Map<string, HTMLCanvasElement[]>()
  /** The top of the head of each body picture, in its own pixels, by art key. */
  private readonly headTops = new Map<string, number>()
  private readonly art: ArtLibrary
  private readonly has: (key: string) => boolean

  constructor(art: ArtLibrary, has: (key: string) => boolean = bundled) {
    this.art = art
    this.has = has
  }

  /**
   * The frames of a look at a size (as many as the body's stride has), or null while its pictures
   * are still loading. Call `backLayers` first: a look without art never becomes ready.
   *
   * The hair is one picture for every frame, drawn on the body's first frame; in each frame it
   * moves down as much as the body's head does (owner, 26 November 2026: the head bobs with the
   * shoulders, so a still hair looked as if it lagged).
   */
  frames(layers: readonly string[], size: SpriteSize): HTMLCanvasElement[] | null {
    const id = `${size}|${layers.join('|')}`
    const cached = this.looks.get(id)
    if (cached) return cached
    const body = layers[0]!
    const plan: { parts: Part[]; bodyKey: string; bodyImage: HTMLImageElement | null }[] = []
    const count = strideFrames(drawnFrames(body, this.has))
    for (let frame = 0; frame < count; frame++) {
      const parts: Part[] = []
      let bodyKey = ''
      let bodyImage: HTMLImageElement | null = null
      for (const base of layers) {
        const art = frameArt(base, frame, count, this.has)
        if (!art) continue
        const image = this.art.image(art.key)
        if (!image) return null
        if (base === body) {
          bodyKey = art.key
          bodyImage = image
        }
        parts.push({ image, mirror: art.mirror, hair: base.startsWith('runner/heads/') })
      }
      plan.push({ parts, bodyKey, bodyImage })
    }
    if (typeof document === 'undefined') return null
    const { width, height } = SPRITE_SIZES[size]
    const firstTop = plan[0]?.bodyImage ? this.headTop(plan[0].bodyKey, plan[0].bodyImage) : -1
    const frames = plan.map(({ parts, bodyKey, bodyImage }) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.imageSmoothingQuality = 'high'
        const top = bodyImage ? this.headTop(bodyKey, bodyImage) : -1
        const drop = firstTop >= 0 && top >= 0 && bodyImage ? ((top - firstTop) * height) / bodyImage.naturalHeight : 0
        for (const { image, mirror, hair } of parts) {
          ctx.save()
          if (mirror) {
            ctx.translate(width, 0)
            ctx.scale(-1, 1)
          }
          ctx.drawImage(image, 0, hair ? drop : 0, width, height)
          ctx.restore()
        }
      }
      return canvas
    })
    this.looks.set(id, frames)
    return frames
  }

  /** The top of the head in a body picture (its own pixels), read once from the picture. */
  private headTop(key: string, image: HTMLImageElement): number {
    const known = this.headTops.get(key)
    if (known !== undefined) return known
    let top = -1
    const w = Math.max(1, Math.round(image.naturalWidth * HEAD_BAND.width))
    const h = Math.max(1, Math.round(image.naturalHeight * HEAD_BAND.height))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx) {
      try {
        ctx.drawImage(image, Math.round(image.naturalWidth * HEAD_BAND.x), 0, w, h, 0, 0, w, h)
        top = topRow(ctx.getImageData(0, 0, w, h).data, w, h)
      } catch {
        top = -1
      }
    }
    this.headTops.set(key, top)
    return top
  }
}
