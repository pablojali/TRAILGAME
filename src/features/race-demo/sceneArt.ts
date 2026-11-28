import type { ArtLibrary } from './assets'
import { opaqueBounds } from './decorArt'

/**
 * The owner's scene art (docs/RACE_BACK_VIEW_DEMO.md): the ground textures, seen from above, laid on
 * the ground in perspective (`ground/meadow` beside the trail, `ground/trail` on it), and the far
 * hills (`scene/mountains`) standing on the horizon. Each picture is prepared once: the textures
 * shrunk to a size that tiles fast, the hills freed from their white background and cut to the
 * drawing.
 */

/** The widest a ground texture is kept at. */
const GROUND_MAX_WIDTH = 1024
/** The widest the hills are kept at. */
const HILLS_MAX_WIDTH = 2048

/**
 * Turns a white background into transparency, in place: a pixel's alpha is how far it is from white
 * (its darkest channel), and its colour is what, laid over white at that alpha, gives the pixel back.
 * The hills' mist, painted over white, becomes a thin veil over the sky. `data` is RGBA.
 */
export function whiteToAlpha(data: Uint8ClampedArray | number[]): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!
    const alpha = 1 - Math.min(r, g, b) / 255
    if (alpha <= 0.02) {
      data[i + 3] = 0
      continue
    }
    const un = (c: number) => Math.round(Math.max(0, Math.min(255, (c - 255 * (1 - alpha)) / alpha)))
    data[i] = un(r)
    data[i + 1] = un(g)
    data[i + 2] = un(b)
    data[i + 3] = Math.round(alpha * (data[i + 3]! / 255) * 255)
  }
}

/** True when a picture has no transparency at all (a scan of its alpha). */
function opaque(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i]! < 250) return false
  return true
}

export class SceneArt {
  private readonly ready = new Map<string, HTMLCanvasElement | null>()
  private readonly tones = new Map<string, string>()
  private readonly art: ArtLibrary

  constructor(art: ArtLibrary) {
    this.art = art
  }

  /** A ground texture (`meadow` or `trail`), or null while it loads or when there is none. */
  ground(name: 'meadow' | 'trail'): HTMLCanvasElement | null {
    return this.prepared(`ground/${name}`, (image) => {
      const scale = Math.min(1, GROUND_MAX_WIDTH / image.naturalWidth)
      const out = canvas(Math.round(image.naturalWidth * scale), Math.round(image.naturalHeight * scale))
      out?.getContext('2d')?.drawImage(image, 0, 0, out.width, out.height)
      return out
    })
  }

  /** The average colour of a ground texture (a CSS colour), grey until it is ready. */
  tone(name: 'meadow' | 'trail'): string {
    const key = `ground/${name}`
    const known = this.tones.get(key)
    if (known) return known
    const texture = this.ground(name)
    if (!texture) return '#808080'
    const small = canvas(1, 1)
    const ctx = small?.getContext('2d', { willReadFrequently: true })
    let tone = '#808080'
    if (ctx) {
      ctx.drawImage(texture, 0, 0, 1, 1)
      try {
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
        tone = `rgb(${r}, ${g}, ${b})`
      } catch {
        // Unreadable: grey.
      }
    }
    this.tones.set(key, tone)
    return tone
  }

  /** The far hills, cut to the drawing, or null while they load or when there are none. */
  mountains(): HTMLCanvasElement | null {
    return this.prepared('scene/mountains', (image) => {
      const scale = Math.min(1, HILLS_MAX_WIDTH / image.naturalWidth)
      const full = canvas(Math.round(image.naturalWidth * scale), Math.round(image.naturalHeight * scale))
      const ctx = full?.getContext('2d', { willReadFrequently: true })
      if (!full || !ctx) return null
      ctx.drawImage(image, 0, 0, full.width, full.height)
      let pixels: ImageData
      try {
        pixels = ctx.getImageData(0, 0, full.width, full.height)
      } catch {
        return full
      }
      // A picture without transparency was painted on white: the white becomes the sky.
      if (opaque(pixels.data)) whiteToAlpha(pixels.data)
      const box = opaqueBounds(pixels.data, full.width, full.height)
      if (!box) return null
      ctx.putImageData(pixels, 0, 0)
      const out = canvas(box.width, box.height)
      out?.getContext('2d')?.drawImage(full, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height)
      return out
    })
  }

  private prepared(key: string, make: (image: HTMLImageElement) => HTMLCanvasElement | null): HTMLCanvasElement | null {
    const known = this.ready.get(key)
    if (known !== undefined) return known
    const image = this.art.image(key)
    if (!image || typeof document === 'undefined') return null
    const made = make(image)
    this.ready.set(key, made)
    return made
  }
}

function canvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = Math.max(1, width)
  c.height = Math.max(1, height)
  return c
}
