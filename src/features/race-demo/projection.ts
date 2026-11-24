/**
 * Pseudo-3D camera for the race back view. Everything stands on a flat ground; a point at depth `z`
 * metres in front of the camera and `x` metres to the side is drawn at scale = focal / z.
 */

/** Depth of the player in front of the camera, in metres, with the default framing. */
export const PLAYER_Z = 3
/** Closer than this, things are behind the lens and not drawn. */
export const NEAR_Z = 0.35
/** The horizon: things farther than this are not drawn (they fade in before it). */
export const FAR_Z = 140
/** The runner's height in metres (the art's scale: docs/RACE_BACK_VIEW_DEMO.md). */
export const RUNNER_HEIGHT = 1.75

/**
 * How the player sits on screen (owner, 24 November 2026: like the reference GIF, but smaller): the
 * top of the head at `headTop` of the screen's height, and the bottom edge cutting the body `cutAt`
 * metres above the ground (mid-thigh), so the feet never show.
 */
export interface Framing {
  headTop: number
  cutAt: number
}

export const DEFAULT_FRAMING: Framing = { headTop: 0.62, cutAt: 0.55 }

export interface Camera {
  width: number
  height: number
  /** Screen y of the horizon, in pixels. */
  horizonY: number
  /** Pixels per metre at one metre of depth. */
  focal: number
  /** Height of the camera above the ground, metres. */
  eyeHeight: number
  /** Depth of the player in front of the camera, metres. */
  playerZ: number
}

/**
 * A camera for a screen size and framing: the player's scale follows from how much of the body shows
 * between the head and the bottom edge, and the camera's height from where the head sits under the
 * horizon.
 */
export function makeCamera(width: number, height: number, framing: Framing = DEFAULT_FRAMING): Camera {
  const horizonY = Math.round(height * 0.38)
  const focal = height * 0.95
  const scale = ((1 - framing.headTop) * height) / (RUNNER_HEIGHT - framing.cutAt)
  return {
    width,
    height,
    horizonY,
    focal,
    playerZ: focal / scale,
    eyeHeight: RUNNER_HEIGHT + (framing.headTop * height - horizonY) / scale,
  }
}

/** Pixels per metre at depth `z`. */
export function scaleAt(camera: Camera, z: number): number {
  return camera.focal / z
}

/** The screen point of a ground point (`y` metres above the ground; 0 = on the ground). */
export function project(camera: Camera, x: number, z: number, y = 0): { x: number; y: number; scale: number } {
  const scale = camera.focal / z
  return { x: camera.width / 2 + x * scale, y: camera.horizonY + (camera.eyeHeight - y) * scale, scale }
}

/** A rival's depth from its gap: ahead (negative gap) is farther away, behind is closer to the camera. */
export function gapToZ(gapMetros: number, playerZ = PLAYER_Z): number {
  return playerZ - gapMetros
}

/**
 * How visible a thing is at depth `z`: it fades in from the horizon (so nothing pops in) and fades
 * out just before the lens.
 */
export function depthAlpha(z: number, near = NEAR_Z * 2.5): number {
  const far = clamp01((FAR_Z - z) / (FAR_Z * 0.25))
  const close = clamp01((z - NEAR_Z) / (near - NEAR_Z))
  return Math.min(far, close)
}

/** How much the trail bends ahead: lateral metres of the trail's centre at depth `z`. */
export function trailCenter(bend: number, z: number): number {
  return bend * 0.0015 * z * z
}

/** The trail's bend for a distance run: a slow, irregular left and right. */
export function bendAt(odometer: number): number {
  return Math.sin(odometer / 90) * 0.6 + Math.sin(odometer / 37 + 1) * 0.25
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
