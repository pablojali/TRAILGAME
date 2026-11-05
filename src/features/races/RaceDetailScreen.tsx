import { useEffect, useRef, useState } from 'react'
import { difficultyOf, raceFormat } from '../../domain/races/format'
import { Link, useParams } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { Screen } from '../../components/Screen'
import { getLevel } from '../../domain/athlete/levels'
import { canEnterAtLevel, getGrossPrizes, getMaximumLevel, getMinimumLevel, getRewardMultiplier } from '../../domain/races/access'
import { PRIZE_BANDS } from '../../domain/races/categories'
import { getRace, type Race } from '../../domain/races/races'
import { useI18n, type MessageKey } from '../../i18n/i18n'

type RaceId = `RACE-${'001' | '002' | '003' | '004' | '005' | '006' | '007' | '008' | '009' | '010' | '011' | '012'}`
import { weekdayShortKey } from '../../i18n/labels'
import { getRaceWeek, getScheduledEntry } from '../../game-engine/raceSchedule'
import { getFinishedEntries, getPendingEntry, type RaceEntryError } from '../../game-engine/races'
import type { ServerError } from '../../repositories/supabase/careerOpsClient'
import { RaceDayPanel } from './RaceDayPanel'
import { bandLabel, courseText, feePaidText, ordinal, percentText, raceTimeText } from './raceText'
import styles from './Races.module.css'

const ERRORS: Record<RaceEntryError | ServerError, MessageKey> = {
  offline: 'races.error.offline',
  'server-error': 'races.error.server-error',
  'unknown-race': 'races.error.unknown-race',
  'already-entered': 'races.error.already-entered',
  'level-too-low': 'races.error.level-too-low',
  'level-too-high': 'races.error.level-too-high',
  'race-scheduled': 'races.error.race-scheduled',
}

export function RaceDetailScreen() {
  const { raceId = '' } = useParams()
  const race = getRace(raceId)
  const { t } = useI18n()
  if (!race) {
    return (
      <Screen title={t('races.notFound')} description={t('races.notFoundDescription')}>
        <Link to="/races" className={`${button.button} ${button.secondary}`}>
          {t('races.backToRaces')}
        </Link>
      </Screen>
    )
  }
  return <RaceDetail race={race} />
}

