import { colorOf, type ArtLibrary } from './assets'
import type { Pose } from './runnerRig'
import type { RunnerAppearance } from './types'

/**
 * Draws a runner from behind, from a pose (runnerRig.ts). Units are metres, with the origin between
 * the feet and y going up (drawn as negative screen y). Each body part is drawn from its art when the
 * owner has added it (`runner/<part>-<id>`, boxes in PART_BOXES), otherwise from coded shapes.
 */

const HIP_Y = 0.95
const SHOULDER_Y = 1.43
const SHOULDER_HALF = 0.2
const HIP_HALF = 0.14
const HEAD_Y = 1.6
const HEAD_R = 0.105
const LEG_X = 0.085

/**
 * Where each part's art goes, in metres around its pivot (x, y of the box's top-left from the pivot,
 * then width and height; y up). Arms and legs hang from their pivot and swing about it; the left one
 * is the right one mirrored.
 */
export const PART_BOXES = {
  torso: { pivot: [0, HIP_Y], box: [-0.24, 0.56, 0.48, 0.6] },
  head: { pivot: [0, HEAD_Y], box: [-0.13, 0.16, 0.26, 0.3] },
  hair: { pivot: [0, HEAD_Y], box: [-0.14, 0.18, 0.28, 0.32] },
  pack: { pivot: [0, HIP_Y], box: [-0.2, 0.5, 0.4, 0.44] },
  shorts: { pivot: [0, HIP_Y], box: [-0.18, 0.06, 0.36, 0.3] },
  arm: { pivot: [SHOULDER_HALF, SHOULDER_Y - 0.02], box: [-0.06, 0.04, 0.16, 0.5] },
  leg: { pivot: [LEG_X, HIP_Y], box: [-0.08, 0, 0.16, 0.95] },
} as const

type PartName = keyof typeof PART_BOXES

export interface RunnerDraw {
  ctx: CanvasRenderingContext2D
  art: ArtLibrary
  /** Screen point of the feet and pixels per metre. */
  x: number
  y: number
  scale: number
  pose: Pose
  appearance: RunnerAppearance
  alpha: number
}

export function drawRunner({ ctx, art, x, y, scale, pose, appearance, alpha }: RunnerDraw): void {
  if (alpha <= 0.01 || scale * 1.75 < 2) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  // Shadow on the ground.
  ctx.fillStyle = 'rgba(30, 20, 10, 0.28)'
  ctx.beginPath()
  ctx.ellipse(0, 0, 0.32, 0.07, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.translate(pose.sway, -pose.bob)
  const skin = colorOf(appearance.skin)

  // Legs first (behind the shorts), then the body, arms over the body's sides, then pack and head.
  leg(ctx, art, appearance, skin, -1, pose.legL.lift)
  leg(ctx, art, appearance, skin, 1, pose.legR.lift)

  ctx.save()
  ctx.translate(0, -HIP_Y)
  ctx.rotate(pose.roll)
  ctx.translate(0, HIP_Y)
  if (!part(ctx, art, 'shorts', appearance.shorts)) shorts(ctx, colorOf(appearance.shorts))
  if (!part(ctx, art, 'torso', appearance.shirt)) torso(ctx, colorOf(appearance.shirt))
  arm(ctx, art, appearance, skin, -1, pose.armL)
  arm(ctx, art, appearance, skin, 1, pose.armR)
  if (appearance.pack && !part(ctx, art, 'pack', appearance.pack)) pack(ctx, colorOf(appearance.pack))
  if (!part(ctx, art, 'head', appearance.skin)) head(ctx, skin)
  if (!part(ctx, art, 'hair', appearance.hair)) hair(ctx, appearance.hair, colorOf(appearance.hair))
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

/** Draws a part from its art, if the owner has added it; false = draw the placeholder. */
function part(ctx: CanvasRenderingContext2D, art: ArtLibrary, name: PartName, id: string, side = 1, angle = 0): boolean {
  const image = art.image(`runner/${name}-${id}`)
  if (!image) return false
  const { pivot, box } = PART_BOXES[name]
  ctx.save()
  ctx.translate(pivot[0] * side, -pivot[1])
  ctx.rotate(angle * side)
  ctx.scale(side, 1)
  ctx.drawImage(image, box[0], -box[1], box[2], box[3])
  ctx.restore()
  return true
}

function leg(ctx: CanvasRenderingContext2D, art: ArtLibrary, appearance: RunnerAppearance, skin: string, side: number, lift: number) {
  // Seen from behind, a lifted foot rises and the lower leg looks shorter; the sole shows.
  if (part(ctx, art, 'leg', appearance.skin, side, lift * 0.25)) {
    part(ctx, art, 'leg', `shoe-${appearance.shoes}`, side, lift * 0.25)
    return
  }
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

function arm(ctx: CanvasRenderingContext2D, art: ArtLibrary, appearance: RunnerAppearance, skin: string, side: number, swing: number) {
  if (part(ctx, art, 'arm', appearance.skin, side, -swing * 0.3)) return
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
