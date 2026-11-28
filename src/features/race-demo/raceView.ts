import { ArtLibrary, artUrl, makeBackdrop, makeDecorSprites, makeForestBand } from './assets'
import { backLayers, SpriteCache } from './backSprites'
import { DecorArt } from './decorArt'
import { SceneArt } from './sceneArt'
import { drawRunner } from './drawRunner'
import { bendAt, clamp01, DEFAULT_FRAMING, depthAlpha, FAR_Z, gapToZ, makeCamera, NEAR_Z, project, trailCenter, type Camera, type Framing } from './projection'
import { advanceGait, runnerPose, STANDING, type Pose } from './runnerRig'
import type { RaceViewSource, RunnerAppearance } from './types'
import { DecorPool, syncRunners, type Decor, type ShownRunner } from './world'

/**
 * The race back view on a 2D canvas (owner brief, 24 November 2026). Layers, back to front: sky and
 * mountains (fixed, a little drift on bends), the far forest (slow drift), the ground and the trail
 * running to the vanishing point, then scenery, rivals and the player sorted by depth so nearer
 * things cover farther ones. Nothing is created per frame: the scenery is a fixed pool, the sort
 * reuses one list.
 */

const TRAIL_HALF = 0.85
const TRAIL_STEPS = 36
/** Every this many metres a faint band crosses the trail, so the eye feels it moving. */
const BAND_EVERY = 2.5
/** Metres of ground one width of the owner's meadow texture covers. */
const MEADOW_TILE = 3
/** Metres one width of the owner's trail texture covers: a little more than the trail is wide. */
const TRAIL_TILE = 2.4
/** The ground textures fade from full (nearer than this) to the plain colour (beyond the far one), metres. */
const GROUND_FADE_NEAR = 25
const GROUND_FADE_FAR = 70
/** The owner's hills are at most this share of the sky's height. */
const HILLS_MAX_SHARE = 0.75

interface Drawable {
  z: number
  decor: Decor | null
  runner: ShownRunner | null
}

export interface RaceViewOptions {
  /** Called about twice a second with the frames per second. */
  onFps?: (fps: number) => void
  /** Largest device pixel ratio drawn (more is sharper but slower). */
  maxPixelRatio?: number
  /** Where the player sits on screen (projection.ts). */
  framing?: Framing
}

export class RaceViewEngine {
  private readonly ctx: CanvasRenderingContext2D | null
  private readonly art = new ArtLibrary()
  private readonly sprites = new SpriteCache(this.art)
  /** The art layers of each look, worked out once per appearance object. */
  private readonly looks = new WeakMap<RunnerAppearance, readonly string[] | null>()
  private readonly decorSprites = makeDecorSprites()
  private readonly decorArt = new DecorArt(this.art)
  private readonly sceneArt = new SceneArt(this.art)
  /** The owner has drawn the far hills: the coded ridges and far forest step aside. */
  private readonly hillsDrawn = artUrl('scene/mountains') !== undefined
  private readonly groundMatrix = typeof DOMMatrix === 'undefined' ? null : new DOMMatrix()
  private readonly pool = new DecorPool()
  private readonly shown = new Map<string, ShownRunner>()
  private readonly drawables: Drawable[] = []
  private readonly playerGait = { phase: 0, intensity: 0 }
  private camera: Camera = makeCamera(1, 1)
  private backdrop: HTMLCanvasElement | null = null
  private forest: HTMLCanvasElement | null = null
  private odometer = 0
  private frameId = 0
  private last = 0
  private fpsFrames = 0
  private fpsSince = 0
  private pixelRatio = 1
  private playerAppearance: RunnerAppearance | null = null
  private framing: Framing
  private cssWidth = 1
  private cssHeight = 1

  private readonly canvas: HTMLCanvasElement
  private readonly source: RaceViewSource
  private readonly options: RaceViewOptions

  constructor(canvas: HTMLCanvasElement, source: RaceViewSource, options: RaceViewOptions = {}) {
    this.canvas = canvas
    this.source = source
    this.options = options
    this.framing = options.framing ?? DEFAULT_FRAMING
    let ctx: CanvasRenderingContext2D | null = null
    try {
      ctx = canvas.getContext('2d', { alpha: false })
    } catch {
      ctx = null
    }
    this.ctx = ctx
  }

