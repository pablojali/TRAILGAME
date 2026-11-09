import type { AidStop, Intensity } from '../../domain/races/strategyConfig'
import type { RaceSegment } from '../../game-engine/raceEngine'

/**
 * What the aid station tells the player about the road ahead (owner request, 9 November 2026): the
 * kind of the next segment, how demanding it is, and a coach's tip only when it matters.
 */
export type SegmentKind = 'climb' | 'technical-descent' | 'descent' | 'runnable' | 'mixed'
export type Demand = 'low' | 'medium' | 'high'

/** The next segment in one word, from its terrain (shares of its distance) and the race's technicality. */
export function segmentKind(segment: RaceSegment): SegmentKind {
  const { climb, descent, runnable } = segment.terrain
  if (climb >= 0.5) return 'climb'
  if (descent >= 0.45) return segment.technicality >= 3 ? 'technical-descent' : 'descent'
  if (runnable >= 0.6) return 'runnable'
  return 'mixed'
}

/** How hard the segment is: its effort-km per km (climbing counts, descents need technique). */
export function segmentDemand(segment: RaceSegment): Demand {
  const perKm = segment.effortKm / (segment.distanceM / 1000) + (segment.terrain.descent * segment.technicality) / 10
  return perKm >= 1.55 ? 'high' : perKm >= 1.2 ? 'medium' : 'low'
}

export type AdviceId = 'lowEnergy' | 'climbHard' | 'technicalDescent' | 'finalPush' | 'closeAhead' | 'closeBehind'

export interface AdviceInput {
  /** 0–100 now. */
  energy: number
  kind: SegmentKind
  intensity: Intensity
  stop: AidStop
  lastSegment: boolean
  gapAheadS: number | null
  gapBehindS: number | null
  /** The runner's Technical with the gear worn. */
  technical: number
}

/**
 * The coach speaks only when something matters (owner request: not all the time): low energy, a
 * big climb or a technical descent taken too hard, the last segment with energy left, a rival close
 * ahead, or a slow stop with a rival close behind. The first that applies, in that order.
 */
export function aidAdvice(a: AdviceInput): AdviceId | null {
  const pushing = a.intensity === 'hard' || a.intensity === 'target'
  if (a.energy < 25 && pushing) return 'lowEnergy'
  if (a.kind === 'climb' && a.intensity === 'hard' && !a.lastSegment) return 'climbHard'
  if (a.kind === 'technical-descent' && a.technical < 40 && a.intensity === 'hard') return 'technicalDescent'
  if (a.lastSegment && a.energy >= 50 && a.intensity !== 'hard') return 'finalPush'
  if (!a.lastSegment && a.gapAheadS !== null && a.gapAheadS <= 30 && a.energy >= 45 && a.intensity !== 'hard') return 'closeAhead'
  if (a.gapBehindS !== null && a.gapBehindS <= 20 && a.stop === 'slow') return 'closeBehind'
  return null
}

/** "≈ +1:20" / "≈ −40 s" / "≈ igual": a time difference rounded for an estimate. */
export function roughDelta(seconds: number): { sign: '+' | '−' | ''; text: string } {
  const abs = Math.abs(seconds)
  if (abs < 10) return { sign: '', text: '' }
  const sign = seconds > 0 ? '+' : '−'
  if (abs < 60) return { sign, text: `${Math.round(abs / 10) * 10} s` }
  const rounded = Math.round(abs / 10) * 10
  return { sign, text: `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}` }
}
