/** "sun 15 Nov, 15:00" in the player's language and time zone. */
export function whenText(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** "in 2 hours" / "in 25 minutes" / "in 3 days". */
export function untilText(iso: string, now: number, locale: string): string {
  const seconds = (Date.parse(iso) - now) / 1000
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (Math.abs(seconds) >= 2 * 86_400) return format.format(Math.round(seconds / 86_400), 'day')
  if (Math.abs(seconds) >= 90 * 60) return format.format(Math.round(seconds / 3600), 'hour')
  return format.format(Math.max(1, Math.round(seconds / 60)), 'minute')
}

/** "1–8" or "25+". */
export function levelRange(min: number, max: number | null): string {
  return max === null ? `${min}+` : `${min}–${max}`
}

/** A countdown as hh:mm:ss (days first when more than a day), never below 00:00:00. */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const days = Math.floor(s / 86_400)
  const two = (n: number) => String(n).padStart(2, '0')
  const hms = `${two(Math.floor((s % 86_400) / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`
  return days > 0 ? `${days}d ${hms}` : hms
}