  /** Fits the canvas to its box on screen (call when the box changes size). */
  resize(cssWidth: number, cssHeight: number): void {
    const ratio = Math.min(this.options.maxPixelRatio ?? 1.5, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)
    this.pixelRatio = ratio
    this.canvas.width = Math.max(1, Math.round(cssWidth * ratio))
    this.canvas.height = Math.max(1, Math.round(cssHeight * ratio))
    this.cssWidth = cssWidth
    this.cssHeight = cssHeight
    this.camera = makeCamera(cssWidth, cssHeight, this.framing)
    this.backdrop = makeBackdrop(cssWidth, this.camera.horizonY, !this.hillsDrawn)
    this.forest = this.hillsDrawn ? null : makeForestBand(cssWidth, cssHeight * 0.05)
  }

  /** Moves the camera for a new framing of the player (debug panel). */
  setFraming(framing: Framing): void {
    this.framing = framing
    this.camera = makeCamera(this.cssWidth, this.cssHeight, framing)
  }

  /** The art layers of a look, or null for the coded runner. */
  private layersOf(appearance: RunnerAppearance): readonly string[] | null {
    let layers = this.looks.get(appearance)
    if (layers === undefined) {
      layers = backLayers(appearance)
      this.looks.set(appearance, layers)
    }
    return layers
  }

  start(): void {
    if (!this.ctx || this.frameId) return
    this.last = performance.now()
    this.fpsSince = this.last
    this.frameId = requestAnimationFrame(this.frame)
  }

  stop(): void {
    if (this.frameId) cancelAnimationFrame(this.frameId)
    this.frameId = 0
  }

