import { intensityEffect, type AidStop, type Intensity } from '../../domain/races/strategyConfig'
import type { MessageKey, Translate } from '../../i18n/i18n'
import type { RaceSegment } from '../../game-engine/raceEngine'

/** Intensities and stops in order, with the keys of their names (Race Engine V1). */
export const INTENSITY_IDS: readonly Intensity[] = ['recovery', 'easy', 'target', 'hard']
export const STOP_IDS: readonly AidStop[] = ['quick', 'normal', 'slow']

export const intensityKey = (intensity: Intensity): MessageKey => `race.intensity.${intensity}`
export const stopKey = (stop: AidStop): MessageKey => `race.stop.${stop}`

/** The intensity chips in the player's language. */
export function intensityOptions(t: Translate): { id: Intensity; label: string }[] {
  return INTENSITY_IDS.map((id) => ({ id, label: t(intensityKey(id)) }))
}

function percent(fraction: number): string {
  return `${Math.round(Math.abs(fraction) * 100)}%`
}

/** e.g. "5% slower, 30% less fatigue". */
export function intensityHint(intensity: Intensity, t: Translate, distanceKm: number): string {
  // The race's distance band sets the intensities (owner request, 10 November 2026).
  const { pace, fatigue } = intensityEffect(distanceKm, intensity)
  if (intensity === 'target') return t('race.hint.target')
  const speed = pace > 1 ? t('race.hint.slower', { percent: percent(pace - 1) }) : t('race.hint.faster', { percent: percent(1 - pace) })
  const tiring =
    fatigue < 1 ? t('race.hint.lessFatigue', { percent: percent(1 - fatigue) }) : t('race.hint.moreFatigue', { percent: percent(fatigue - 1) })
  return t('race.hint.other', { speed, tiring })
}

/** "45 s", "2 min", "2:30 min". */
export function stopDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`
  const rest = seconds % 60
  return rest === 0 ? `${seconds / 60} min` : `${Math.floor(seconds / 60)}:${String(rest).padStart(2, '0')} min`
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
  const technical = segment.technicality > 0 ? ` · technicality ${segment.technicality}/5` : ''
  return `${parts.join(', ')}${technical}`
}

/** A Fatigue change with 1 decimal and a true minus sign, e.g. "+30.1". */
export function formatChange(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(1)}`
}
