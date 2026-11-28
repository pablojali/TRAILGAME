import { artIn, type ArtLibrary } from './assets'
import type { DecorKind } from './world'

/**
 * The owner's decor art (pines, bushes, rocks: `decor/{kind}-{n}`), ready to draw by the hundred
 * each frame. Each picture is cut to its opaque part, so its foot stands on the ground and its height
 * is the decor's height whatever empty margin the file has, and shrunk once to a size the screen
 * can show, so a 2752 px wide bush costs no more than a small one.
 */

/** Pixels more opaque than this count as the picture (the soft fringe of a cut-out does not). */
const OPAQUE = 20

/** The tallest a decor picture is kept at: enough for a pine near the camera on a large screen. */
export const DECOR_MAX_HEIGHT = 640

/** The box of a picture's opaque pixels; `data` is RGBA, `width` × `height`. Null when it is empty. */
export function opaqueBounds(data: ArrayLike<number>, width: number, height: number): { x: number; y: number; width: number; height: number } | null {
  let left = width
  let right = -1
  let top = height
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > OPAQUE) {
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        bottom = y
      }
    }
  }
  if (right < 0) return null
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

/**
 * The art key drawn for a decor item: its own variant if the owner drew it, else one of the drawn
 * variants of its kind (so a single pine fills the whole forest), else null (the coded placeholder).
 */
export function decorKey(kind: DecorKind, variant: number, keys: (prefix: string) => string[] = artIn): string | null {
  const drawn = keys(`decor/${kind}-`)
  if (drawn.length === 0) return null
  const own = `decor/${kind}-${variant}`
  return drawn.includes(own) ? own : drawn[variant % drawn.length]!
}

/** The decor pictures, cut and shrunk once each. */
export class DecorArt {
  private readonly ready = new Map<string, HTMLCanvasElement | null>()
  private readonly art: ArtLibrary

  constructor(art: ArtLibrary) {
    this.art = art
  }

  /** The picture for a decor item, or null while it loads or when the owner has not drawn its kind. */
  sprite(kind: DecorKind, variant: number): HTMLCanvasElement | null {
    const key = decorKey(kind, variant)
    if (!key) return null
    const known = this.ready.get(key)
    if (known !== undefined) return known
    const image = this.art.image(key)
    if (!image || typeof document === 'undefined') return null
    const sprite = prepare(image)
    this.ready.set(key, sprite)
    return sprite
  }
}

function prepare(image: HTMLImageElement): HTMLCanvasElement | null {
  const full = document.createElement('canvas')
  full.width = image.naturalWidth
  full.height = image.naturalHeight
  const fullCtx = full.getContext('2d', { willReadFrequently: true })
  if (!fullCtx) return null
  fullCtx.drawImage(image, 0, 0)
  let box = { x: 0, y: 0, width: full.width, height: full.height }
  try {
    box = opaqueBounds(fullCtx.getImageData(0, 0, full.width, full.height).data, full.width, full.height) ?? box
  } catch {
    // A picture that cannot be read is drawn whole.
  }
  const scale = Math.min(1, DECOR_MAX_HEIGHT / box.height)
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(box.width * scale))
  out.height = Math.max(1, Math.round(box.height * scale))
  const ctx = out.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(full, box.x, box.y, box.width, box.height, 0, 0, out.width, out.height)
  return out
}
