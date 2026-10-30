/** A career year is 52 training weeks (owner request, 30 October 2026). */
export const WEEKS_PER_YEAR = 52

export interface CareerProgress {
  /** 1 for weeks 1–52, 2 for weeks 53–104, and so on. */
  year: number
  /** Week within the year, 1–52. */
  weekOfYear: number
  /** Current week of the year as a whole percentage of the year, rounded (week 24 → 46). */
  percent: number
}

/** Where the career's current week sits in its year. */
export function getCareerProgress(weekNumber: number): CareerProgress {
  const index = Math.max(0, weekNumber - 1)
  const weekOfYear = (index % WEEKS_PER_YEAR) + 1
  return {
    year: Math.floor(index / WEEKS_PER_YEAR) + 1,
    weekOfYear,
    percent: Math.round((weekOfYear / WEEKS_PER_YEAR) * 100),
  }
}
