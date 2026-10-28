import { useId, useState } from 'react'
import { useGame } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { Card } from '../../components/Card'
import { formatDelta } from '../../components/format'
import { Screen } from '../../components/Screen'
import { SESSION_TYPES, TRAINING_SESSIONS, isSessionType } from '../../domain/training/sessions'
import { getCurrentDay, getDayStatus, type DayStatus } from '../../game-engine/gameState'
import { previewSession, type DayRef, type ExecutionResult, type TrainingError } from '../../game-engine/training'
import styles from './TrainingScreen.module.css'

const STATUS_LABELS: Record<DayStatus, string> = {
  completed: 'Completed',
  current: 'Today',
  upcoming: 'Upcoming',
}

const ERROR_MESSAGES: Record<TrainingError, string> = {
  'day-completed': 'This day has already been completed.',
  'day-not-current': 'Only today’s session can be changed or completed.',
  'wrong-week': 'The training week has changed. Review today’s session and try again.',
  'unknown-session': 'That session is not available.',
}

export function TrainingScreen() {
  const { state, lastExecution, planSession, executeDay } = useGame()
  const { athlete, week } = state
  const today = getCurrentDay(week)
  const ref: DayRef = { week: week.number, dayIndex: week.currentDayIndex }
  const session = TRAINING_SESSIONS[today.session]
  const effects = previewSession(state, today.session)
  const [error, setError] = useState<string | null>(null)
  const selectId = useId()

  return (
    <Screen
      eyebrow={`Week ${week.number}`}
      title="Training"
      description="Plan today's session, check its effects and complete it to move to the next day."
    >
      <div role="status" className={styles.feedbackRegion}>
        {lastExecution && <ExecutionFeedback result={lastExecution} />}
      </div>

      <Card title={`Day ${today.day} · Today`}>
        <div className={styles.field}>
          <label htmlFor={selectId} className={styles.label}>
            Session for day {today.day}
          </label>
          <select
            id={selectId}
            className={styles.select}
            value={today.session}
            onChange={(event) => {
              const value = event.target.value
              if (!isSessionType(value)) return
              const failure = planSession(ref, value)
              setError(failure && ERROR_MESSAGES[failure])
            }}
          >
            {SESSION_TYPES.map((id) => (
              <option key={id} value={id}>
                {TRAINING_SESSIONS[id].label}
              </option>
            ))}
          </select>
          <p className={styles.hint}>{session.description}</p>
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

        <button
          type="button"
          className={`${button.button} ${button.primary} ${button.block}`}
          onClick={() => {
            const failure = executeDay(ref)
            setError(failure && ERROR_MESSAGES[failure])
          }}
        >
          {today.session === 'rest' ? `Take rest day ${today.day}` : `Complete day ${today.day}: ${session.label}`}
        </button>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </Card>

      <section aria-labelledby="week-plan-title" className={styles.week}>
        <h2 id="week-plan-title" className={styles.sectionTitle}>
          Week {week.number} plan
        </h2>
        <ol className={styles.days}>
          {week.days.map((day, index) => {
            const status = getDayStatus(week, index)
            return (
              <li
                key={day.day}
                className={`${styles.day} ${styles[status]}`}
                aria-current={status === 'current' ? 'step' : undefined}
              >
                <span className={styles.dayNumber}>Day {day.day}</span>
                <span className={styles.daySession}>{TRAINING_SESSIONS[day.session].label}</span>
                <span className={styles.dayStatus}>
                  {STATUS_LABELS[status]}
                  {day.outcome && day.outcome.xpGained > 0 && ` · ${formatDelta(day.outcome.xpGained)} XP`}
                </span>
              </li>
            )
          })}
        </ol>
      </section>
    </Screen>
  )
}

function ExecutionFeedback({ result }: { result: ExecutionResult }) {
  const { state, executed, outcome, levelBefore, levelAfter, weekCompleted } = result
  const label = TRAINING_SESSIONS[executed.session].label
  const next = getCurrentDay(state.week)

  return (
    <div className={styles.feedback}>
      <p className={styles.feedbackTitle}>
        Week {executed.week}, day {executed.dayIndex + 1} complete: {label}
      </p>
      <p>
        XP {formatDelta(outcome.xpGained)} · Fitness {formatDelta(outcome.fitnessChange)} · Fatigue{' '}
        {formatDelta(outcome.fatigueChange)}
      </p>
      {levelAfter > levelBefore && <p className={styles.levelUp}>Level up! Now Level {levelAfter}.</p>}
      <p className={styles.next}>
        {weekCompleted ? `Week ${executed.week} complete. Week ${state.week.number} has started. ` : ''}
        Next: Day {next.day}, {TRAINING_SESSIONS[next.session].label}.
      </p>
    </div>
  )
}
