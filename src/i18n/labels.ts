import type { MessageKey } from './i18n'

/** Keys of the week's day names for a 1-based day (the game week always starts on Monday). */
export function weekdayLongKey(day: number): MessageKey {
  return `weekday.long.${Math.min(7, Math.max(1, day)) as 1 | 2 | 3 | 4 | 5 | 6 | 7}`
}

export function weekdayShortKey(day: number): MessageKey {
  return `weekday.short.${Math.min(7, Math.max(1, day)) as 1 | 2 | 3 | 4 | 5 | 6 | 7}`
}
