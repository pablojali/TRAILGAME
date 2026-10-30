/**
 * Consistency rewards playing every day (owner decision, 30 October 2026): the first game day
 * completed on each new real calendar day (the player's local date) adds this much Consistency.
 * More game days on the same real day add nothing. No training session trains Consistency.
 */
export const DAILY_CONSISTENCY_GAIN = 0.1

/** The player's local calendar date for `now` (epoch ms), e.g. "2026-10-30". */
export function localDayKey(now: number): string {
  const date = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** True for a value saved by `localDayKey`. */
export function isDayKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}
