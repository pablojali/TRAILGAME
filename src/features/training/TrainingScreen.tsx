import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { formatDelta } from '../../components/format'
import { appearanceUnlocks } from '../../domain/athlete/appearance'
import { INJURY_FATIGUE_THRESHOLD, INJURY_FITNESS_LOSS, INJURY_REST_DAYS } from '../../domain/training/injury'
import { getRestFatigueDelta } from '../../domain/training/recovery'
import { isSessionType, SESSION_TYPES, TRAINING_SESSIONS, type SessionType } from '../../domain/training/sessions'
import { weekdayLong, weekdayShort } from '../../domain/training/weekdays'
import {
  getDayStatus,
  type DayOutcome,
  type DayStatus,
  type FinishedRaceEntry,
  type GameState,
  type TrainingDay,
} from '../../game-engine/gameState'
import { getRace, type Race } from '../../domain/races/races'
import { getRaceWeek, getScheduledEntry, RACE_DAY_INDEX } from '../../game-engine/raceSchedule'
import { getEntry } from '../../game-engine/races'
import { RaceDayPanel } from '../races/RaceDayPanel'
import { previewSession, type DayRef, type ExecutionResult, type TrainingError } from '../../game-engine/training'
import { ordinal, raceTimeText } from '../races/raceText'
import { SessionIcon } from './SessionIcon'
import styles from './TrainingScreen.module.css'

/** The race scheduled on this day (this week's Sunday), if any and not yet run. */
function scheduledRace(state: GameState, index: number): { race: Race; entryId: string } | null {
  if (index !== RACE_DAY_INDEX || state.week.days[index]?.outcome) return null
  if (getRaceWeek(state) !== state.week.number) return null
  const entry = getScheduledEntry(state)
  const race = entry && getRace(entry.raceId)
  return entry && race ? { race, entryId: entry.id } : null
}

/** The race a completed day was used for, if any. */
function dayRace(state: GameState, day: TrainingDay): { race: Race; entry: FinishedRaceEntry } | null {
  const entry = day.outcome?.raceEntryId ? getEntry(state, day.outcome.raceEntryId) : undefined
  const race = entry && getRace(entry.raceId)
  return entry?.status === 'finished' && race ? { race, entry } : null
}

const STATUS_LABELS: Record<DayStatus, string> = {
  completed: 'Completed',
  current: 'Today',
  upcoming: 'Planned',
}

const ERROR_MESSAGES: Record<TrainingError, string> = {
  'day-completed': 'This day has already been completed.',
  'day-not-current': 'Only today’s session can be changed or completed.',
  'wrong-week': 'The training week has changed. Review today’s session and try again.',
  'unknown-session': 'That session is not available.',
  'forced-rest': 'Your runner is injured: today must be a rest day.',
  'race-day': 'Today is race day: start the race below.',
}

/**
 * After completing a day the button stays on screen for the next day, so a short pause stops an
 * accidental double tap from completing two days.
 */
const COMPLETE_COOLDOWN_MS = 700

function effectsText(outcome: DayOutcome) {
  return `XP ${formatDelta(outcome.xpGained)} · Fitness ${formatDelta(outcome.fitnessChange)} · Fatigue ${formatDelta(outcome.fatigueChange)}`
}

/** Base effects of a planned session (the real result depends on the athlete on that day). */
/** A future day's planned effects, before clamping (Rest includes the athlete's Recovery bonus). */
function plannedEffects(state: GameState, session: SessionType): DayOutcome {
  const rules = TRAINING_SESSIONS[session]
  const fatigueChange = session === 'rest' ? getRestFatigueDelta(state.athlete) : rules.fatigueDelta
  return { xpGained: rules.xp, fitnessChange: rules.fitnessDelta, fatigueChange }
}

