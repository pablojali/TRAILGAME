import { seededRandom, VARIANTS, type DecorKind } from './world'

/**
 * Art for the race back view, by path (docs/RACE_BACK_VIEW_DEMO.md lists every key). A file dropped
 * at `assets/race/back-view/<key>.webp` (or .png) replaces the coded placeholder with no code
 * change; until then the placeholder is drawn.
 */
const FILES = import.meta.glob<string>('/assets/race/back-view/**/*.{png,webp}', { eager: true, query: '?url', import: 'default' })

const ROOT = '/assets/race/back-view/'

/** The bundled URL of a piece of art, e.g. `decor/pine-0` or `runner/bodies/men_body_tone3_f1`, if the owner has added it. */
export function artUrl(key: string): string | undefined {
  return FILES[`${ROOT}${key}.webp`] ?? FILES[`${ROOT}${key}.png`]
}

/**
 * The art keys in a folder, e.g. `artIn('runner/footwear/')`, without extension, sorted (each key
 * once, even with both a .png and a .webp).
 */
export function artIn(prefix: string): string[] {
  const keys = new Set<string>()
  for (const path of Object.keys(FILES)) {
    if (path.startsWith(ROOT + prefix)) keys.add(path.slice(ROOT.length).replace(/\.(png|webp)$/, ''))
  }
  return [...keys].sort()
}

/** Every art key the view asks for has a fallback; images load once and are reused. */
export class ArtLibrary {
  private readonly images = new Map<string, HTMLImageElement | null>()

  /** The loaded image for a key, or null (no file, or still loading: draw the placeholder). */
  image(key: string): HTMLImageElement | null {
    let image = this.images.get(key)
    if (image === undefined) {
      const url = artUrl(key)
      image = null
      if (url && typeof Image !== 'undefined') {
        image = new Image()
        image.decoding = 'async'
        image.src = url
      }
      this.images.set(key, image)
    }
    return image && image.complete && image.naturalWidth > 0 ? image : null
  }
}

/** Placeholder colours for appearance ids; an unknown id gets a steady colour of its own. */
const COLORS: Record<string, string> = {
  'tone-1': '#f1c7a5',
  'tone-2': '#d9a27a',
  'tone-3': '#a8704a',
  'tone-4': '#6b4128',
  'short-dark': '#1f1a17',
  'short-brown': '#5a3a22',
  'short-blond': '#c9a15a',
  'ponytail-dark': '#1f1a17',
  'ponytail-red': '#8e3b1f',
  'cap-white': '#efefef',
  black: '#1d1e22',
  navy: '#1e2a4a',
  grey: '#5d6168',
  red: '#c8352c',
  blue: '#2f64c8',
  yellow: '#e8c22f',
  green: '#3d9a4a',
  white: '#ecebe6',
  orange: '#ec7a22',
  purple: '#7a44b5',
  teal: '#1f9a96',
  lime: '#9ed838',
  pink: '#e56aa5',
  'vest-black': '#24262b',
  'vest-blue': '#26406e',
}

export function colorOf(id: string): string {
  const known = COLORS[id]
  if (known) return known
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360
  return `hsl(${h} 55% 45%)`
}

type Canvas = HTMLCanvasElement

function canvas(width: number, height: number): Canvas | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  return c.getContext('2d') ? c : null
}

/**
 * Coded drawings of the scenery, made once (bottom centre is where the piece stands). Each kind has
 * a few variants so the forest does not repeat.
 */
export function makeDecorSprites(): Map<string, Canvas> {
  const sprites = new Map<string, Canvas>()
  const kinds: DecorKind[] = ['pine', 'rock', 'bush', 'grass']
  for (const kind of kinds) {
    for (let v = 0; v < VARIANTS; v++) {
      const sprite = drawDecor(kind, v)
      if (sprite) sprites.set(`${kind}-${v}`, sprite)
    }
  }
  return sprites
}

