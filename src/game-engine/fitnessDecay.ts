import type { GameState } from './gameState'

export const DECAY_PERIOD_MS = 24 * 60 * 60 * 1000
/** Fitness lost per complete period without a played day (training, race or Rest). */
export const FITNESS_DECAY_PER_PERIOD = 1
/**
 * Complete periods without playing that cost nothing (owner decision, 30 October 2026): playing
 * once a day, even at the same time every day, never loses Fitness to decay.
 */
export const DECAY_GRACE_PERIODS = 1

export interface DecayResult {
  state: GameState
  /** Complete periods charged by this call (after the grace period). */
  periods: number
  /** Fitness actually lost (stops at 0). */
  fitnessLost: number
}

/**
 * Applies Fitness decay for every complete 24-hour period since the decay reference, up to `now`
 * (epoch ms), except the first one (`DECAY_GRACE_PERIODS`). The reference advances by exactly the
 * periods charged, so the grace period and leftover partial time stay ahead of it and no period is
 * charged twice. It advances even when Fitness is already 0.
 * An invalid or future reference is reset to `now` without decay.
 */
export function applyFitnessDecay(state: GameState, now: number): DecayResult {
  const reference = state.fitnessDecayReference
  if (!Number.isFinite(now)) return { state, periods: 0, fitnessLost: 0 }
  if (!Number.isFinite(reference) || reference > now) {
    return { state: { ...state, fitnessDecayReference: now }, periods: 0, fitnessLost: 0 }
  }

  const periods = Math.max(0, Math.floor((now - reference) / DECAY_PERIOD_MS) - DECAY_GRACE_PERIODS)
  if (periods === 0) return { state, periods: 0, fitnessLost: 0 }

  const fitness = Math.max(0, state.athlete.fitness - periods * FITNESS_DECAY_PER_PERIOD)
  return {
    state: {
      ...state,
      athlete: { ...state.athlete, fitness },
      fitnessDecayReference: reference + periods * DECAY_PERIOD_MS,
    },
    periods,
    fitnessLost: state.athlete.fitness - fitness,
  }
}
