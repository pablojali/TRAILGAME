import { Link } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { Meter } from '../../components/Card'
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
import { getCareerProgress, WEEKS_PER_YEAR } from '../../domain/training/calendar'
import { TRAINING_SESSIONS } from '../../domain/training/sessions'
import { weekdayLong, weekdayShort } from '../../domain/training/weekdays'
import { getUnspentAttributePoints } from '../../game-engine/attributes'
import { getCurrentDay } from '../../game-engine/gameState'
import { previewSession } from '../../game-engine/training'
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
  const fatigueHigh = athlete.fatigue >= HIGH_FATIGUE
  const scheduled = getScheduledEntry(state)
  const scheduledRace = scheduled ? getRace(scheduled.raceId) : undefined
  const todayRace = isRaceDayToday(state) ? scheduledRace : undefined

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
          <div className={styles.intro}>
            <h2 className={styles.nameplate}>
              <span className={styles.nameplateName}>{athlete.name}</span>
              <span className={styles.srOnly}> - </span>
              <span className={styles.nameplateRole}>
                {PROFILES[athlete.profile].label} (Lv {progress.level})
              </span>
            </h2>
          </div>

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

          {/* The runner fills the stage height, between the attributes and the condition panel. */}
          <div className={styles.center}>
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
                <dt>XP</dt>
                <dd className={styles.value}>{athlete.xp}</dd>
                {progress.nextLevelMinXp === null ? (
                  <dd className={styles.statNote}>Max level</dd>
                ) : (
                  <>
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
                    <dd className={styles.statNote} aria-hidden="true">
                      {athlete.xp} / {progress.nextLevelMinXp}
                    </dd>
                  </>
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

        {/* Today: what to do next, one tap away (the page does not scroll). */}
        <section className={styles.today} aria-label="Today">
          <div className={styles.todayText}>
            <p className={styles.todayTitle}>
              Today · {todayRace ? `Race: ${todayRace.name}` : todaySession.label}
            </p>
            {todayRace ? (
              <p className={styles.todayLine}>Race day: the race takes today’s training day.</p>
            ) : (
              <p className={styles.todayLine}>
                XP {formatDelta(effects.xpGained)} · Fitness {formatDelta(effects.fitnessChange)} · Fatigue{' '}
                {formatDelta(effects.fatigueChange)}
                {effects.attributeGain &&
                  ` · ${ATTRIBUTE_LABELS[effects.attributeGain.attribute]} ${formatDelta(effects.attributeGain.amount)}`}
              </p>
            )}
            {!todayRace && scheduledRace && (
              <p className={styles.todayLine}>Sunday: {scheduledRace.name}</p>
            )}
            {unspent > 0 && (
              <Link to="/attributes" className={styles.todayLink}>
                {unspent} attribute {unspent === 1 ? 'point' : 'points'} to spend ›
              </Link>
            )}
          </div>
          <Link
            to={todayRace ? `/races/${todayRace.id}` : '/training'}
            className={`${button.button} ${button.primary} ${styles.todayButton}`}
          >
            {todayRace ? 'Go to race' : 'Train'}
          </Link>
        </section>
      </div>
    </section>
  )
}
