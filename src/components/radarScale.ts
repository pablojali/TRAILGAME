/**
 * The value at the outer ring for a set of values: 50 until a value passes 45, then 10 above the
 * best, in steps of 10. Fixed for a new runner (owner feedback, 31 October 2026: a starting runner
 * should not look strong), so the shape grows as the attributes do.
 */
export function radarScale(values: readonly number[]): number {
  return Math.max(50, Math.ceil((Math.max(...values) + 5) / 10) * 10)
}
