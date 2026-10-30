import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useCareer, useGame } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { Card, Meter } from '../../components/Card'
import { Coins } from '../../components/Coins'
import { formatDelta, formatStat } from '../../components/format'
import {
  ATTRIBUTE_IDS,
  ATTRIBUTE_LABELS,
  ATTRIBUTE_SCALE,
  STAT_MAX,
} from '../../domain/athlete/athlete'
import { getLevelProgress } from '../../domain/athlete/levels'
import { PROFILES } from '../../domain/athlete/profiles'
import { formatCoins } from '../../domain/economy/coins'
import { getCareerProgress, WEEKS_PER_YEAR } from '../../domain/training/calendar'
import { TRAINING_SESSIONS } from '../../domain/training/sessions'
import { weekdayLong, weekdayShort } from '../../domain/training/weekdays'
import { getUnspentAttributePoints } from '../../game-engine/attributes'
import { getCurrentDay, getDayStatus } from '../../game-engine/gameState'
import { previewSession, summarizeWeek } from '../../game-engine/training'
import { getRace } from '../../domain/races/races'
import { getScheduledEntry, isRaceDayToday } from '../../game-engine/raceSchedule'
import { DashboardRunner } from './DashboardRunner'
import styles from './DashboardScreen.module.css'

/** Display-only threshold: Fatigue at or above this is shown as high. Not a gameplay rule. */
const HIGH_FATIGUE = 70

export function DashboardScreen() {
  const { state } = useCareer()
  const { athlete, week } = state
  const progress = getLevelProgress(athlete.xp)
  const career = getCareerProgress(week.number)
  const unspent = getUnspentAttributePoints(athlete)
  const today = getCurrentDay(week)
  const todaySession = TRAINING_SESSIONS[today.session]
  const effects = previewSession(state, today.session)
  const summary = summarizeWeek(state)
  const fatigueHigh = athlete.fatigue >= HIGH_FATIGUE
  const pendingRaces = state.raceEntries.filter((entry) => entry.status === 'pending').length
  const scheduled = getScheduledEntry(state)
  const todayRace = isRaceDayToday(state) && scheduled ? getRace(scheduled.raceId) : undefined

  return (
    <section className={styles.screen} aria-labelledby="dashboard-title">
      <title>Dashboard · Trail Manager</title>
      <h1 id="dashboard-title" className={styles.srOnly}>
        Dashboard
      </h1>

      {/* First screen: the runner with attributes on the left and condition on the right. */}
      <div className={styles.hero}>
        {/* Year progress on the left, day centred, coins on the right (owner requests). */}
        <div className={styles.topBar}>
          <div className={styles.year}>
            <span className={styles.yearLabel}>Year {career.year}</span>
            <span className={styles.yearWeek}>
              <span>
                Week {career.weekOfYear} / {WEEKS_PER_YEAR}
              </span>
              <span className={styles.yearPercent}>{career.percent}%</span>
            </span>
            <Meter
              label={`Year ${career.year} progress`}
              value={career.weekOfYear}
              min={0}
              max={WEEKS_PER_YEAR}
              valueText={`Week ${career.weekOfYear} of ${WEEKS_PER_YEAR}, ${career.percent}% of the year`}
              className={styles.yearMeter}
            />
          </div>
          <p className={styles.when}>
            {/* Short day name on small phones, so the year block keeps its room. */}
            <span className={styles.dayLong}>{weekdayLong(today.day)}</span>
            <span className={styles.dayShort}>{weekdayShort(today.day)}</span>
          </p>
          <p className={styles.balance}>
            <Coins amount={state.coins} />
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
                      value={Math.min(athlete.attributes[id], ATTRIBUTE_SCALE)}
                      max={ATTRIBUTE_SCALE}
                      valueText={formatStat(athlete.attributes[id])}
                      className={styles.sideMeter}
                    />
                    <span className={styles.value} aria-hidden="true">
                      {formatStat(athlete.attributes[id])}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* The runner fills the stage height behind the side cards, with a name plate over the head. */}
          <div className={styles.center}>
            <h2 className={styles.nameplate}>
              <span className={styles.nameplateName}>{athlete.name}</span>
              <span className={styles.srOnly}> - </span>
              <span className={styles.nameplateRole}>
                {PROFILES[athlete.profile].label} (Lv {progress.level})
              </span>
            </h2>
            <DashboardRunner
              name={athlete.name}
              sex={athlete.sex}
              appearance={athlete.appearance}
              equipment={state.equipment}
            />
          </div>

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
                <dd className={styles.value}>{formatStat(athlete.fitness)}</dd>
                <dd>
                  <Meter
                    label="Fitness"
                    value={athlete.fitness}
                    max={STAT_MAX}
                    valueText={`${formatStat(athlete.fitness)} of ${STAT_MAX}`}
                    className={styles.fitnessMeter}
                  />
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
          {todayRace ? (
            <>
              <p className={styles.session}>Race: {todayRace.name}</p>
              <p className={styles.muted}>Race day: the race takes today’s training day.</p>
              <Link to={`/races/${todayRace.id}`} className={`${button.button} ${button.primary}`}>
                Go to race
              </Link>
            </>
          ) : (
            <>
              <p className={styles.session}>{todaySession.label}</p>
              <p className={`${styles.muted} ${styles.effects}`}>
                <span>XP {formatDelta(effects.xpGained)}</span> ·{' '}
                <span>Fitness {formatDelta(effects.fitnessChange)}</span> ·{' '}
                <span>Fatigue {formatDelta(effects.fatigueChange)}</span>
                {effects.attributeGain && (
                  <>
                    {' '}
                    ·{' '}
                    <span>
                      {ATTRIBUTE_LABELS[effects.attributeGain.attribute]} {formatDelta(effects.attributeGain.amount)}
                    </span>
                  </>
                )}
              </p>
              <Link to="/training" className={`${button.button} ${button.primary}`}>
                Go to training
              </Link>
            </>
          )}
        </Card>

        <Card title="Races">
          <p className={styles.muted}>
            <strong>{formatCoins(state.coins)}</strong>
            {pendingRaces > 0 && ` · race on Sunday`}
          </p>
          <Link to="/races" className={`${button.button} ${button.secondary}`}>
            Race Hub
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
