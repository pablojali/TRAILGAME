import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { Screen } from '../../components/Screen'
import { getLevel } from '../../domain/athlete/levels'
import { formatCoins } from '../../domain/economy/coins'
import { getGrossPrizes, getMinimumLevel, getRewardMultiplier } from '../../domain/races/access'
import { PRIZE_BANDS, RACE_CATEGORY_CONFIG } from '../../domain/races/categories'
import { getRace, type Race } from '../../domain/races/races'
import { weekdayShort } from '../../domain/training/weekdays'
import { getRaceWeek, getScheduledEntry } from '../../game-engine/raceSchedule'
import { getFinishedEntries, getPendingEntry, type RaceEntryError } from '../../game-engine/races'
import type { ServerError } from '../../repositories/supabase/careerOpsClient'
import { RaceDayPanel } from './RaceDayPanel'
import { courseText, feePaidText, ordinal, percentText, raceTimeText } from './raceText'
import styles from './Races.module.css'

const ERRORS: Record<RaceEntryError | ServerError, string> = {
  offline: 'Could not reach the server, so you were not entered. Check your connection and try again.',
  'server-error': 'The server could not complete the entry, so you were not entered. Try again.',
  'unknown-race': 'This race does not exist.',
  'already-entered': 'You have already entered this race.',
  'level-too-low': 'Your level is too low for this race. Train to reach its minimum level.',
  'race-scheduled': 'You already have a race this Sunday. Races are one per week.',
}

export function RaceDetailScreen() {
  const { raceId = '' } = useParams()
  const race = getRace(raceId)
  if (!race) {
    return (
      <Screen title="Race not found" description="This race is not in the catalog.">
        <Link to="/races" className={`${button.button} ${button.secondary}`}>
          Back to races
        </Link>
      </Screen>
    )
  }
  return <RaceDetail race={race} />
}

