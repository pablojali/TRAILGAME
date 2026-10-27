import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useGame } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { Card, Meter, StatTile } from '../../components/Card'
import { formatDelta } from '../../components/format'
import grid from '../../components/Grid.module.css'
import { Screen } from '../../components/Screen'
import { ARCHETYPE_LABELS } from '../../domain/athlete/athlete'
import { getLevelProgress } from '../../domain/athlete/levels'
import { TRAINING_SESSIONS } from '../../domain/training/sessions'
import { DAYS_PER_WEEK, getCurrentDay, getDayStatus } from '../../game-engine/gameState'
import { previewSession, summarizeWeek } from '../../game-engine/training'
import styles from './DashboardScreen.module.css'

export function DashboardScreen() {
  const { state } = useGame()
  const { athlete, week } = state
  const progress = getLevelProgress(athlete.xp)
  const today = getCurrentDay(week)
  const todaySession = TRAINING_SESSIONS[today.session]
  const effects = previewSession(state, today.session)
  const summary = summarizeWeek(state)

  return (
    <Screen
      eyebrow={`Week ${week.number} · Day ${today.day} of ${DAYS_PER_WEEK}`}
      title="Dashboard"
      description="Your athlete's status for the current training week."
    >
      <div className={styles.hero} aria-hidden="true">
        <svg viewBox="0 0 400 120" preserveAspectRatio="none" className={styles.ridge}>
          <path
            d="M0 120 L0 88 L48 60 L86 78 L140 30 L186 66 L228 44 L270 70 L318 18 L360 56 L400 40 L400 120 Z"
            className={styles.ridgeBack}
          />
          <path
            d="M0 120 L0 100 L60 82 L110 96 L170 70 L230 92 L290 74 L350 94 L400 80 L400 120 Z"
            className={styles.ridgeFront}
          />
          <path
            d="M20 112 C80 96 120 108 180 92 S300 86 380 70"
            className={styles.trail}
          />
        </svg>
      </div>

      <Card title={athlete.name}>
        <div className={styles.identity}>
          <span className={styles.badge}>{ARCHETYPE_LABELS[athlete.archetype]}</span>
          <span className={styles.level}>Level {progress.level}</span>
        </div>
        {progress.nextLevelMinXp === null ? (
          <p className={styles.muted}>{athlete.xp} XP · Maximum level reached</p>
        ) : (
          <>
            <p className={styles.muted}>
              {athlete.xp} XP · {progress.nextLevelMinXp - athlete.xp} XP to Level{' '}
              {progress.level + 1}
            </p>
            <Meter
              label={`Progress to Level ${progress.level + 1}`}
              value={athlete.xp}
              min={progress.levelMinXp}
              max={progress.nextLevelMinXp}
              valueText={`${athlete.xp} of ${progress.nextLevelMinXp} XP`}
            />
          </>
        )}
      </Card>

      <div className={grid.stats}>
        <StatTile label="Level" value={String(progress.level)} tone="ochre" />
        <StatTile label="XP" value={String(athlete.xp)} tone="ochre" />
        <StatTile
          label="Fitness"
          value={`${athlete.fitness}/100`}
          tone="brand"
          meter={{ value: athlete.fitness, max: 100 }}
        />
        <StatTile
          label="Fatigue"
          value={`${athlete.fatigue}/100`}
          tone="accent"
          meter={{ value: athlete.fatigue, max: 100 }}
        />
      </div>

      <div className={grid.cards}>
        <Card title={`Today · Day ${today.day}`}>
          <p className={styles.session}>{todaySession.label}</p>
          <p className={`${styles.muted} ${styles.effects}`}>
            <span>XP {formatDelta(effects.xpGained)}</span> ·{' '}
            <span>Fitness {formatDelta(effects.fitnessChange)}</span> ·{' '}
            <span>Fatigue {formatDelta(effects.fatigueChange)}</span>
          </p>
          <Link to="/training" className={`${button.button} ${button.primary}`}>
            Go to training
          </Link>
        </Card>

        <Card title={`Week ${week.number}`}>
          <p>
            <strong>
              {summary.completedDays} of {summary.totalDays}
            </strong>{' '}
            days completed
          </p>
          <ol className={styles.weekDots} aria-hidden="true">
            {week.days.map((day, index) => (
              <li key={day.day} className={styles[getDayStatus(week, index)]} />
            ))}
          </ol>
          <p className={styles.muted}>{summary.xpGained} XP earned this week</p>
        </Card>
      </div>

      <ResetDemo />
    </Screen>
  )
}

function ResetDemo() {
  const { resetDemo } = useGame()
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState('')
  const resetButton = useRef<HTMLButtonElement>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)
  // Keeps keyboard focus on the visible control when the buttons swap.
  const focusTarget = useRef<'reset' | 'confirm' | null>(null)

  useEffect(() => {
    if (focusTarget.current === 'reset') resetButton.current?.focus()
    if (focusTarget.current === 'confirm') confirmButton.current?.focus()
    focusTarget.current = null
  }, [confirming])

  function toggle(next: boolean) {
    focusTarget.current = next ? 'confirm' : 'reset'
    setConfirming(next)
  }

  return (
    <Card title="Demo">
      {confirming ? (
        <>
          <p className={styles.muted}>
            This erases all saved progress and restores the starting demo athlete.
          </p>
          <div className={styles.actions}>
            <button
              ref={confirmButton}
              type="button"
              className={`${button.button} ${button.danger}`}
              onClick={() => {
                resetDemo()
                setMessage('Demo reset. The athlete and plan are back to the starting state.')
                toggle(false)
              }}
            >
              Confirm reset
            </button>
            <button
              type="button"
              className={`${button.button} ${button.secondary}`}
              onClick={() => toggle(false)}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.muted}>Start over with the original demo athlete and plan.</p>
          <div className={styles.actions}>
            <button
              ref={resetButton}
              type="button"
              className={`${button.button} ${button.secondary}`}
              onClick={() => {
                setMessage('')
                toggle(true)
              }}
            >
              Reset demo
            </button>
          </div>
        </>
      )}
      <p role="status" className={styles.muted}>
        {message}
      </p>
    </Card>
  )
}
