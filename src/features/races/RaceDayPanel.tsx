import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { formatDelta } from '../../components/format'
import { getRace, type Race } from '../../domain/races/races'
import { INJURY_FATIGUE_THRESHOLD, INJURY_FITNESS_LOSS, INJURY_REST_DAYS } from '../../domain/training/injury'
import { TRAINING_SESSIONS } from '../../domain/training/sessions'
import { weekdayLong } from '../../domain/training/weekdays'
import { getCurrentDay } from '../../game-engine/gameState'
import { getRaceWeek, getScheduledEntry, isRaceDayToday } from '../../game-engine/raceSchedule'
import { previewRaceDay, type RaceDayError } from '../../game-engine/races'
import styles from './Races.module.css'

const RACE_DAY_ERRORS: Record<RaceDayError, string> = {
  'day-completed': 'Today was already completed. Check the current day and try again.',
  'day-not-current': 'Races take the current day only.',
  'wrong-week': 'The week changed. Check the current day and try again.',
  'unknown-session': 'Something went wrong. Try again.',
  'forced-rest': 'Your runner is injured: racing is locked during forced rest days.',
  'unknown-entry': 'This entry no longer exists.',
  'already-finished': 'This race was already run. Its result is saved.',
  'unknown-race': 'This race does not exist.',
  'race-day': 'Today is race day: start the race.',
  'not-race-day': 'Races are run on Sundays.',
  'not-scheduled': 'Another race is run first.',
}

/**
 * Race day for a pending entry. Races are run on Sundays (owner decision): before Sunday it shows
 * when the race is; on Sunday it starts the race, which takes the day and is applied once.
 */
export function RaceDayPanel({ race, entryId }: { race: Race; entryId: string }) {
  const { state, raceDay } = useCareer()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { week, athlete } = state
  const today = getCurrentDay(week)
  const ref = { week: week.number, dayIndex: week.currentDayIndex }
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

  return (
    <>
      <p>
        <strong>Today is race day.</strong> The race takes today’s training day: {weekdayLong(today.day)}’s{' '}
        {TRAINING_SESSIONS[today.session].label} is not done.
      </p>
      <p className={styles.muted}>
        Fatigue {athlete.fatigue} → {fatigueAfter} ({formatDelta(preview.fatigueChange)}). A race counts as training
        for Fitness decay.
      </p>
      {preview.injured && (
        <p className={styles.warning} role="note">
          Injury warning: Fatigue would reach {fatigueAfter} (above {INJURY_FATIGUE_THRESHOLD}). Racing anyway: no
          XP, −{INJURY_FITNESS_LOSS} Fitness, {INJURY_REST_DAYS} forced rest days. Your result and prize still count.
        </p>
      )}
      {error && (
        <p role="alert" className={styles.warning}>
          {error}
        </p>
      )}
      <button
        type="button"
        className={`${button.button} ${preview.injured ? button.danger : button.primary} ${button.block}`}
        aria-disabled={busy || undefined}
        onClick={() => {
          if (busy) return
          const result = raceDay(ref, entryId)
          if (!result.ok) {
            setError(RACE_DAY_ERRORS[result.error])
            return
          }
          setBusy(true)
          navigate(`/races/results/${entryId}`, {
            state: { levelsGained: result.value.levelAfter - result.value.levelBefore },
          })
        }}
      >
        {preview.injured ? 'Start race anyway — injury' : 'Start race'}
      </button>
    </>
  )
}

