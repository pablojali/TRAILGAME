import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useCareer, useGame } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { Card, Meter } from '../../components/Card'
import { formatDelta } from '../../components/format'
import {
  ATTRIBUTE_IDS,
  ATTRIBUTE_LABELS,
  ATTRIBUTE_MAX,
  STAT_MAX,
} from '../../domain/athlete/athlete'
import { getLevelProgress } from '../../domain/athlete/levels'
import { PROFILES } from '../../domain/athlete/profiles'
import { TRAINING_SESSIONS } from '../../domain/training/sessions'
import { weekdayLong, weekdayShort } from '../../domain/training/weekdays'
import { getUnspentAttributePoints } from '../../game-engine/attributes'
import { getCurrentDay, getDayStatus } from '../../game-engine/gameState'
import { previewSession, summarizeWeek } from '../../game-engine/training'
import { DashboardRunner } from './DashboardRunner'
import styles from './DashboardScreen.module.css'

/** Display-only threshold: Fatigue at or above this is shown as high. Not a gameplay rule. */
const HIGH_FATIGUE = 70

export function DashboardScreen() {
  const { state } = useCareer()
  const { athlete, week } = state
  const progress = getLevelProgress(athlete.xp)
  const unspent = getUnspentAttributePoints(athlete)
  const today = getCurrentDay(week)
  const todaySession = TRAINING_SESSIONS[today.session]
  const effects = previewSession(state, today.session)
  const summary = summarizeWeek(state)
  const fatigueHigh = athlete.fatigue >= HIGH_FATIGUE

  return (
    <section className={styles.screen} aria-labelledby="dashboard-title">
      <title>Dashboard · Trail Manager</title>
      <h1 id="dashboard-title" className={styles.srOnly}>
        Dashboard
      </h1>

      {/* First screen: the runner with attributes on the left and condition on the right. */}
      <div className={styles.hero}>
        <div className={styles.identity}>
          <h2 className={styles.identityName}>
            {athlete.name} - {PROFILES[athlete.profile].label} · Lv {progress.level}
          </h2>
          <p className={styles.when}>
            Week {week.number} · {weekdayLong(today.day)}
          </p>
        </div>

        <div className={styles.stage}>
          <section className={`${styles.side} ${styles.left}`} aria-label="Attributes">
            <ul className={styles.sideList}>
              {ATTRIBUTE_IDS.map((id) => (
                <li key={id} className={styles.attribute}>
                  {/* The meter announces name and value; the visible text is for sighted users. */}
                  <span className={styles.attributeName} aria-hidden="true">
                    {ATTRIBUTE_LABELS[id]}
                  </span>
                  <span className={styles.attributeRow}>
                    <Meter
                      label={ATTRIBUTE_LABELS[id]}
                      value={athlete.attributes[id]}
                      max={ATTRIBUTE_MAX}
                      valueText={`${athlete.attributes[id]} of ${ATTRIBUTE_MAX}`}
                      className={styles.sideMeter}
                    />
                    <span className={styles.value} aria-hidden="true">
                      {athlete.attributes[id]}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <DashboardRunner name={athlete.name} sex={athlete.sex} />

          <section className={`${styles.side} ${styles.right}`} aria-label="Condition">
            <dl className={styles.sideList}>
              <div className={styles.stat}>
                <dt>Level</dt>
                <dd className={styles.value}>{progress.level}</dd>
              </div>
              <div className={styles.stat}>
                <dt>XP</dt>
                <dd className={styles.value}>{athlete.xp}</dd>
                {progress.nextLevelMinXp === null ? (
                  <dd className={styles.statNote}>Max level</dd>
                ) : (
                  <dd>
                    <Meter
                      label={`Progress to Level ${progress.level + 1}`}
                      value={athlete.xp}
                      min={progress.levelMinXp}
                      max={progress.nextLevelMinXp}
                      valueText={`${athlete.xp} of ${progress.nextLevelMinXp} XP`}
                      className={styles.xpMeter}
                    />
                  </dd>
                )}
              </div>
              <div className={styles.stat}>
                <dt>Fitness</dt>
                <dd className={styles.value}>{athlete.fitness}</dd>
                <dd>
                  <Meter label="Fitness" value={athlete.fitness} max={STAT_MAX} className={styles.fitnessMeter} />
                </dd>
              </div>
              <div className={`${styles.stat} ${fatigueHigh ? styles.fatigueHigh : ''}`}>
                <dt>Fatigue</dt>
                <dd className={styles.value}>
                  {athlete.fatigue}
                  {fatigueHigh && <span className={styles.highTag}> High</span>}
                </dd>
                <dd>
                  <Meter label="Fatigue" value={athlete.fatigue} max={STAT_MAX} className={styles.fatigueMeter} />
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>

      {/* Below the first screen: actions and summaries. */}
      <div className={styles.cards}>
        <Card title="Attribute points">
          <div className={styles.pointsRow}>
            <p>
              <strong className={styles.points}>{unspent}</strong> unspent attribute{' '}
              {unspent === 1 ? 'point' : 'points'}
            </p>
            <Link
              to="/attributes"
              className={`${button.button} ${unspent > 0 ? button.primary : button.secondary}`}
            >
              {unspent > 0 ? 'Allocate points' : 'View attributes'}
            </Link>
          </div>
        </Card>

        <Card title={`Today · ${weekdayShort(today.day)}`}>
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
              <li key={day.day} className={styles[getDayStatus(week, index)]}>
                <span className={styles.weekDotLabel}>{weekdayShort(day.day).charAt(0)}</span>
              </li>
            ))}
          </ol>
          <p className={styles.muted}>
            {summary.xpGained} XP earned this week
          </p>
        </Card>

        <ResetDemo />
      </div>
    </section>
  )
}

function ResetDemo() {
  const { resetCareer } = useGame()
  const [confirming, setConfirming] = useState(false)
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
            This erases all saved progress. You will then choose a new starting profile.
          </p>
          <div className={styles.actions}>
            <button
              ref={confirmButton}
              type="button"
              className={`${button.button} ${button.danger}`}
              onClick={resetCareer}
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
          <p className={styles.muted}>Start over with a new career and starting profile.</p>
          <div className={styles.actions}>
            <button
              ref={resetButton}
              type="button"
              className={`${button.button} ${button.secondary}`}
              onClick={() => toggle(true)}
            >
              Reset demo
            </button>
          </div>
        </>
      )}
    </Card>
  )
}
