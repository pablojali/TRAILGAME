import { useId, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import { BottomSheet } from '../../components/BottomSheet'
import button from '../../components/Button.module.css'
import { formatDelta } from '../../components/format'
import { INJURY_FATIGUE_THRESHOLD, INJURY_FITNESS_LOSS, INJURY_REST_DAYS } from '../../domain/training/injury'
import { isSessionType, SESSION_TYPES, TRAINING_SESSIONS } from '../../domain/training/sessions'
import { weekdayLong, weekdayShort } from '../../domain/training/weekdays'
import { getDayStatus, type DayOutcome, type DayStatus, type GameState } from '../../game-engine/gameState'
import { previewSession, type DayRef, type ExecutionResult, type TrainingError } from '../../game-engine/training'
import { SessionIcon } from './SessionIcon'
import styles from './TrainingScreen.module.css'

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
}

/** Search parameter that keeps the detail sheet in the history, so Back closes it. */
const DETAIL_PARAM = 'detail'

function effectsText(outcome: DayOutcome) {
  return `XP ${formatDelta(outcome.xpGained)} · Fitness ${formatDelta(outcome.fitnessChange)} · Fatigue ${formatDelta(outcome.fatigueChange)}`
}

/** Base effects of a planned session (the real result depends on the athlete on that day). */
function plannedEffects(session: keyof typeof TRAINING_SESSIONS): DayOutcome {
  const rules = TRAINING_SESSIONS[session]
  return { xpGained: rules.xp, fitnessChange: rules.fitnessDelta, fatigueChange: rules.fatigueDelta }
}

