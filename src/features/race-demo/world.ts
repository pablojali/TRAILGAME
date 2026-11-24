import { FAR_Z, NEAR_Z } from './projection'
import type { RaceViewRunner, RunnerAppearance } from './types'

/** A small seeded random generator, so the scenery is the same each time and tests are stable. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type DecorKind = 'pine' | 'rock' | 'bush' | 'grass' | 'pebble'

/** One piece of scenery, at a fixed place along the course. */
export interface Decor {
  kind: DecorKind
  /** Metres along the course. */
  at: number
  /** Metres from the trail's centre (negative = left). */
  x: number
  /** Height in metres. */
  size: number
  /** Which drawing of its kind (0..VARIANTS-1). */
  variant: number
}

export const VARIANTS = 3

/** How each kind is scattered: how many, how far from the trail, how big, and over what depth. */
const KINDS: Record<DecorKind, { count: number; side: [number, number]; size: [number, number]; span: number }> = {
  pine: { count: 34, side: [1.8, 16], size: [5, 13], span: FAR_Z },
  bush: { count: 18, side: [1.0, 7], size: [0.4, 1.0], span: FAR_Z * 0.6 },
  rock: { count: 14, side: [1.0, 8], size: [0.25, 1.1], span: FAR_Z * 0.6 },
  grass: { count: 14, side: [0.95, 2.4], size: [0.35, 0.8], span: 28 },
  pebble: { count: 26, side: [0, 0.8], size: [0.04, 0.12], span: 24 },
}

/**
 * The scenery as a fixed pool (brief: no objects created or destroyed per frame): each piece runs
 * towards the camera as the runner moves on, and once it has passed it goes back to the horizon
 * with a new place and size.
 */
export class DecorPool {
  readonly items: Decor[] = []
  private readonly random: () => number

  constructor(seed = 7) {
    this.random = seededRandom(seed)
    for (const kind of Object.keys(KINDS) as DecorKind[]) {
      const spec = KINDS[kind]
      for (let i = 0; i < spec.count; i++) {
        const item: Decor = { kind, at: 0, x: 0, size: 0, variant: 0 }
        this.place(item, NEAR_Z + ((i + this.random()) / spec.count) * (spec.span - NEAR_Z))
        this.items.push(item)
      }
    }
  }

  /** Sends pieces that have passed the camera back to the horizon. */
  update(odometer: number): void {
    for (const item of this.items) {
      const span = KINDS[item.kind].span
      if (item.at - odometer < NEAR_Z * 0.5) this.place(item, item.at + span - NEAR_Z)
      // A big jump in distance (a reset) would leave pieces far behind: put them back in range.
      else if (item.at - odometer > span + 1) this.place(item, odometer + NEAR_Z + this.random() * (span - NEAR_Z))
    }
  }

  private place(item: Decor, at: number): void {
    const spec = KINDS[item.kind]
    const side = this.random() < 0.5 ? -1 : 1
    item.at = at
    item.x = side * (spec.side[0] + this.random() * (spec.side[1] - spec.side[0]))
    item.size = spec.size[0] + this.random() * (spec.size[1] - spec.size[0])
    item.variant = Math.floor(this.random() * VARIANTS)
  }
}

/** A rival as drawn: its gap eases towards the state's, and it fades in and out instead of popping. */
export interface ShownRunner {
  id: string
  gap: number
  target: number
  /** 0..1: fades in when added, out when removed. */
  presence: number
  leaving: boolean
  /** Metres from the trail's centre, so passing runners go by on one side. */
  lane: number
  appearance: RunnerAppearance
  gait: { phase: number; intensity: number }
}

/** A stable number from an id. */
export function hashId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return h >>> 0
}

/** The side of the trail a rival runs on: always off the centre line, so it never runs through the player. */
export function laneOf(id: string): number {
  const h = hashId(id)
  return (h & 1 ? 1 : -1) * (0.45 + ((h >>> 1) % 1000) / 1000 * 0.35)
}

const GAP_EASE = 3
const FADE_SECONDS = 0.6

/**
 * Brings the shown rivals in line with the state: new ones fade in (at their gap, usually far ahead
 * or behind the camera, so they come in with the distance), removed ones fade out, and every gap
 * eases towards its target so a jump in the data never makes a runner jump on screen.
 */
export function syncRunners(shown: Map<string, ShownRunner>, runners: readonly RaceViewRunner[], dt: number): void {
  const present = new Set<string>()
  for (const runner of runners) {
    present.add(runner.id)
    const current = shown.get(runner.id)
    if (current) {
      current.target = runner.gapMetros
      current.appearance = runner.appearance
      current.leaving = false
    } else {
      const h = hashId(runner.id)
      shown.set(runner.id, {
        id: runner.id,
        gap: runner.gapMetros,
        target: runner.gapMetros,
        presence: 0,
        leaving: false,
        lane: laneOf(runner.id),
        appearance: runner.appearance,
        gait: { phase: (h % 628) / 100, intensity: 0 },
      })
    }
  }
  const ease = 1 - Math.exp(-dt * GAP_EASE)
  const fade = dt / FADE_SECONDS
  for (const [id, runner] of shown) {
    if (!present.has(id)) runner.leaving = true
    runner.gap += (runner.target - runner.gap) * ease
    runner.presence = Math.max(0, Math.min(1, runner.presence + (runner.leaving ? -fade : fade)))
    if (runner.leaving && runner.presence === 0) shown.delete(id)
  }
}