function drawDecor(kind: DecorKind, variant: number): Canvas | null {
  const random = seededRandom(97 + variant * 13 + kind.length)
  if (kind === 'pine') {
    const c = canvas(96, 256)
    const g = c?.getContext('2d')
    if (!c || !g) return null
    g.fillStyle = '#4a3324'
    g.fillRect(44, 200, 8, 56)
    const tiers = 7 + variant
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers
      const y = 225 - t * 215
      const half = (1 - t) * 44 + 4
      const shade = 26 + Math.floor(random() * 14) - i
      g.fillStyle = `hsl(${140 + variant * 6} ${32 + variant * 4}% ${shade}%)`
      g.beginPath()
      g.moveTo(48, y - 46 * (1 - t * 0.4))
      g.lineTo(48 - half, y + 6)
      g.quadraticCurveTo(48, y - 4, 48 + half, y + 6)
      g.closePath()
      g.fill()
    }
    // Warm light on the right, as in a low evening sun.
    g.globalCompositeOperation = 'source-atop'
    const light = g.createLinearGradient(0, 0, 96, 0)
    light.addColorStop(0, 'rgba(0,0,0,0.15)')
    light.addColorStop(1, 'rgba(255,190,110,0.22)')
    g.fillStyle = light
    g.fillRect(0, 0, 96, 256)
    return c
  }
  if (kind === 'rock') {
    const c = canvas(128, 96)
    const g = c?.getContext('2d')
    if (!c || !g) return null
    g.beginPath()
    const points = 9
    for (let i = 0; i <= points; i++) {
      const a = Math.PI * (i / points)
      const r = 0.75 + random() * 0.25
      g.lineTo(64 - Math.cos(a) * 60 * r, 96 - Math.sin(a) * 88 * r)
    }
    g.closePath()
    const fill = g.createLinearGradient(0, 0, 128, 96)
    fill.addColorStop(0, `hsl(30 6% ${70 - variant * 6}%)`)
    fill.addColorStop(1, `hsl(28 8% ${42 - variant * 4}%)`)
    g.fillStyle = fill
    g.fill()
    return c
  }
  if (kind === 'bush') {
    const c = canvas(128, 80)
    const g = c?.getContext('2d')
    if (!c || !g) return null
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `hsl(${95 + variant * 12} 35% ${22 + random() * 16}%)`
      g.beginPath()
      g.ellipse(18 + random() * 92, 46 + random() * 26, 14 + random() * 12, 12 + random() * 10, 0, 0, Math.PI * 2)
      g.fill()
    }
    return c
  }
  const c = canvas(64, 96)
  const g = c?.getContext('2d')
  if (!c || !g) return null
  g.strokeStyle = `hsl(${80 + variant * 10} 40% 38%)`
  g.lineWidth = 2
  for (let i = 0; i < 12; i++) {
    const x = 8 + random() * 48
    g.beginPath()
    g.moveTo(x, 96)
    g.quadraticCurveTo(x + (random() - 0.5) * 20, 50, x + (random() - 0.5) * 30, 4 + random() * 30)
    g.stroke()
  }
  return c
}

/** Sky, sun and mountains (fixed), made once per screen size. */
export function makeBackdrop(width: number, horizonY: number, ridges = true): Canvas | null {
  const c = canvas(Math.ceil(width * 1.2), horizonY + 4)
  const g = c?.getContext('2d')
  if (!c || !g) return null
  const w = c.width
  const sky = g.createLinearGradient(0, 0, 0, horizonY)
  sky.addColorStop(0, '#6f8db4')
  sky.addColorStop(0.55, '#c9b6a8')
  sky.addColorStop(1, '#f4c58d')
  g.fillStyle = sky
  g.fillRect(0, 0, w, c.height)
  const sun = g.createRadialGradient(w * 0.86, horizonY * 0.62, 0, w * 0.86, horizonY * 0.62, w * 0.45)
  sun.addColorStop(0, 'rgba(255,236,190,0.95)')
  sun.addColorStop(0.15, 'rgba(255,200,130,0.55)')
  sun.addColorStop(1, 'rgba(255,170,100,0)')
  g.fillStyle = sun
  g.fillRect(0, 0, w, c.height)
  if (!ridges) return c
  const random = seededRandom(5)
  // Two ridges: the far one pale and snowy, the near one darker.
  ridge(g, w, horizonY, horizonY * 0.38, 0.55, '#8b8fa3', '#eef0f4', random)
  ridge(g, w, horizonY, horizonY * 0.62, 0.35, '#5d6576', null, random)
  return c
}

function ridge(g: CanvasRenderingContext2D, w: number, base: number, top: number, jag: number, color: string, snow: string | null, random: () => number) {
  const points: [number, number][] = []
  let y = top + (base - top) * 0.4
  for (let x = 0; x <= w + 20; x += 20 + random() * 25) {
    y = Math.max(top, Math.min(base - 6, y + (random() - 0.5) * (base - top) * jag))
    points.push([x, y])
  }
  g.beginPath()
  g.moveTo(0, base + 4)
  for (const [x, py] of points) g.lineTo(x, py)
  g.lineTo(w, base + 4)
  g.closePath()
  g.fillStyle = color
  g.fill()
  if (snow) {
    g.save()
    g.clip()
    g.fillStyle = snow
    for (const [x, py] of points) {
      if (py < top + (base - top) * 0.25) {
        g.beginPath()
        g.moveTo(x - 18, py + 16)
        g.lineTo(x, py)
        g.lineTo(x + 16, py + 14)
        g.closePath()
        g.fill()
      }
    }
    g.restore()
  }
}

/** The far forest: a band of small dark pines along the horizon, wider than the screen so it can drift. */
export function makeForestBand(width: number, height: number): Canvas | null {
  const c = canvas(Math.ceil(width * 1.6), Math.max(8, Math.ceil(height)))
  const g = c?.getContext('2d')
  if (!c || !g) return null
  const random = seededRandom(23)
  const h = c.height
  for (let x = 0; x < c.width; x += 3 + random() * 5) {
    const th = h * (0.35 + random() * 0.65)
    g.fillStyle = `hsl(150 25% ${14 + random() * 10}%)`
    g.beginPath()
    g.moveTo(x, h - th)
    g.lineTo(x - th * 0.22, h)
    g.lineTo(x + th * 0.22, h)
    g.closePath()
    g.fill()
  }
  return c
}