  private readonly frame = (now: number) => {
    this.frameId = requestAnimationFrame(this.frame)
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000))
    this.last = now
    this.update(dt)
    this.draw()
    this.fpsFrames++
    if (now - this.fpsSince >= 500) {
      this.options.onFps?.(Math.round((this.fpsFrames * 1000) / (now - this.fpsSince)))
      this.fpsFrames = 0
      this.fpsSince = now
    }
  }

  private update(dt: number): void {
    const state = this.source()
    this.odometer += Math.max(0, state.speed) * dt
    this.pool.update(this.odometer)
    const before = new Map<string, number>()
    for (const [id, runner] of this.shown) before.set(id, runner.gap)
    syncRunners(this.shown, state.runners, dt)
    advanceGait(this.playerGait, state.speed, dt)
    for (const runner of this.shown.values()) {
      // A rival's own speed: the player's, less how fast its gap grows.
      const previous = before.get(runner.id) ?? runner.gap
      const speed = dt > 0 ? Math.max(0, state.speed - (runner.gap - previous) / dt) : state.speed
      advanceGait(runner.gait, Math.max(speed, 2.2), dt)
    }
    this.playerAppearance = state.player.appearance
  }

  private draw(): void {
    const ctx = this.ctx
    if (!ctx) return
    const cam = this.camera
    const bend = bendAt(this.odometer)
    const playerPose: Pose = this.playerGait.intensity > 0.01 ? runnerPose(this.playerGait.phase, this.playerGait.intensity) : STANDING
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0)

    // The camera rides behind the runner's head: the world bobs a little against the stride.
    const cameraBob = playerPose.bob * cam.height * 0.06
    ctx.save()
    ctx.translate(0, cameraBob)

    // 1. Sky and mountains: almost fixed, drifting a little on bends.
    if (this.backdrop) ctx.drawImage(this.backdrop, -cam.width * 0.1 - bend * cam.width * 0.03, 0)
    else {
      ctx.fillStyle = '#c9b6a8'
      ctx.fillRect(0, 0, cam.width, cam.horizonY)
    }
    // The owner's far hills, standing on the horizon.
    this.drawHills(ctx, cam, bend)
    // Ground under everything.
    const ground = ctx.createLinearGradient(0, cam.horizonY, 0, cam.height)
    ground.addColorStop(0, '#6f7a52')
    ground.addColorStop(0.25, '#5d6a3e')
    ground.addColorStop(1, '#4b5531')
    const meadow = this.sceneArt.ground('meadow')
    // Under the owner's meadow, its own average colour, so the far ground it fades into matches.
    ctx.fillStyle = meadow ? this.sceneArt.tone('meadow') : ground
    ctx.fillRect(0, cam.horizonY, cam.width, cam.height - cam.horizonY + 40)
    if (meadow) this.drawGroundTexture(ctx, cam, bend, meadow, MEADOW_TILE, null)
    // 2. Far forest: slow drift, more than the mountains.
    if (this.forest) ctx.drawImage(this.forest, -cam.width * 0.3 - bend * cam.width * 0.12, cam.horizonY - this.forest.height + 2)

    // 3. The trail.
    this.drawTrail(ctx, cam, bend)

    // 4. Scenery, rivals and the player, far to near.
    const list = this.drawables
    let n = 0
    const put = (z: number, decor: Decor | null, runner: ShownRunner | null) => {
      const slot = list[n] ?? (list[n] = { z: 0, decor: null, runner: null })
      slot.z = z
      slot.decor = decor
      slot.runner = runner
      n++
    }
    for (const item of this.pool.items) {
      const z = item.at - this.odometer
      if (z > NEAR_Z && z < FAR_Z) put(z, item, null)
    }
    for (const runner of this.shown.values()) {
      const z = gapToZ(runner.gap, cam.playerZ)
      if (z > NEAR_Z && z < FAR_Z) put(z, null, runner)
    }
    put(cam.playerZ, null, null)
    list.length = n
    list.sort((a, b) => b.z - a.z)
    for (const d of list) {
      if (d.decor) this.drawDecor(ctx, cam, bend, d.decor, d.z)
      else if (d.runner) this.drawRival(ctx, cam, bend, d.runner, d.z)
      else if (this.playerAppearance) {
        const p = project(cam, trailCenter(bend, cam.playerZ), cam.playerZ)
        const appearance = this.playerAppearance
        drawRunner({ ctx, sprites: this.sprites, layers: this.layersOf(appearance), x: p.x, y: p.y - cameraBob, scale: p.scale, pose: playerPose, appearance, alpha: 1 })
      }
    }
    ctx.restore()

    // Warm evening light over everything, strongest at the top right.
    const light = ctx.createLinearGradient(cam.width, 0, 0, cam.height)
    light.addColorStop(0, 'rgba(255, 190, 120, 0.16)')
    light.addColorStop(0.6, 'rgba(255, 190, 120, 0)')
    ctx.fillStyle = light
    ctx.fillRect(0, 0, cam.width, cam.height)
  }

  private drawTrail(ctx: CanvasRenderingContext2D, cam: Camera, bend: number): void {
    const near = NEAR_Z
    const ratio = FAR_Z / near
    ctx.beginPath()
    for (let i = 0; i <= TRAIL_STEPS; i++) {
      const z = near * Math.pow(ratio, i / TRAIL_STEPS)
      const p = project(cam, trailCenter(bend, z) - TRAIL_HALF, z)
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    }
    for (let i = TRAIL_STEPS; i >= 0; i--) {
      const z = near * Math.pow(ratio, i / TRAIL_STEPS)
      const p = project(cam, trailCenter(bend, z) + TRAIL_HALF, z)
      ctx.lineTo(p.x, p.y)
    }
    ctx.closePath()
    const dirt = ctx.createLinearGradient(0, cam.horizonY, 0, cam.height)
    dirt.addColorStop(0, '#b9a689')
    dirt.addColorStop(0.3, '#a38b6a')
    dirt.addColorStop(1, '#8a7052')
    ctx.fillStyle = dirt
    ctx.fill()
    const texture = this.sceneArt.ground('trail')
    if (texture) {
      // The owner's trail: the texture laid on the trail, row by row; it runs at the camera itself.
      this.drawGroundTexture(ctx, cam, bend, texture, TRAIL_TILE, TRAIL_HALF)
      return
    }

    // Faint bands across the trail at fixed places along the course: they run at the camera.
    const offset = BAND_EVERY - (this.odometer % BAND_EVERY)
    for (let z = offset + NEAR_Z; z < 45; z += BAND_EVERY) {
      const alpha = 0.12 * clamp01((45 - z) / 20)
      const a = project(cam, trailCenter(bend, z) - TRAIL_HALF, z)
      const b = project(cam, trailCenter(bend, z) + TRAIL_HALF, z)
      const depth = Math.max(1, 0.25 * a.scale)
      ctx.fillStyle = `rgba(70, 50, 30, ${alpha})`
      ctx.fillRect(a.x, a.y - depth / 2, b.x - a.x, depth)
    }
  }

  /**
   * A ground texture laid on the ground in perspective, one screen row at a time: each row is a depth,
   * the texture tiles every `tile` metres across and along, and it slides with the distance run so
   * the ground runs at the camera. With `half`, only the trail (that many metres each side of its
   * centre); without, the whole ground. It fades into the plain ground colour toward the horizon,
   * where a photo would only flicker.
   */
  private drawGroundTexture(ctx: CanvasRenderingContext2D, cam: Camera, bend: number, texture: HTMLCanvasElement, tile: number, half: number | null): void {
    const pattern = ctx.createPattern(texture, 'repeat')
    const matrix = this.groundMatrix
    if (!pattern || !matrix) return
    const texelsPerMetre = texture.width / tile
    ctx.fillStyle = pattern
    const depthTimesFocal = cam.focal * cam.eyeHeight
    const top = Math.ceil(cam.horizonY + depthTimesFocal / GROUND_FADE_FAR)
    let y = top
    while (y < cam.height + 40) {
      const z = depthTimesFocal / (y + 0.5 - cam.horizonY)
      if (z < NEAR_Z * 0.5) break
      // Texels of the course per screen row here: far rows each show their own, near ones are drawn
      // in strips (the texture is magnified there), so the ground costs a few hundred fills a frame.
      const advance = ((z * z) / depthTimesFocal) * texelsPerMetre
      const strip = Math.max(1, Math.min(24, Math.floor(1.5 / advance)))
      const scale = cam.focal / z
      const centre = cam.width / 2 + trailCenter(bend, z) * scale
      let left = 0
      let right = cam.width
      if (half !== null) {
        left = Math.max(0, centre - half * scale)
        right = Math.min(cam.width, centre + half * scale)
      }
      if (right > left) {
        // Across: one metre is `scale` pixels on this row, the texture's centre on the trail's. Along:
        // the strip's first row shows the course at its depth, and the texture runs back from there.
        const along = ((z + this.odometer) * texelsPerMetre) % texture.height
        matrix.a = scale / texelsPerMetre
        matrix.b = 0
        matrix.c = 0
        matrix.d = -1 / advance
        matrix.e = centre - (texture.width / 2) * matrix.a
        matrix.f = y + along / advance
        pattern.setTransform(matrix)
        ctx.globalAlpha = clamp01((GROUND_FADE_FAR - z) / (GROUND_FADE_FAR - GROUND_FADE_NEAR))
        ctx.fillRect(left, y, right - left, strip)
      }
      y += strip
    }
    ctx.globalAlpha = 1
  }

  /** The owner's far hills: on the horizon, side by side (mirrored every other one) across the screen. */
  private drawHills(ctx: CanvasRenderingContext2D, cam: Camera, bend: number): void {
    const hills = this.sceneArt.mountains()
    if (!hills) return
    const height = Math.min(cam.horizonY * HILLS_MAX_SHARE, (cam.width * 1.3 * hills.height) / hills.width)
    const width = (height * hills.width) / hills.height
    const bottom = cam.horizonY + 2
    let x = -cam.width * 0.15 - bend * cam.width * 0.05
    for (let i = 0; x < cam.width; i++, x += width) {
      if (x + width < 0) continue
      ctx.save()
      if (i % 2 === 1) {
        ctx.translate(x + width, 0)
        ctx.scale(-1, 1)
        ctx.drawImage(hills, 0, bottom - height, width, height)
      } else ctx.drawImage(hills, x, bottom - height, width, height)
      ctx.restore()
    }
  }

  private drawDecor(ctx: CanvasRenderingContext2D, cam: Camera, bend: number, item: Decor, z: number): void {
    const p = project(cam, trailCenter(bend, z) + item.x, z)
    const h = item.size * p.scale
    if (h < 0.8 || p.x < -h * 2 || p.x > cam.width + h * 2) return
    const alpha = depthAlpha(z, item.kind === 'grass' ? 0.7 : undefined) * (item.kind === 'grass' ? 0.75 : 1)
    if (alpha <= 0.01) return
    ctx.globalAlpha = alpha
    if (item.kind === 'pebble') {
      ctx.fillStyle = item.variant === 0 ? '#7d6a52' : '#c2b296'
      ctx.beginPath()
      ctx.ellipse(p.x, p.y - h * 0.2, h, h * 0.35, 0, 0, Math.PI * 2)
      ctx.fill()
    } else {
      const sprite = this.decorArt.sprite(item.kind, item.variant) ?? this.decorSprites.get(`${item.kind}-${item.variant}`)
      if (sprite) {
        const w = (h * sprite.width) / sprite.height
        ctx.drawImage(sprite, p.x - w / 2, p.y - h, w, h)
      }
    }
    ctx.globalAlpha = 1
  }

  private drawRival(ctx: CanvasRenderingContext2D, cam: Camera, bend: number, runner: ShownRunner, z: number): void {
    const p = project(cam, trailCenter(bend, z) + runner.lane, z)
    // Behind the player a rival fades as it nears the lens, so it never fills the screen.
    const alpha = runner.presence * depthAlpha(z, cam.playerZ * 0.75)
    const pose = runnerPose(runner.gait.phase, runner.gait.intensity)
    drawRunner({ ctx, sprites: this.sprites, layers: this.layersOf(runner.appearance), x: p.x, y: p.y, scale: p.scale, pose, appearance: runner.appearance, alpha })
  }
}
