import { RACE_STRATEGY, type AidStop, type Intensity } from '../../domain/races/strategyConfig'
import type { RaceSegment } from '../../game-engine/raceEngine'

/** Intensity names and what each does (Race Engine V1). */
export const INTENSITY_OPTIONS: readonly { id: Intensity; label: string }[] = [
  { id: 'recovery', label: 'Recovery' },
  { id: 'easy', label: 'Easy' },
  { id: 'target', label: 'Target pace' },
  { id: 'hard', label: 'Hard' },
]

export const STOP_OPTIONS: readonly { id: AidStop; label: string }[] = [
  { id: 'quick', label: 'Quick' },
  { id: 'normal', label: 'Normal' },
  { id: 'slow', label: 'Slow' },
]

export const INTENSITY_LABELS = Object.fromEntries(INTENSITY_OPTIONS.map((o) => [o.id, o.label])) as Record<Intensity, string>
export const STOP_LABELS = Object.fromEntries(STOP_OPTIONS.map((o) => [o.id, o.label])) as Record<AidStop, string>

function percent(fraction: number): string {
  return `${Math.round(Math.abs(fraction) * 100)}%`
}

/** e.g. "5% slower, 30% less fatigue". */
export function intensityHint(intensity: Intensity): string {
  const { pace, fatigue } = RACE_STRATEGY.intensity[intensity]
  if (intensity === 'target') return 'Your normal race pace and fatigue.'
  const speed = pace > 1 ? `${percent(pace - 1)} slower` : `${percent(1 - pace)} faster`
  const tiring = fatigue < 1 ? `${percent(1 - fatigue)} less fatigue` : `${percent(fatigue - 1)} more fatigue`
  return `${speed}, ${tiring}. Fatigue built up now slows the segments after.`
}

/** e.g. "2 min, recovers 25% of the race fatigue so far". */
export function stopHint(stop: AidStop): string {
  const { seconds, recovery } = RACE_STRATEGY.stop[stop]
  const time = seconds < 60 ? `${seconds} s` : `${seconds / 60} min`
  return `${time}, recovers about ${percent(recovery)} of the race fatigue so far.`
}

export function stopDuration(stop: AidStop): string {
  const { seconds } = RACE_STRATEGY.stop[stop]
  return seconds < 60 ? `${seconds} s` : `${seconds / 60} min`
}

/** "6.0 km · +450 m / −380 m". */
export function segmentCourseText(segment: RaceSegment): string {
  return `${(segment.distanceM / 1000).toFixed(1)} km · +${Math.round(segment.gainM)} m / −${Math.round(segment.lossM)} m`
}

/** "Mostly climbing (55%), technical descents" style terrain summary. */
export function segmentTerrainText(segment: RaceSegment): string {
  const parts = (
    [
      ['climbing', segment.terrain.climb],
      ['descending', segment.terrain.descent],
      ['runnable', segment.terrain.runnable],
    ] as const
  )
    .filter(([, share]) => share >= 0.005)
    .sort((a, b) => b[1] - a[1])
    .map(([name, share]) => `${name} ${percent(share)}`)
  const technical = segment.technicality > 0 ? ` · technicality ${segment.technicality}/3` : ''
  return `${parts.join(', ')}${technical}`
}

/** A Fatigue change with 1 decimal and a true minus sign, e.g. "+30.1". */
export function formatChange(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(1)}`
}