function RaceDetail({ race }: { race: Race }) {
  const { state } = useCareer()
  const level = getLevel(state.athlete.xp)
  const { t, locale } = useI18n()
  const minimum = getMinimumLevel(race)
  const multiplier = getRewardMultiplier(race, level)
  const prizes = getGrossPrizes(race)

  return (
    <Screen
      eyebrow={t('races.formatRace', { format: t(`format.${raceFormat(race)}`), difficulty: difficultyOf(race) })}
      title={race.name}
      description={courseText(race, t, locale)}
      aside={
        <Link to={`/races?difficulty=${difficultyOf(race)}`} className={styles.back}>
          {t('races.allRaces')}
        </Link>
      }
    >
      {/* Tiles that fit the screen (owner request, 1 November 2026): no scrolling, no prize notes. */}
      <dl className={`${styles.tiles} ${styles.grow}`}>
        <div className={styles.tile}>
          <dt>{t('races.distance')}</dt>
          <dd>{race.distanceKm} km</dd>
        </div>
        <div className={styles.tile}>
          <dt>{t('races.elevation')}</dt>
          <dd>{race.elevationGainM.toLocaleString(locale)} m</dd>
        </div>
        <div className={`${styles.tile} ${styles.tileWide}`}>
          <dt>{t('races.terrain')}</dt>
          <dd>{t(`raceTerrain.${race.id as RaceId}`)}</dd>
        </div>
        <div className={styles.tile}>
          <dt>{t('races.recommended')}</dt>
          <dd>
            {race.recommendedLevel} <span className={styles.tileNote}>{t('races.you', { level })}</span>
          </dd>
        </div>
        <div className={styles.tile}>
          <dt>{t('races.entry')}</dt>
          <dd>
            {t('races.free')}{' '}
            <span className={styles.tileNote}>{t('races.levelRange', { min: minimum, max: getMaximumLevel(race) })}</span>
          </dd>
        </div>
        <div className={`${styles.tile} ${styles.tileWide}`}>
          <dt>
            {t('races.prizes')}
            {multiplier.coins < 1 && <span className={styles.warning}>{t('races.atYourLevel', { percent: percentText(multiplier.coins) })}</span>}
          </dt>
          <dd>
            <ul className={styles.prizeRow} aria-label={t('races.prizeList')}>
              {PRIZE_BANDS.map((band, i) => (
                <li key={band.label}>
                  <span>{bandLabel(band, locale)}</span>
                  <span>{prizes[i]}</span>
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <PastResults race={race} />
      </dl>

      <div className={styles.entry}>
        <EntryPanel race={race} />
      </div>
    </Screen>
  )
}

/** The best and latest result of this race, as one tile that opens the latest result. */
function PastResults({ race }: { race: Race }) {
  const { state } = useCareer()
  const { t, locale } = useI18n()
  const finished = getFinishedEntries(state, race.id)
  if (finished.length === 0) return null
  const latest = finished[finished.length - 1]!
  const best = finished.reduce((a, b) => (b.result.position < a.result.position ? b : a))
  return (
    <div className={`${styles.tile} ${styles.tileWide}`}>
      <dt>{t('races.yourResults')}</dt>
      <dd>
        <Link to={`/races/results/${latest.id}`} className={styles.tileLink}>
          <span className={styles.tileValue}>
            {t('races.bestLast', {
              best: ordinal(best.result.position, locale),
              last: ordinal(latest.result.position, locale),
              time: raceTimeText(latest.result.timeS),
            })}
          </span>{' '}
          <span className={styles.tileNote}>
            {t('races.resultsCount', { count: finished.length, week: latest.result.week, day: t(weekdayShortKey(latest.result.day)) })}
          </span>
        </Link>
      </dd>
    </div>
  )
}

/** Entry with an explicit confirmation. Free; open from the race's minimum level. */
function EntryPanel({ race }: { race: Race }) {
  const { state, enterRace } = useCareer()
  const level = getLevel(state.athlete.xp)
  const minimum = getMinimumLevel(race)
  const tooLow = level < minimum
  // Above the window (5 below to 2 above the recommended level): the race no longer takes entries.
  const tooHigh = !tooLow && !canEnterAtLevel(race, level)
  const blocked = tooLow || tooHigh
  const entry = getPendingEntry(state, race.id)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState('')
  // The entry waits for the server; a second tap meanwhile does nothing.
  const [entering, setEntering] = useState(false)
  const pending = useRef(false)
  const [justEntered, setJustEntered] = useState(false)
  const panel = useRef<HTMLHeadingElement>(null)
  const { t } = useI18n()

  // Move focus to the confirmation, and to the result of confirming.
  useEffect(() => {
    if (confirming || justEntered) panel.current?.focus()
  }, [confirming, justEntered])

  if (entry) {
    return (
      <section className={styles.entryBar} aria-label={t('races.yourEntry')}>
        <h2 ref={panel} tabIndex={-1} className={styles.srOnly}>
          {t('races.entryConfirmed')}
        </h2>
        <p role="status" className={styles.entryTitle}>
          {justEntered ? t('races.entryConfirmedNow') : ''}
          {t('races.feePaid', { fee: feePaidText(entry.feePaid, t) })}
        </p>
        <RaceDayPanel race={race} entryId={entry.id} />
      </section>
    )
  }

  const scheduled = getScheduledEntry(state)
  const scheduledRace = scheduled && getRace(scheduled.raceId)
  if (scheduled && scheduledRace) {
    return (
      <section className={`${styles.entryBar} ${styles.entryRow}`} aria-label={t('races.enterThis')}>
        <p className={`${styles.entryText} ${styles.warning}`}>{t('races.alreadyEntered', { name: scheduledRace.name })}</p>
        <Link to={`/races/${scheduledRace.id}`} className={`${button.button} ${button.secondary}`}>
          {t('races.goToRace')}
          <span className={styles.srOnly}> {scheduledRace.name}</span>
        </Link>
      </section>
    )
  }

  // A compact bar under the race details (owner request: the entry must not cover them).
  if (!confirming) {
    return (
      <section className={`${styles.entryBar} ${styles.entryRow}`} aria-label={t('races.enterThis')}>
        <div className={styles.entryText}>
          <p className={styles.entryTitle}>{t('races.sundayWeek', { week: getRaceWeek(state) })}</p>
          <p>{t('races.free')}</p>
          {blocked && (
            <p className={styles.warning} id="race-level">
              {tooLow
                ? t('races.opensAt', { level: minimum, you: level })
                : t('races.closedAbove', { level: getMaximumLevel(race), you: level })}
            </p>
          )}
        </div>
        <button
          type="button"
          className={`${button.button} ${button.primary}`}
          aria-disabled={blocked || undefined}
          aria-describedby={blocked ? 'race-level' : undefined}
          onClick={() => {
            if (blocked) return
            setMessage('')
            setConfirming(true)
          }}
        >
          {t('races.enter')}
        </button>
      </section>
    )
  }

  return (
    <section className={styles.entryBar} aria-label={t('races.confirmEntry')}>
      <h2 ref={panel} tabIndex={-1} className={styles.srOnly}>
        {t('races.confirmEntryTo', { name: race.name })}
      </h2>
      <p>
        <strong>{t('races.freeEntry')}</strong>
        {t('races.balanceStays', { coins: t('common.coins', { count: state.coins }) })}
      </p>
      {message && (
        <p role="alert" className={styles.warning}>
          {message}
        </p>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={`${button.button} ${button.secondary}`}
          aria-disabled={entering || undefined}
          onClick={() => !entering && setConfirming(false)}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className={`${button.button} ${button.primary} ${styles.grow}`}
          aria-disabled={entering || undefined}
          onClick={async () => {
            if (pending.current) return
            pending.current = true
            setEntering(true)
            setMessage('')
            const error = await enterRace(race.id)
            pending.current = false
            setEntering(false)
            if (error) {
              setMessage(t(ERRORS[error]))
              return
            }
            setJustEntered(true)
            setConfirming(false)
          }}
        >
          {entering ? t('races.entering') : t('races.confirmFree')}
        </button>
      </div>
    </section>
  )
}
