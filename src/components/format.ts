/** Formats a signed change, e.g. "+5", "−12" or "0". Uses a true minus sign. */
export function formatDelta(value: number): string {
  if (value > 0) return `+${value}`
  if (value < 0) return `−${Math.abs(value)}`
  return '0'
}