export function TrainingScreen() {
  const { state, lastExecution, planSession, executeDay } = useCareer()
  const { week } = state
  const [selected, setSelected] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(false)

  useEffect(() => {
    if (!cooldown) return
    const timer = window.setTimeout(() => setCooldown(false), COMPLETE_COOLDOWN_MS)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  // The selection follows today unless the player picked another day of this week.
  const selectedIndex = selected ?? week.currentDayIndex
  const ref: DayRef = { week: week.number, dayIndex: week.currentDayIndex }

  return (
    <section className={styles.screen} aria-labelledby="training-title">
      <title>Training · Trail Manager</title>
      <header className={styles.header}>
        <h1 id="training-title" className={styles.title}>
          Training
        </h1>
        <p className={styles.eyebrow}>Week {week.number}</p>
      </header>

      <ol className={styles.strip} aria-label={`Week ${week.number} plan`}>
        {week.days.map((day, index) => {
          const dayStatus = getDayStatus(week, index)
          const forced = index >= week.currentDayIndex && index < week.currentDayIndex + state.forcedRestDays
          const raced = dayRace(state, day)
          const upcomingRace = scheduledRace(state, index)
          const raceName = raced?.race.name ?? upcomingRace?.race.name
          return (
            <li key={day.day}>
              <button
                type="button"
                className={`${styles.day} ${styles[dayStatus]} ${index === selectedIndex ? styles.selected : ''}`}
                aria-pressed={index === selectedIndex}
                aria-current={dayStatus === 'current' ? 'date' : undefined}
                aria-controls="day-detail"
                aria-label={`${weekdayLong(day.day)}, ${raceName ? `Race: ${raceName}` : TRAINING_SESSIONS[day.session].label}, ${
                  day.outcome?.injured ? 'injured' : STATUS_LABELS[dayStatus].toLowerCase()
                }${forced ? ', forced rest' : ''}`}
                onClick={() => {
                  setError(null)
                  setSelected(index === week.currentDayIndex ? null : index)
                }}
              >
                <span className={styles.dayName}>{weekdayShort(day.day)}</span>
                <SessionIcon session={raceName ? 'race' : day.session} size={22} />
                <span className={styles.dayMark} aria-hidden="true">
                  {day.outcome ? (day.outcome.injured ? '!' : '✓') : forced ? '+' : dayStatus === 'current' ? '•' : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <DayDetail
        state={state}
        index={selectedIndex}
        error={error}
        cooldown={cooldown}
        onPlan={(session) => {
          const failure = planSession(ref, session)
          setError(failure && ERROR_MESSAGES[failure])
        }}
        onComplete={() => {
          if (cooldown) return
          const failure = executeDay(ref)
          setError(failure && ERROR_MESSAGES[failure])
          if (!failure) {
            setSelected(null)
            setCooldown(true)
          }
        }}
      />

      <div role="status" className={styles.feedbackRegion}>
        {lastExecution && <ExecutionFeedback result={lastExecution} />}
      </div>
    </section>
  )
}

interface DayDetailProps {
  state: GameState
  index: number
  error: string | null
  cooldown: boolean
  onPlan(session: SessionType): void
  onComplete(): void
}

/** The selected day's full detail, shown directly under the week strip. */
function DayDetail({ state, index, error, cooldown, onPlan, onComplete }: DayDetailProps) {
  const { week } = state
  const day = week.days[index]!
  const status = getDayStatus(week, index)
  const session = TRAINING_SESSIONS[day.session]
  const selectId = useId()
  const raced = dayRace(state, day)
  const upcomingRace = scheduledRace(state, index)

  return (
    <section id="day-detail" className={styles.detail} aria-labelledby="day-detail-title">
      <div className={styles.detailTop}>
        {/* For today the session selector below shows the name, so the heading is only announced. */}
        <h2
          id="day-detail-title"
          className={status === 'current' && !upcomingRace ? styles.srOnly : styles.detailTitle}
        >
          <SessionIcon session={raced || upcomingRace ? 'race' : day.session} size={26} />
          <span>{raced ? `Race: ${raced.race.name}` : upcomingRace ? `Race: ${upcomingRace.race.name}` : session.label}</span>
        </h2>
        <span className={styles.detailWhen}>
          {weekdayLong(day.day)} · {STATUS_LABELS[status]}
        </span>
      </div>

      {status === 'current' && upcomingRace ? (
        <RaceDayPanel race={upcomingRace.race} entryId={upcomingRace.entryId} />
      ) : status === 'upcoming' && upcomingRace ? (
        <p className={styles.description}>
          Race day: {upcomingRace.race.name} replaces this day’s session.{' '}
          <Link to={`/races/${upcomingRace.race.id}`}>Race details</Link>
        </p>
      ) : status === 'current' ? (
        <TodayActions
          state={state}
          selectId={selectId}
          error={error}
          cooldown={cooldown}
          onPlan={onPlan}
          onComplete={onComplete}
        />
      ) : status === 'completed' && day.outcome ? (
        <>
          {raced ? (
            <p className={styles.description}>
              Raced instead of {session.label}: {ordinal(raced.entry.result.position)} of{' '}
              {raced.entry.result.fieldSize} in {raceTimeText(raced.entry.result.timeS)}.{' '}
              <Link to={`/races/results/${raced.entry.id}`}>View result</Link>
            </p>
          ) : (
            <p className={styles.description}>{session.description}</p>
          )}
          <p className={styles.summary}>
            <strong>Result:</strong> {effectsText(day.outcome)}
          </p>
          {day.outcome.injured && (
            <p className={styles.warning}>
              Injured on this day: no XP, Fitness lost and {INJURY_REST_DAYS} forced rest days.
            </p>
          )}
        </>
      ) : (
        <>
          <p className={styles.description}>{session.description}</p>
          <p className={styles.summary}>
            <strong>Planned:</strong> {effectsText(plannedEffects(state, day.session))}
          </p>
          <p className={styles.hint}>Only today’s session can be changed or completed.</p>
        </>
      )}
    </section>
  )
}

interface TodayActionsProps {
  state: GameState
  selectId: string
  error: string | null
  cooldown: boolean
  onPlan(session: SessionType): void
  onComplete(): void
}

function TodayActions({ state, selectId, error, cooldown, onPlan, onComplete }: TodayActionsProps) {
  const { athlete, week } = state
  const today = week.days[week.currentDayIndex]!
  const session = TRAINING_SESSIONS[today.session]
  const effects = previewSession(state, today.session)
  const forced = state.forcedRestDays > 0

  return (
    <>
      <div className={styles.field}>
        <label htmlFor={selectId} className={styles.srOnly}>
          Session for {weekdayLong(today.day)}
        </label>
        <div className={styles.selectRow}>
          <SessionIcon session={today.session} size={26} />
          <select
            id={selectId}
            className={styles.select}
            value={today.session}
            disabled={forced}
            onChange={(event) => {
              const value = event.target.value
              if (isSessionType(value)) onPlan(value)
            }}
          >
            {SESSION_TYPES.map((id) => (
              <option key={id} value={id}>
                {TRAINING_SESSIONS[id].label}
              </option>
            ))}
          </select>
        </div>
        {forced ? (
          <p className={styles.injuredHint}>
            Injured: {state.forcedRestDays} forced rest {state.forcedRestDays === 1 ? 'day' : 'days'} left.
            Session locked.
          </p>
        ) : (
          <p className={styles.hint}>{session.description}</p>
        )}
      </div>

      <dl className={styles.effects}>
        <div>
          <dt>XP</dt>
          <dd>
            <span className={styles.delta}>{formatDelta(effects.xpGained)}</span>
            <span className={styles.result}>
              {athlete.xp} → {athlete.xp + effects.xpGained}
            </span>
          </dd>
        </div>
        <div>
          <dt>Fitness</dt>
          <dd>
            <span className={styles.delta}>{formatDelta(effects.fitnessChange)}</span>
            <span className={styles.result}>
              {athlete.fitness} → {athlete.fitness + effects.fitnessChange}
            </span>
          </dd>
        </div>
        <div>
          <dt>Fatigue</dt>
          <dd>
            <span className={styles.delta}>{formatDelta(effects.fatigueChange)}</span>
            <span className={styles.result}>
              {athlete.fatigue} → {athlete.fatigue + effects.fatigueChange}
            </span>
          </dd>
        </div>
      </dl>

      {effects.injured && (
        <p className={styles.warning} role="alert">
          Injury warning: Fatigue would reach {athlete.fatigue + effects.fatigueChange} (above{' '}
          {INJURY_FATIGUE_THRESHOLD}). Training anyway: no XP, −{INJURY_FITNESS_LOSS} Fitness,{' '}
          {INJURY_REST_DAYS} forced rest days.
        </p>
      )}

      <button
        type="button"
        className={`${button.button} ${effects.injured ? button.danger : button.primary} ${button.block}`}
        aria-disabled={cooldown || undefined}
        onClick={onComplete}
      >
        {cooldown
          ? 'Saved ✓'
          : effects.injured
          ? 'Complete anyway — injury'
          : today.session === 'rest'
            ? `Take rest day (${weekdayShort(today.day)})`
            : `Complete ${session.label}`}
      </button>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </>
  )
}

function ExecutionFeedback({ result }: { result: ExecutionResult }) {
  const { state, executed, outcome, levelBefore, levelAfter, weekCompleted, injured } = result
  const label = TRAINING_SESSIONS[executed.session].label
  const next = state.week.days[state.week.currentDayIndex]!

  return (
    <div className={`${styles.feedback} ${injured ? styles.feedbackInjured : ''}`}>
      {injured ? (
        <>
          <p className={`${styles.feedbackTitle} ${styles.injuredText}`}>
            Injured! {weekdayLong(executed.dayIndex + 1)}: {label}
          </p>
          <p>
            {effectsText(outcome)} · {INJURY_REST_DAYS} forced rest days
          </p>
        </>
      ) : (
        <>
          <p className={styles.feedbackTitle}>
            {weekdayLong(executed.dayIndex + 1)} complete: {label}
          </p>
          <p>{effectsText(outcome)}</p>
        </>
      )}
      {levelAfter > levelBefore && (
        <p className={styles.levelUp}>
          Level up! Now Level {levelAfter}. +{result.attributePointsAwarded} attribute points.{' '}
          <Link to="/attributes" className={styles.inlineLink}>
            Allocate points
          </Link>
          <UnlockNotice from={levelBefore} to={levelAfter} />
        </p>
      )}
      {/* The next day is highlighted in the week strip; the rollover is announced here. */}
      {weekCompleted && (
        <p className={styles.next}>
          Week {executed.week} complete. Week {state.week.number} has started: {weekdayLong(next.day)},{' '}
          {TRAINING_SESSIONS[next.session].label}.
        </p>
      )}
    </div>
  )
}

/** New appearance options reached by a level-up, with a link to try them on. */
function UnlockNotice({ from, to }: { from: number; to: number }) {
  const unlocks = appearanceUnlocks(from, to)
  if (unlocks.length === 0) return null
  return (
    <>
      {' '}
      New look unlocked: {unlocks.join(', ')}.{' '}
      <Link to="/appearance" className={styles.inlineLink}>
        Change look
      </Link>
    </>
  )
}
