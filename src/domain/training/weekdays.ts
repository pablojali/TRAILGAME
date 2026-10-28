/**
 * Labels for the seven days of a training week. The game week is simulated: day 1 is always
 * labelled Monday, whatever the real date is.
 */
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

/** Short label for a 1-based day of the week, e.g. 1 → "Mon". */
export function weekdayShort(day: number): string {
  return WEEKDAY_SHORT[day - 1] ?? `Day ${day}`
}

/** Full label for a 1-based day of the week, e.g. 1 → "Monday". */
export function weekdayLong(day: number): string {
  return WEEKDAY_LONG[day - 1] ?? `Day ${day}`
}
