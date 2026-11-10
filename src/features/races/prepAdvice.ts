import { distanceBand } from '../../domain/races/strategyConfig'
import { INJURY_FATIGUE_THRESHOLD } from '../../domain/training/injury'
import type { Intensity } from '../../domain/races/strategyConfig'

/**
 * The coach before the start (owner request, 10 November 2026): a warning only when the plan and
 * the runner's Fatigue call for one. The first that applies: the plan would end the race injured;
 * a long race started tired with Hard in the plan; a long race started fresh (Hard costs less).
 */
export type PrepAdviceId = 'injuryRisk' | 'tiredLong' | 'freshLong'

export interface PrepAdviceInput {
  distanceKm: number
  /** Career Fatigue now. */
  fatigue: number
  plan: readonly Intensity[]
  /** In-race fatigue at the finish with the plan. */
  fatigueAtFinish: number
}

export function prepAdvice(a: PrepAdviceInput): PrepAdviceId | null {
  if (a.fatigueAtFinish > INJURY_FATIGUE_THRESHOLD) return 'injuryRisk'
  const fresh = distanceBand(a.distanceKm).fresh
  if (!fresh) return null
  const hard = a.plan.includes('hard')
  if (a.fatigue >= fresh.belowFatigue && hard) return 'tiredLong'
  if (a.fatigue < fresh.belowFatigue && !hard) return 'freshLong'
  return null
}
