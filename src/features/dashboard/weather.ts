import { DAYS_PER_WEEK } from '../../game-engine/gameState'
import { WEEKS_PER_YEAR } from '../../domain/training/calendar'

export type WeatherKind = 'sun' | 'partly' | 'cloud' | 'rain'

export interface Weather {
  kind: WeatherKind
  /** Degrees Celsius. */
  temperature: number
  label: string
}

const LABELS: Record<WeatherKind, string> = {
  sun: 'Sunny',
  partly: 'Partly cloudy',
  cloud: 'Cloudy',
  rain: 'Rain',
}

function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * Decorative weather for a game day (owner request, 31 October 2026): the same for the same day,
 * colder in winter weeks and warmer in summer ones (the career year starts in January). It has no
 * effect on training or races. The Dashboard shows the icon only (owner feedback: no temperature).
 */
export function weatherFor(week: number, dayIndex: number): Weather {
  const weekOfYear = ((week - 1) % WEEKS_PER_YEAR) + 1
  const day = (week - 1) * DAYS_PER_WEEK + dayIndex
  const seasonal = 11 - 9 * Math.cos((2 * Math.PI * (weekOfYear - 3)) / WEEKS_PER_YEAR)
  const temperature = Math.round(seasonal + (hash(day) - 0.5) * 6)
  const roll = hash(day + 7919)
  const kind: WeatherKind = roll < 0.4 ? 'sun' : roll < 0.68 ? 'partly' : roll < 0.86 ? 'cloud' : 'rain'
  return { kind, temperature, label: LABELS[kind] }
}
