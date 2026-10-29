import { DAYS_PER_WEEK, type GameState, type PendingRaceEntry } from './gameState'

/**
 * Races are run on Sundays only (owner decision, 29 October 2026): one race per week, on the last
 * day of the training week. Entering a race puts it on the coming Sunday.
 */
export const RACE_DAY_INDEX = DAYS_PER_WEEK - 1

/** The entry raced on the coming Sunday: the oldest pending one. */
export function getScheduledEntry(state: GameState): PendingRaceEntry | undefined {
  return state.raceEntries.find((entry): entry is PendingRaceEntry => entry.status === 'pending')
}

/**
 * Week of the coming race Sunday. When Sunday is a forced Rest day, the race moves to the next
 * Sunday (the fee is kept).
 */
export function getRaceWeek(state: GameState): number {
  const sundayIsForcedRest = state.week.currentDayIndex + state.forcedRestDays > RACE_DAY_INDEX
  return state.week.number + (sundayIsForcedRest ? 1 : 0)
}

/** True when today is Sunday, not a forced Rest day, and a race is scheduled: today is race day. */
export function isRaceDayToday(state: GameState): boolean {
  return (
    state.week.currentDayIndex === RACE_DAY_INDEX && state.forcedRestDays === 0 && getScheduledEntry(state) !== undefined
  )
}
