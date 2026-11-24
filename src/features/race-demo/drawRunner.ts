import { colorOf } from './assets'
import { BACK_CANVAS, SPRITE_SIZES, type SpriteCache } from './backSprites'
import type { Pose } from './runnerRig'
import type { RunnerAppearance } from './types'

/**
 * Draws a runner from behind, from a pose (runnerRig.ts). With the owner's art (backSprites.ts) it
 * shows the pose's drawn frame and moves the whole picture by the pose's bob and sway; without it,
 * a coded runner. Units are metres, with the origin between the feet and y going up (drawn as
 * negative screen y).
 */

const HIP_Y = 0.95
const SHOULDER_Y = 1.43
const SHOULDER_HALF = 0.2
const HIP_HALF = 0.14
const HEAD_Y = 1.6
const HEAD_R = 0.105
const LEG_X = 0.085

export interface RunnerDraw {
  ctx: CanvasRenderingContext2D
  sprites: SpriteCache
  /** The look's art layers (backSprites.ts `backLayers`), or null to draw the coded runner. */
  layers: readonly string[] | null
  /** Screen point of the feet and pixels per metre. */
  x: number
  y: number
  scale: number
  pose: Pose
  appearance: RunnerAppearance
  alpha: number
}

/** Above this height on screen (CSS pixels) a runner is drawn from the large frames. */
const LARGE_FROM = SPRITE_SIZES.small.height * 0.9

