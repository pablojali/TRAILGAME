/** Formats a signed change, e.g. "+5", "−12", "+0.75" or "0". Uses a true minus sign. */
export function formatDelta(value: number): string {
  const rounded = Math.round(value * 100) / 100
  if (rounded > 0) return `+${rounded}`
  if (rounded < 0) return `−${Math.abs(rounded)}`
  return '0'
}

/**
 * Formats Fitness or an attribute with 1 decimal, e.g. "23.8" (owner decision, 30 October 2026:
 * training adds fractions).
 */
export function formatStat(value: number): string {
  return value.toFixed(1)
}

/**
 * Fatigue (and energy, its complement) is always shown as a whole number, never with decimals
 * (owner request, 12 November 2026). The engine keeps its hundredths; only the display rounds.
 */
export function formatFatigue(value: number): string {
  return String(Math.round(value) + 0)
}

/** A Fatigue change as a whole number with a true minus sign, e.g. "+30", "−4" or "0". */
export function formatFatigueDelta(value: number): string {
  return formatDelta(Math.round(value))
}
