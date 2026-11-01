import { Link } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { formatDelta, formatStat } from '../../components/format'
import { getRace, type Race } from '../../domain/races/races'
import { INJURY_FATIGUE_THRESHOLD, INJURY_FITNESS_LOSS, INJURY_REST_DAYS } from '../../domain/training/injury'
import { TRAINING_SESSIONS } from '../../domain/training/sessions'
import { weekdayLong } from '../../domain/training/weekdays'
import { getCurrentDay } from '../../game-engine/gameState'
import { getRaceWeek, getScheduledEntry, isRaceDayToday } from '../../game-engine/raceSchedule'
import { previewRaceDay } from '../../game-engine/races'
import styles from './Races.module.css'

/**
 * Race day for a pending entry. Races are run on Sundays (owner decision): before Sunday it shows
 * when the race is; on Sunday it leads to the race preparation, or back to the race in progress
 * (Race Engine V1: the race is run segment by segment on its own screen).
 */
export function RaceDayPanel({ race, entryId }: { race: Race; entryId: string }) {
  const { state } = useCareer()
  const { week, athlete } = state
  const today = getCurrentDay(week)
  const preview = previewRaceDay(state, race)
  const fatigueAfter = athlete.fatigue + preview.fatigueChange

  const scheduled = getScheduledEntry(state)
  if (scheduled && scheduled.id !== entryId) {
    const first = getRace(scheduled.raceId)
    return <p className={styles.muted}>Queued: {first?.name ?? 'another race'} is run first, on Sunday.</p>
  }

  if (!isRaceDayToday(state)) {
    const raceWeek = getRaceWeek(state)
    return (
      <>
        {raceWeek > week.number && (
          <p className={styles.warning}>
            Injured: Sunday is a forced rest day, so the race moves to Sunday of week {raceWeek}. Your entry is kept.
          </p>
        )}
        <p>
          <strong>Race day: Sunday, week {raceWeek}.</strong> Today is {weekdayLong(today.day)}. Train until then.
        </p>
      </>
    )
  }

  if (state.activeRace?.entryId === entryId) {
    return (
      <>
        <p>
          <strong>Race in progress.</strong> You are at aid station {state.activeRace.splits.length}.
        </p>
        <Link to={`/races/run/${entryId}`} className={`${button.button} ${button.primary} ${button.block}`}>
          Continue race
        </Link>
      </>
    )
  }

  return (
    <>
      <p>
        <strong>Today is race day.</strong> The race takes today’s training day: {weekdayLong(today.day)}’s{' '}
        {TRAINING_SESSIONS[today.session].label} is not done.
      </p>
      <p className={styles.muted}>
        At Target pace with Normal stops: Fatigue {formatStat(athlete.fatigue)} → {formatStat(fatigueAfter)} (
        {formatDelta(preview.fatigueChange)}). A race counts as training for Fitness decay.
      </p>
      {preview.injured && (
        <p className={styles.warning} role="note">
          Injury warning: Fatigue would reach {formatStat(fatigueAfter)} (above {INJURY_FATIGUE_THRESHOLD}). Racing
          anyway: −{INJURY_FITNESS_LOSS} Fitness, {INJURY_REST_DAYS} forced rest days. Your result and prize still
          count. Easier segments and longer stops keep Fatigue down.
        </p>
      )}
      <Link
        to={`/races/run/${entryId}`}
        className={`${button.button} ${preview.injured ? button.danger : button.primary} ${button.block}`}
      >
        Prepare race
      </Link>
    </>
  )
}
