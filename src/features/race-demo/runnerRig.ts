/**
 * The runner's animation, separate from how it is drawn: a pose from a stride phase. The drawing
 * (drawRunner.ts) only reads the pose, so a bone rig (DragonBones or other) can replace this file later
 * without touching the renderer.
 *
 * Seen from behind: the body bobs twice per stride, the shoulders roll, the arms swing (the hands
 * rise and fall) and the feet kick up in turn.
 */

export interface LegPose {
  /** 0 = foot on the ground, 1 = heel kicked up. */
  lift: number
}

export interface Pose {
  /** Vertical bounce, metres. */
  bob: number
  /** Side-to-side shift of the hips, metres. */
  sway: number
  /** Shoulder roll, radians (positive = right shoulder down). */
  roll: number
  /** Arm swing, -1..1 (positive = hand forward, seen as raised). */
  armL: number
  armR: number
  legL: LegPose
  legR: LegPose
  /**
   * Where the stride is, 0..1, with 0 at the drawn frame 1 (left fist high), or null when standing.
   * The art's frames (docs/RACE_BACK_VIEW_DEMO.md) share the cycle evenly; `frameIndex` picks one.
   * The art keeps the trunk still; the bob and sway above move the whole picture.
   */
  stride: number | null
}

export const STANDING: Pose = { bob: 0, sway: 0, roll: 0, armL: 0, armR: 0, legL: { lift: 0 }, legR: { lift: 0 }, stride: null }

/** The stride (0..1) at a phase: frame 1 (left fist high) at a quarter of the cycle, as the coded arms. */
export function strideAt(phase: number): number {
  const t = (phase - Math.PI / 2) / (2 * Math.PI)
  return t - Math.floor(t)
}

/**
 * The frame (0..count-1) to show for a stride: the nearest one, as they share the cycle evenly.
 * Standing shows the fists-at-the-waist frame, a quarter of the cycle after the fist high.
 */
export function frameIndex(stride: number | null, count: number): number {
  if (count <= 1) return 0
  const at = stride ?? 0.25
  return Math.round(at * count) % count
}

/** Stride cycles per second at a speed (two steps per cycle); 0 when standing. */
export function strideHz(speed: number): number {
  if (speed <= 0.05) return 0
  return Math.min(1.75, 1.2 + speed * 0.1)
}

/** How much the runner moves at a speed, 0 (standing) to 1 (running hard). */
export function intensityAt(speed: number): number {
  return Math.min(1, speed / 3.5)
}

/** The pose at a stride phase (radians) and intensity (0..1). */
export function runnerPose(phase: number, intensity: number): Pose {
  const s = Math.sin(phase)
  return {
    bob: 0.045 * intensity * Math.abs(s),
    sway: 0.018 * intensity * s,
    roll: 0.07 * intensity * s,
    armL: intensity * s,
    armR: -intensity * s,
    legL: { lift: intensity * Math.max(0, -s) },
    legR: { lift: intensity * Math.max(0, s) },
    stride: intensity < 0.05 ? null : strideAt(phase),
  }
}

/** Moves a runner's animation on by `dt` seconds: its stride phase and how hard it moves eases with speed. */
export function advanceGait(gait: { phase: number; intensity: number }, speed: number, dt: number): void {
  gait.phase = (gait.phase + 2 * Math.PI * strideHz(speed) * dt) % (2 * Math.PI)
  const target = intensityAt(speed)
  gait.intensity += (target - gait.intensity) * (1 - Math.exp(-dt * 5))
}