function RaceDetail({ race }: { race: Race }) {
  const { state } = useCareer()
  const level = getLevel(state.athlete.xp)
  const category = RACE_CATEGORY_CONFIG[race.category]
  const minimum = getMinimumLevel(race)
  const multiplier = getRewardMultiplier(race, level)
  const prizes = getGrossPrizes(race)

  return (
    <Screen
      eyebrow={`${category.label} race`}
      title={race.name}
      description={courseText(race)}
      aside={
        <Link to={`/races?category=${race.category}`} className={styles.back}>
          ← All races
        </Link>
      }
    >
      {/* Tiles that fit the screen (owner request, 1 November 2026): no scrolling, no prize notes. */}
      <dl className={`${styles.tiles} ${styles.grow}`}>
        <div className={styles.tile}>
          <dt>Distance</dt>
          <dd>{race.distanceKm} km</dd>
        </div>
        <div className={styles.tile}>
          <dt>Elevation gain</dt>
          <dd>{race.elevationGainM.toLocaleString('en-US')} m</dd>
        </div>
        <div className={`${styles.tile} ${styles.tileWide}`}>
          <dt>Terrain</dt>
          <dd>{race.terrain}</dd>
        </div>
        <div className={styles.tile}>
          <dt>Recommended level</dt>
          <dd>
            {race.recommendedLevel} <span className={styles.tileNote}>(you: {level})</span>
          </dd>
        </div>
        <div className={styles.tile}>
          <dt>Entry</dt>
          <dd>
            Free <span className={styles.tileNote}>· from level {minimum}</span>
          </dd>
        </div>
        <div className={`${styles.tile} ${styles.tileWide}`}>
          <dt>
            Prizes{multiplier.coins < 1 && <span className={styles.warning}> · {percentText(multiplier.coins)} at your level</span>}
          </dt>
          <dd>
            <ul className={styles.prizeRow} aria-label="Gross coin prizes by finishing position">
              {PRIZE_BANDS.map((band, i) => (
                <li key={band.label}>
                  <span>{band.label.replace(' or lower', '+')}</span>
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
  const finished = getFinishedEntries(state, race.id)
  if (finished.length === 0) return null
  const latest = finished[finished.length - 1]!
  const best = finished.reduce((a, b) => (b.result.position < a.result.position ? b : a))
  return (
    <div className={`${styles.tile} ${styles.tileWide}`}>
      <dt>Your results</dt>
      <dd>
        <Link to={`/races/results/${latest.id}`} className={styles.tileLink}>
          <span className={styles.tileValue}>
            Best {ordinal(best.result.position)} · last {ordinal(latest.result.position)} in{' '}
            {raceTimeText(latest.result.timeS)}
          </span>{' '}
          <span className={styles.tileNote}>
            · {finished.length} {finished.length === 1 ? 'race' : 'races'} · Week {latest.result.week},{' '}
            {weekdayShort(latest.result.day)} ›
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
  const entry = getPendingEntry(state, race.id)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState('')
  // The entry waits for the server; a second tap meanwhile does nothing.
  const [entering, setEntering] = useState(false)
  const pending = useRef(false)
  const [justEntered, setJustEntered] = useState(false)
  const panel = useRef<HTMLHeadingElement>(null)

  // Move focus to the confirmation, and to the result of confirming.
  useEffect(() => {
    if (confirming || justEntered) panel.current?.focus()
  }, [confirming, justEntered])

  if (entry) {
    return (
      <section className={styles.entryBar} aria-label="Your entry">
        <h2 ref={panel} tabIndex={-1} className={styles.srOnly}>
          Race entry confirmed
        </h2>
        <p role="status" className={styles.entryTitle}>
          {justEntered ? 'Entry confirmed. ' : ''}
          Entry fee paid: {feePaidText(entry.feePaid)}.
        </p>
        <RaceDayPanel race={race} entryId={entry.id} />
      </section>
    )
  }

  const scheduled = getScheduledEntry(state)
  const scheduledRace = scheduled && getRace(scheduled.raceId)
  if (scheduled && scheduledRace) {
    return (
      <section className={`${styles.entryBar} ${styles.entryRow}`} aria-label="Enter this race">
        <p className={`${styles.entryText} ${styles.warning}`}>
          You are already entered in {scheduledRace.name} on Sunday. One race per week.
        </p>
        <Link to={`/races/${scheduledRace.id}`} className={`${button.button} ${button.secondary}`}>
          Go to race<span className={styles.srOnly}> {scheduledRace.name}</span>
        </Link>
      </section>
    )
  }

  // A compact bar under the race details (owner request: the entry must not cover them).
  if (!confirming) {
    return (
      <section className={`${styles.entryBar} ${styles.entryRow}`} aria-label="Enter this race">
        <div className={styles.entryText}>
          <p className={styles.entryTitle}>Sunday, week {getRaceWeek(state)}</p>
          <p>Free</p>
          {tooLow && (
            <p className={styles.warning} id="race-level">
              Opens at level {minimum} (you: {level}).
            </p>
          )}
        </div>
        <button
          type="button"
          className={`${button.button} ${button.primary}`}
          aria-disabled={tooLow || undefined}
          aria-describedby={tooLow ? 'race-level' : undefined}
          onClick={() => {
            if (tooLow) return
            setMessage('')
            setConfirming(true)
          }}
        >
          Enter race
        </button>
      </section>
    )
  }

  return (
    <section className={styles.entryBar} aria-label="Confirm entry">
      <h2 ref={panel} tabIndex={-1} className={styles.srOnly}>
        Confirm entry to {race.name}
      </h2>
      <p>
        <strong>Free entry.</strong> Balance stays {formatCoins(state.coins)}.
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
          Cancel
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
              setMessage(ERRORS[error])
              return
            }
            setJustEntered(true)
            setConfirming(false)
          }}
        >
          {entering ? 'Entering…' : 'Confirm free entry'}
        </button>
      </div>
    </section>
  )
}
