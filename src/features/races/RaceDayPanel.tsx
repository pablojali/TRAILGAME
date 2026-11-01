import { Link } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { getRace, type Race } from '../../domain/races/races'
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
  const { week } = state
  const today = getCurrentDay(week)
  const preview = previewRaceDay(state, race)

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

  // Race day: straight to the preparation (owner request: no explanation here).
  return (
    <Link
      to={`/races/run/${entryId}`}
      className={`${button.button} ${preview.injured ? button.danger : button.primary} ${button.block}`}
    >
      {preview.injured ? 'Prepare race — injury risk' : 'Prepare race'}
    </Link>
  )
}