export function drawRunner({ ctx, sprites, layers, x, y, scale, pose, appearance, alpha }: RunnerDraw): void {
  if (alpha <= 0.01 || scale * 1.75 < 2) return
  if (layers) {
    drawArt(ctx, sprites, layers, x, y, scale, pose, alpha)
    return
  }
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  shadow(ctx)

  ctx.translate(pose.sway, -pose.bob)
  const skin = colorOf(appearance.skin)

  // Legs first (behind the shorts), then the body, arms over the body's sides, then pack and head.
  leg(ctx, appearance, skin, -1, pose.legL.lift)
  leg(ctx, appearance, skin, 1, pose.legR.lift)

  ctx.save()
  ctx.translate(0, -HIP_Y)
  ctx.rotate(pose.roll)
  ctx.translate(0, HIP_Y)
  shorts(ctx, colorOf(appearance.shorts))
  torso(ctx, colorOf(appearance.shirt))
  arm(ctx, appearance, skin, -1, pose.armL)
  arm(ctx, appearance, skin, 1, pose.armR)
  if (appearance.pack) pack(ctx, colorOf(appearance.pack))
  head(ctx, skin)
  hair(ctx, appearance.hair, colorOf(appearance.hair))
  ctx.restore()

  ctx.restore()

  // The race number, drawn without the scale so the text stays sharp; only on runners big enough to read it.
  if (appearance.bib !== undefined && scale > 120) {
    const bx = x + pose.sway * scale
    const by = y - (HIP_Y + 0.12 - pose.bob) * scale
    const w = 0.16 * scale
    const h = 0.1 * scale
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = '#f6f4ee'
    ctx.fillRect(bx - w / 2, by - h / 2, w, h)
    ctx.fillStyle = '#1b1b1b'
    ctx.font = `700 ${Math.round(h * 0.72)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(appearance.bib), bx, by + h * 0.04)
    ctx.restore()
  }
}

/** The runner's shadow on the ground, in metres around the feet. */
function shadow(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = 'rgba(30, 20, 10, 0.28)'
  ctx.beginPath()
  ctx.ellipse(0, 0, 0.32, 0.07, 0, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * The runner from the owner's art: the pose's frame, standing on its feet point and moved as a whole
 * by the bob and sway (the art keeps the trunk still). Nothing is drawn while the pictures load.
 */
function drawArt(ctx: CanvasRenderingContext2D, sprites: SpriteCache, layers: readonly string[], x: number, y: number, scale: number, pose: Pose, alpha: number) {
  const metres = scale / BACK_CANVAS.pxPerMetre
  const height = BACK_CANVAS.height * metres
  const frames = sprites.frames(layers, height > LARGE_FROM ? 'large' : 'small')
  if (!frames) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  shadow(ctx)
  ctx.restore()
  const left = x + (pose.sway * BACK_CANVAS.pxPerMetre - BACK_CANVAS.footX) * metres
  const top = y - (pose.bob * BACK_CANVAS.pxPerMetre + BACK_CANVAS.footY) * metres
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.drawImage(frames[pose.frame]!, left, top, BACK_CANVAS.width * metres, height)
  ctx.restore()
}

function leg(ctx: CanvasRenderingContext2D, appearance: RunnerAppearance, skin: string, side: number, lift: number) {
  // Seen from behind, a lifted foot rises and the lower leg looks shorter; the sole shows.
  const hipX = side * LEG_X
  const footX = side * (LEG_X + 0.01)
  const footY = lift * 0.34
  const kneeY = (HIP_Y + footY) / 2 + 0.05 + lift * 0.08
  ctx.strokeStyle = skin
  ctx.lineCap = 'round'
  ctx.lineWidth = 0.1
  ctx.beginPath()
  ctx.moveTo(hipX, -HIP_Y + 0.1)
  ctx.lineTo(side * (LEG_X + 0.015), -kneeY)
  ctx.stroke()
  ctx.lineWidth = 0.08
  ctx.beginPath()
  ctx.moveTo(side * (LEG_X + 0.015), -kneeY)
  ctx.lineTo(footX, -footY - 0.08)
  ctx.stroke()
  // The shoe: the heel and, when lifted, the sole facing the camera.
  ctx.fillStyle = colorOf(appearance.shoes)
  roundRect(ctx, footX - 0.055, -footY - 0.1, 0.11, 0.1 - lift * 0.02, 0.03)
  if (lift > 0.15) {
    ctx.fillStyle = 'rgba(245, 240, 230, 0.9)'
    roundRect(ctx, footX - 0.045, -footY - 0.05, 0.09, 0.04 + lift * 0.05, 0.02)
  }
}

function shorts(ctx: CanvasRenderingContext2D, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(-HIP_HALF - 0.02, -HIP_Y - 0.06)
  ctx.lineTo(HIP_HALF + 0.02, -HIP_Y - 0.06)
  ctx.lineTo(HIP_HALF + 0.05, -HIP_Y + 0.2)
  ctx.lineTo(0.01, -HIP_Y + 0.16)
  ctx.lineTo(-0.01, -HIP_Y + 0.16)
  ctx.lineTo(-HIP_HALF - 0.05, -HIP_Y + 0.2)
  ctx.closePath()
  ctx.fill()
}

function torso(ctx: CanvasRenderingContext2D, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(-HIP_HALF - 0.01, -HIP_Y + 0.02)
  ctx.lineTo(HIP_HALF + 0.01, -HIP_Y + 0.02)
  ctx.lineTo(SHOULDER_HALF + 0.02, -SHOULDER_Y + 0.04)
  ctx.quadraticCurveTo(SHOULDER_HALF - 0.02, -SHOULDER_Y - 0.06, 0.06, -SHOULDER_Y - 0.05)
  ctx.lineTo(-0.06, -SHOULDER_Y - 0.05)
  ctx.quadraticCurveTo(-SHOULDER_HALF + 0.02, -SHOULDER_Y - 0.06, -SHOULDER_HALF - 0.02, -SHOULDER_Y + 0.04)
  ctx.closePath()
  ctx.fill()
  // A soft shade down the spine gives the back some shape.
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  ctx.fillRect(-0.012, -SHOULDER_Y, 0.024, SHOULDER_Y - HIP_Y)
}

function arm(ctx: CanvasRenderingContext2D, appearance: RunnerAppearance, skin: string, side: number, swing: number) {
  // Bent at the elbow: swinging back lifts the elbow out; swinging forward lifts the hand in front.
  const sx = side * (SHOULDER_HALF - 0.01)
  const sy = SHOULDER_Y - 0.03
  const ex = side * (SHOULDER_HALF + 0.07 + Math.max(0, -swing) * 0.03)
  const ey = SHOULDER_Y - 0.26 + Math.max(0, -swing) * 0.1
  const hx = side * (SHOULDER_HALF - 0.02 - Math.max(0, swing) * 0.05)
  const hy = SHOULDER_Y - 0.36 + swing * 0.12
  ctx.lineCap = 'round'
  ctx.strokeStyle = skin
  ctx.lineWidth = 0.075
  ctx.beginPath()
  ctx.moveTo(sx, -sy)
  ctx.lineTo(ex, -ey)
  ctx.lineTo(hx, -hy)
  ctx.stroke()
  // The sleeve over the top of the arm.
  ctx.strokeStyle = colorOf(appearance.shirt)
  ctx.lineWidth = 0.09
  ctx.beginPath()
  ctx.moveTo(sx, -sy)
  ctx.lineTo(sx + (ex - sx) * 0.4, -(sy + (ey - sy) * 0.4))
  ctx.stroke()
}

function pack(ctx: CanvasRenderingContext2D, color: string) {
  ctx.fillStyle = color
  roundRect(ctx, -0.15, -SHOULDER_Y + 0.05, 0.3, 0.38, 0.05)
  ctx.strokeStyle = color
  ctx.lineWidth = 0.035
  ctx.beginPath()
  ctx.moveTo(-0.12, -SHOULDER_Y + 0.08)
  ctx.lineTo(-SHOULDER_HALF + 0.03, -SHOULDER_Y - 0.03)
  ctx.moveTo(0.12, -SHOULDER_Y + 0.08)
  ctx.lineTo(SHOULDER_HALF - 0.03, -SHOULDER_Y - 0.03)
  ctx.stroke()
  // Reflective trim and a zip line, as on a running vest.
  ctx.strokeStyle = 'rgba(220, 220, 220, 0.55)'
  ctx.lineWidth = 0.008
  ctx.beginPath()
  ctx.moveTo(-0.12, -SHOULDER_Y + 0.09)
  ctx.lineTo(0.12, -SHOULDER_Y + 0.09)
  ctx.moveTo(0, -SHOULDER_Y + 0.12)
  ctx.lineTo(0, -SHOULDER_Y + 0.36)
  ctx.stroke()
}

function head(ctx: CanvasRenderingContext2D, skin: string) {
  ctx.fillStyle = skin
  ctx.fillRect(-0.045, -HEAD_Y + 0.06, 0.09, 0.12)
  ctx.beginPath()
  ctx.ellipse(0, -HEAD_Y, HEAD_R * 0.92, HEAD_R * 1.08, 0, 0, Math.PI * 2)
  ctx.fill()
  // Ears.
  ctx.beginPath()
  ctx.ellipse(-HEAD_R * 0.95, -HEAD_Y + 0.01, 0.022, 0.035, 0, 0, Math.PI * 2)
  ctx.ellipse(HEAD_R * 0.95, -HEAD_Y + 0.01, 0.022, 0.035, 0, 0, Math.PI * 2)
  ctx.fill()
}

function hair(ctx: CanvasRenderingContext2D, id: string, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(0, -HEAD_Y - 0.02, HEAD_R * 0.98, HEAD_R * 1.02, 0, Math.PI * 0.95, Math.PI * 2.05)
  ctx.lineTo(HEAD_R * 0.9, -HEAD_Y + 0.04)
  ctx.quadraticCurveTo(0, -HEAD_Y + 0.09, -HEAD_R * 0.9, -HEAD_Y + 0.04)
  ctx.closePath()
  ctx.fill()
  if (id.startsWith('ponytail')) {
    ctx.beginPath()
    ctx.ellipse(0, -HEAD_Y + 0.1, 0.035, 0.1, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  if (id.startsWith('cap')) {
    ctx.fillRect(-HEAD_R, -HEAD_Y - 0.02, HEAD_R * 2, 0.03)
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}
