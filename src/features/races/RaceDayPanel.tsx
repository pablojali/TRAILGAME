import { useI18n } from '../../i18n/i18n'
import { weekdayLongKey } from '../../i18n/labels'
import { Link } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { getRace, type Race } from '../../domain/races/races'
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
  const { t } = useI18n()

  const scheduled = getScheduledEntry(state)
  if (scheduled && scheduled.id !== entryId) {
    const first = getRace(scheduled.raceId)
    return <p className={styles.muted}>{t('races.queued', { name: first?.name ?? t('races.anotherRace') })}</p>
  }

  if (!isRaceDayToday(state)) {
    const raceWeek = getRaceWeek(state)
    return (
      <>
        {raceWeek > week.number && (
          <p className={styles.warning}>{t('races.injuredMoved', { week: raceWeek })}</p>
        )}
        <p>
          <strong>{t('races.raceDay', { week: raceWeek })}</strong>
          {t('races.todayIs', { day: t(weekdayLongKey(today.day)) })}
        </p>
      </>
    )
  }

  if (state.activeRace?.entryId === entryId) {
    return (
      <>
        <p>
          <strong>{t('races.inProgress')}</strong>
          {t('races.atStation', { station: state.activeRace.splits.length })}
        </p>
        <Link to={`/races/run/${entryId}`} className={`${button.button} ${button.primary} ${button.block}`}>
          {t('races.continue')}
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
      {preview.injured ? t('races.prepareInjury') : t('races.prepare')}
    </Link>
  )
}
