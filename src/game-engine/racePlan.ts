import type { Intensity } from '../domain/races/strategyConfig'
import { makeStop, runSegment, type RaceProgress, type StepContext } from './raceEngine'

/**
 * Automatic race strategy (owner request, 10 November 2026): the player picks a style and the game
 * proposes the intensity of every segment left, so long races need no segment-by-segment setup.
 * The player can still change any segment.
 */
export type RaceStyle = 'conservative' | 'balanced' | 'aggressive'
export const RACE_STYLES: readonly RaceStyle[] = ['conservative', 'balanced', 'aggressive']

/**
 * The intensities each style chooses from: Conservative never goes Hard, Balanced never drops to
 * Recovery, Aggressive uses them all.
 */
export const STYLE_INTENSITIES: Record<RaceStyle, readonly Intensity[]> = {
  conservative: ['recovery', 'easy', 'target'],
  balanced: ['easy', 'target', 'hard'],
  aggressive: ['recovery', 'easy', 'target', 'hard'],
}

/**
 * What fatigue at the finish is worth to each style: 1% more fatigue gained (against Target pace
 * throughout) costs as much as this share of 1% of the time left. Aggressive only looks at the time.
 */
export const STYLE_FATIGUE_COST: Record<RaceStyle, number> = {
  conservative: 0.1,
  balanced: 0.02,
  aggressive: 0,
}

/** Runs the segments after `start` with these intensities and Normal stops between them. */
export function runRest(ctx: StepContext, start: RaceProgress, intensities: readonly Intensity[]): RaceProgress {
  let progress = start
  for (const intensity of intensities) {
    if (progress.splits.length > 0) progress = makeStop(ctx, progress, 'normal')
    progress = runSegment(ctx, progress, intensity)
  }
  return progress
}

/**
 * The intensities of the segments left after `start`, best for the style: the finish time plus the
 * fatigue at the finish weighted by the style, with Normal stops. `fixed` holds the player's own
 * choices (by position in the segments left), which the plan keeps. Coordinate descent from Target
 * pace: each segment in turn takes the intensity that scores best given the others, until no
 * segment changes (a few passes; cheap for up to 20 segments).
 */
export function planRest(
  ctx: StepContext,
  start: RaceProgress,
  style: RaceStyle,
  fixed: readonly (Intensity | null | undefined)[] = [],
): Intensity[] {
  const left = ctx.field.segments.length - start.splits.length
  if (left <= 0) return []
  const plan: Intensity[] = Array.from({ length: left }, (_, i) => fixed[i] ?? 'target')
  const base = runRest(ctx, start, plan)
  const time = base.elapsedS - start.elapsedS
  const gain = Math.max(1, base.fatigue - start.fatigue)
  const cost = (STYLE_FATIGUE_COST[style] * time) / gain
  const score = (candidate: readonly Intensity[]) => {
    const end = runRest(ctx, start, candidate)
    return end.elapsedS + cost * end.fatigue
  }
  let best = score(plan)
  for (let pass = 0; pass < 4; pass++) {
    let changed = false
    for (let i = 0; i < left; i++) {
      if (fixed[i]) continue
      for (const intensity of STYLE_INTENSITIES[style]) {
        if (intensity === plan[i]) continue
        const candidate = plan.slice()
        candidate[i] = intensity
        const value = score(candidate)
        // A clear gain only, so near ties keep the steadier choice already there.
        if (value < best - 0.5) {
          best = value
          plan[i] = intensity
          changed = true
        }
      }
    }
    if (!changed) break
  }
  return plan
}
