/**
 * Pseudo-3D camera for the race back view. Everything stands on a flat ground; a point at depth `z`
 * metres in front of the camera and `x` metres to the side is drawn at scale = FOCAL / z.
 */

/** Height of the camera above the ground, in metres: above and behind the player's head, looking down the trail. */
export const CAMERA_HEIGHT = 2.17
/** Depth of the player in front of the camera, in metres. */
export const PLAYER_Z = 2.34
/** Closer than this, things are behind the lens and not drawn. */
export const NEAR_Z = 0.35
/** The horizon: things farther than this are not drawn (they fade in before it). */
export const FAR_Z = 140

export interface Camera {
  width: number
  height: number
  /** Screen y of the horizon, in pixels. */
  horizonY: number
  /** Pixels per metre at one metre of depth. */
  focal: number
}

export function makeCamera(width: number, height: number): Camera {
  return { width, height, horizonY: Math.round(height * 0.38), focal: height * 0.95 }
}

/** Pixels per metre at depth `z`. */
export function scaleAt(camera: Camera, z: number): number {
  return camera.focal / z
}

/** The screen point of a ground point (`y` metres above the ground; 0 = on the ground). */
export function project(camera: Camera, x: number, z: number, y = 0): { x: number; y: number; scale: number } {
  const scale = camera.focal / z
  return { x: camera.width / 2 + x * scale, y: camera.horizonY + (CAMERA_HEIGHT - y) * scale, scale }
}

/** A rival's depth from its gap: ahead (negative gap) is farther away, behind is closer to the camera. */
export function gapToZ(gapMetros: number): number {
  return PLAYER_Z - gapMetros
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