export function TrainingScreen() {
  const { state, lastExecution, planSession, executeDay } = useCareer()
  const { week } = state
  const [selected, setSelected] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const detailOpen = searchParams.has(DETAIL_PARAM)

  // The selection follows today unless the player picked another day of this week.
  const selectedIndex = selected ?? week.currentDayIndex
  const selectedDay = week.days[selectedIndex] ?? week.days[week.currentDayIndex]!
  const status = getDayStatus(week, selectedIndex)
  const ref: DayRef = { week: week.number, dayIndex: week.currentDayIndex }

  function openDetail() {
    setError(null)
    navigate({ search: `?${DETAIL_PARAM}` }, { state: { sheet: true } })
  }

  function closeDetail() {
    // Pop the entry added on open, so Back and close behave the same.
    if ((location.state as { sheet?: boolean } | null)?.sheet) navigate(-1)
    else setSearchParams({}, { replace: true })
  }

  function complete() {
    const failure = executeDay(ref)
    setError(failure && ERROR_MESSAGES[failure])
    if (!failure) {
      setSelected(null)
      closeDetail()
    }
  }

  return (
    <section className={styles.screen} aria-labelledby="training-title">
      <title>Training · Trail Manager</title>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Week {week.number}</p>
        <h1 id="training-title" className={styles.title}>
          Training
        </h1>
      </header>

      {state.forcedRestDays > 0 && (
        <p className={styles.injuryBanner} role="status">
          Injured: {state.forcedRestDays} forced rest {state.forcedRestDays === 1 ? 'day' : 'days'} left.
        </p>
      )}

      <ol className={styles.strip} aria-label={`Week ${week.number} plan`}>
        {week.days.map((day, index) => {
          const dayStatus = getDayStatus(week, index)
          const forced = index >= week.currentDayIndex && index < week.currentDayIndex + state.forcedRestDays
          return (
            <li key={day.day}>
              <button
                type="button"
                className={`${styles.day} ${styles[dayStatus]} ${index === selectedIndex ? styles.selected : ''}`}
                aria-pressed={index === selectedIndex}
                aria-current={dayStatus === 'current' ? 'date' : undefined}
                aria-label={`${weekdayLong(day.day)}, ${TRAINING_SESSIONS[day.session].label}, ${
                  day.outcome?.injured ? 'injured' : STATUS_LABELS[dayStatus].toLowerCase()
                }${forced ? ', forced rest' : ''}`}
                onClick={() => setSelected(index === week.currentDayIndex ? null : index)}
              >
                <span className={styles.dayName}>{weekdayShort(day.day)}</span>
                <SessionIcon session={day.session} size={22} />
                <span className={styles.dayMark} aria-hidden="true">
                  {day.outcome ? (day.outcome.injured ? '!' : '✓') : forced ? '+' : dayStatus === 'current' ? '•' : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <ActivityCard state={state} index={selectedIndex} status={status} onOpen={openDetail} />

      <div role="status" className={styles.feedbackRegion}>
        {lastExecution && <ExecutionFeedback result={lastExecution} />}
      </div>

      {detailOpen && (
        <BottomSheet
          title={`${weekdayLong(selectedDay.day)} · ${TRAINING_SESSIONS[selectedDay.session].label}`}
          onClose={closeDetail}
        >
          {status === 'current' ? (
            <TodayDetail
              state={state}
              onPlan={(session) => {
                const failure = planSession(ref, session)
                setError(failure && ERROR_MESSAGES[failure])
              }}
              onComplete={complete}
              error={error}
            />
          ) : (
            <OtherDayDetail state={state} index={selectedIndex} status={status} />
          )}
        </BottomSheet>
      )}
    </section>
  )
}

interface ActivityCardProps {
  state: GameState
  index: number
  status: DayStatus
  onOpen(): void
}

function ActivityCard({ state, index, status, onOpen }: ActivityCardProps) {
  const day = state.week.days[index]!
  const session = TRAINING_SESSIONS[day.session]
  const outcome =
    status === 'completed' ? day.outcome! : status === 'current' ? previewSession(state, day.session) : null

  return (
    <button type="button" className={styles.card} onClick={onOpen} aria-haspopup="dialog">
      <span className={styles.cardTop}>
        <span className={styles.cardWhen}>
          {weekdayLong(day.day)} · {STATUS_LABELS[status]}
        </span>
        <span className={styles.cardMore}>Details ›</span>
      </span>
      <span className={styles.cardSession}>
        <SessionIcon session={day.session} size={28} />
        <span>{session.label}</span>
      </span>
      <span className={styles.cardDescription}>{session.description}</span>
      <span className={styles.cardEffects}>
        {outcome ? effectsText(outcome) : `Planned: ${effectsText(plannedEffects(day.session))}`}
      </span>
      {status === 'current' && outcome?.injured && (
        <span className={styles.cardWarning}>Injury risk: open to review before training.</span>
      )}
      {status === 'completed' && outcome?.injured && <span className={styles.cardWarning}>Injured</span>}
    </button>
  )
}

interface TodayDetailProps {
  state: GameState
  onPlan(session: keyof typeof TRAINING_SESSIONS): void
  onComplete(): void
  error: string | null
}

function TodayDetail({ state, onPlan, onComplete, error }: TodayDetailProps) {
  const { athlete, week } = state
  const today = week.days[week.currentDayIndex]!
  const session = TRAINING_SESSIONS[today.session]
  const effects = previewSession(state, today.session)
  const forced = state.forcedRestDays > 0
  const selectId = useId()

  return (
    <>
      <div className={styles.field}>
        <label htmlFor={selectId} className={styles.label}>
          Session for {weekdayLong(today.day)}
        </label>
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
        {forced ? (
          <p className={styles.hint}>Forced rest after an injury: this session cannot be changed.</p>
        ) : (
          <p className={styles.hint}>{session.description}</p>
        )}
      </div>

      <div>
        <h3 className={styles.subheading}>Effects</h3>
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
      </div>

      {effects.injured && (
        <p className={styles.warning} role="alert">
          Injury warning: this session would raise Fatigue to {athlete.fatigue + effects.fatigueChange}, above{' '}
          {INJURY_FATIGUE_THRESHOLD}. If you train anyway, your runner is injured: no XP, −{INJURY_FITNESS_LOSS}{' '}
          Fitness and {INJURY_REST_DAYS} forced rest days. Choose Rest or an easier session to avoid it.
        </p>
      )}

      <p className={styles.hint}>
        Fitness drops by 1 for each full day without a training session. Rest does not count as training.
      </p>

      <button
        type="button"
        className={`${button.button} ${effects.injured ? button.danger : button.primary} ${button.block}`}
        onClick={onComplete}
      >
        {effects.injured
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

function OtherDayDetail({ state, index, status }: { state: GameState; index: number; status: DayStatus }) {
  const day = state.week.days[index]!
  const session = TRAINING_SESSIONS[day.session]
  return (
    <>
      <p className={styles.hint}>{session.description}</p>
      {status === 'completed' && day.outcome ? (
        <>
          <p>
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
          <p>
            <strong>Planned effects:</strong> {effectsText(plannedEffects(day.session))}
          </p>
          <p className={styles.hint}>Only today’s session can be changed or completed.</p>
        </>
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
      <p className={styles.feedbackTitle}>
        {weekdayLong(executed.dayIndex + 1)} complete: {label}
      </p>
      <p>{effectsText(outcome)}</p>
      {injured && (
        <p className={styles.injuredText}>
          Injured! No XP, −{INJURY_FITNESS_LOSS} Fitness and {INJURY_REST_DAYS} forced rest days.
        </p>
      )}
      {levelAfter > levelBefore && (
        <p className={styles.levelUp}>
          Level up! Now Level {levelAfter}. +{result.attributePointsAwarded} attribute points.{' '}
          <Link to="/attributes" className={styles.inlineLink}>
            Allocate points
          </Link>
        </p>
      )}
      <p className={styles.next}>
        {weekCompleted ? `Week ${executed.week} complete. Week ${state.week.number} has started. ` : ''}
        Next: {weekdayLong(next.day)}, {TRAINING_SESSIONS[next.session].label}.
      </p>
    </div>
  )
}
