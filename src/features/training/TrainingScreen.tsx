import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { formatDelta, formatStat } from '../../components/format'
import { appearanceUnlocks } from '../../domain/athlete/appearance'
import { INJURY_FATIGUE_THRESHOLD, INJURY_FITNESS_LOSS, INJURY_REST_DAYS } from '../../domain/training/injury'
import { getRestFatigueDelta, RECOVERY_REST_FITNESS } from '../../domain/training/recovery'
import {
  ATTRIBUTE_GAIN_PER_SESSION,
  isSessionType,
  SESSION_TYPES,
  TRAINING_SESSIONS,
  type SessionType,
} from '../../domain/training/sessions'
import { useI18n, type MessageKey, type Translate } from '../../i18n/i18n'
import { weekdayLongKey, weekdayShortKey } from '../../i18n/labels'
import {
  getDayStatus,
  type DayOutcome,
  type FinishedRaceEntry,
  type GameState,
  type TrainingDay,
} from '../../game-engine/gameState'
import { getRace, type Race } from '../../domain/races/races'
import { getRaceWeek, getScheduledEntry, RACE_DAY_INDEX } from '../../game-engine/raceSchedule'
import { getEntry } from '../../game-engine/races'
import type { ServerError } from '../../repositories/supabase/careerOpsClient'
import { RaceDayPanel } from '../races/RaceDayPanel'
import { freeRestDays, isRecoveryRest, previewSession, type DayRef, type ExecutionResult, type TrainingError } from '../../game-engine/training'
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

const ERROR_MESSAGES: Record<TrainingError | ServerError, MessageKey> = {
  offline: 'training.error.offline',
  'server-error': 'training.error.server-error',
  'day-completed': 'training.error.day-completed',
  'day-not-current': 'training.error.day-not-current',
  'wrong-week': 'training.error.wrong-week',
  'unknown-session': 'training.error.unknown-session',
  'forced-rest': 'training.error.forced-rest',
  'race-day': 'training.error.race-day',
}

/**
 * After completing a day the button stays on screen for the next day, so a short pause stops an
 * accidental double tap from completing two days.
 */
const COMPLETE_COOLDOWN_MS = 700

function effectsText(outcome: DayOutcome, t: Translate) {
  const gain = outcome.attributeGain
  const trained = gain ? ` · ${t(`attr.${gain.attribute}`)} ${formatDelta(gain.amount)}` : ''
  const daily = outcome.consistencyGain
    ? ` · ${t('training.consistencyWeek', { attribute: t('attr.consistency'), delta: formatDelta(outcome.consistencyGain) })}`
    : ''
  return `${t('stat.xp')} ${formatDelta(outcome.xpGained)} · ${t('stat.fitness')} ${formatDelta(outcome.fitnessChange)} · ${t('stat.fatigue')} ${formatDelta(outcome.fatigueChange)}${trained}${daily}`
}

/**
 * A future day's planned effects, before clamping. Rest includes the athlete's Recovery bonus, and
 * is a recovery Rest (Fitness kept) when the day before is planned as training or a race (in a
 * race week, also the second Rest in a row) and it is not a forced Rest day.
 */
function plannedEffects(state: GameState, index: number): DayOutcome {
  const session = state.week.days[index]!.session
  const rules = TRAINING_SESSIONS[session]
  if (session !== 'rest') {
    return {
      xpGained: rules.xp,
      fitnessChange: rules.fitnessDelta,
      fatigueChange: rules.fatigueDelta,
      ...(rules.attribute && { attributeGain: { attribute: rules.attribute, amount: ATTRIBUTE_GAIN_PER_SESSION } }),
    }
  }
  const forced = index < state.week.currentDayIndex + state.forcedRestDays
  const before = state.week.days[index - 1]
  const active = (i: number) => {
    const day = state.week.days[i]
    return day !== undefined && (day.session !== 'rest' || scheduledRace(state, i) !== null)
  }
  // After an active day; in a race week also the second Rest in a row (owner decision).
  const recovery =
    !forced &&
    before !== undefined &&
    (active(index - 1) || (freeRestDays(state) === 2 && index >= 2 && !active(index - 1) && active(index - 2)))
  return {
    xpGained: 0,
    fitnessChange: recovery ? RECOVERY_REST_FITNESS : rules.fitnessDelta,
    fatigueChange: getRestFatigueDelta(state.athlete),
  }
}

export function TrainingScreen() {
  const { state, lastExecution, planSession, executeDay } = useCareer()
  const { week } = state
  const [selected, setSelected] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(false)
  // Waiting for the server to confirm the day (Phase 3B.1); also blocks a second tap meanwhile.
  const [busy, setBusy] = useState(false)
  const completing = useRef(false)
  const { t } = useI18n()

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
      <title>{`${t('training.title')} · Trail Manager`}</title>
      <header className={styles.header}>
        <h1 id="training-title" className={styles.title}>
          {t('training.title')}
        </h1>
        <p className={styles.eyebrow}>{t('training.week', { week: week.number })}</p>
      </header>

      <ol className={styles.strip} aria-label={t('training.weekPlan', { week: week.number })}>
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
                aria-label={`${t('training.dayLabel', {
                  day: t(weekdayLongKey(day.day)),
                  what: raceName ? t('training.race', { name: raceName }) : t(`session.${day.session}`),
                  status: day.outcome?.injured ? t('training.injured') : t(`training.statusLower.${dayStatus}`),
                })}${forced ? t('training.forcedRestTag') : ''}`}
                onClick={() => {
                  setError(null)
                  setSelected(index === week.currentDayIndex ? null : index)
                }}
              >
                <span className={styles.dayName}>{t(weekdayShortKey(day.day))}</span>
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
        busy={busy}
        onPlan={(session) => {
          // Any day from today on can be planned (owner decision, 1 November 2026).
          const failure = planSession({ week: week.number, dayIndex: selectedIndex }, session)
          setError(failure && t(ERROR_MESSAGES[failure]))
        }}
        onComplete={async () => {
          if (cooldown || completing.current) return
          completing.current = true
          setBusy(true)
          const failure = await executeDay(ref)
          completing.current = false
          setBusy(false)
          setError(failure && t(ERROR_MESSAGES[failure]))
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
  /** Waiting for the server to confirm the day. */
  busy: boolean
  onPlan(session: SessionType): void
  onComplete(): void
}

/** The selected day's full detail, shown directly under the week strip. */
function DayDetail({ state, index, error, cooldown, busy, onPlan, onComplete }: DayDetailProps) {
  const { week } = state
  const day = week.days[index]!
  const status = getDayStatus(week, index)
  const selectId = useId()
  const raced = dayRace(state, day)
  const upcomingRace = scheduledRace(state, index)
  const forcedDay = index >= week.currentDayIndex && index < week.currentDayIndex + state.forcedRestDays
  const { t, locale } = useI18n()
  const sessionLabel = t(`session.${day.session}`)
  const sessionDescription = t(`session.desc.${day.session}`)

  return (
    <section id="day-detail" className={styles.detail} aria-labelledby="day-detail-title">
      <div className={styles.detailTop}>
        {/* When the session selector below shows the name (today, later days), the heading is only announced. */}
        <h2
          id="day-detail-title"
          className={
            !upcomingRace && (status === 'current' || (status === 'upcoming' && !forcedDay)) ? styles.srOnly : styles.detailTitle
          }
        >
          <SessionIcon session={raced || upcomingRace ? 'race' : day.session} size={26} />
          <span>
            {raced
              ? t('training.race', { name: raced.race.name })
              : upcomingRace
                ? t('training.race', { name: upcomingRace.race.name })
                : sessionLabel}
          </span>
        </h2>
        <span className={styles.detailWhen}>
          {t(weekdayLongKey(day.day))} · {t(`training.status.${status}`)}
        </span>
      </div>

      {status === 'current' && upcomingRace ? (
        <RaceDayPanel race={upcomingRace.race} entryId={upcomingRace.entryId} />
      ) : status === 'upcoming' && upcomingRace ? (
        <p className={styles.description}>
          {t('training.raceReplaces', { name: upcomingRace.race.name })}{' '}
          <Link to={`/races/${upcomingRace.race.id}`}>{t('training.raceDetails')}</Link>
        </p>
      ) : status === 'current' ? (
        <TodayActions
          state={state}
          selectId={selectId}
          error={error}
          cooldown={cooldown}
          busy={busy}
          onPlan={onPlan}
          onComplete={onComplete}
        />
      ) : status === 'completed' && day.outcome ? (
        <>
          {raced ? (
            <p className={styles.description}>
              {t('training.racedInstead', {
                session: sessionLabel,
                position: ordinal(raced.entry.result.position, locale),
                field: raced.entry.result.fieldSize,
                time: raceTimeText(raced.entry.result.timeS),
              })}{' '}
              <Link to={`/races/results/${raced.entry.id}`}>{t('training.viewResult')}</Link>
            </p>
          ) : (
            <p className={styles.description}>{sessionDescription}</p>
          )}
          <p className={styles.summary}>
            <strong>{t('training.result')}</strong> {effectsText(day.outcome, t)}
          </p>
          {day.outcome.injured && <p className={styles.warning}>{t('training.injuredDay', { days: INJURY_REST_DAYS })}</p>}
        </>
      ) : (
        <>
          {forcedDay ? (
            <p className={styles.injuredHint}>{t('training.forcedRestDay')}</p>
          ) : (
            <div className={styles.selectRow}>
              <SessionIcon session={day.session} size={26} />
              <label htmlFor={selectId} className={styles.srOnly}>
                {t('training.sessionFor', { day: t(weekdayLongKey(day.day)) })}
              </label>
              <select
                id={selectId}
                className={styles.select}
                value={day.session}
                onChange={(event) => {
                  const value = event.target.value
                  if (isSessionType(value)) onPlan(value)
                }}
              >
                {SESSION_TYPES.map((id) => (
                  <option key={id} value={id}>
                    {t(`session.${id}`)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className={styles.description}>{sessionDescription}</p>
          <p className={styles.summary}>
            <strong>{t('training.planned')}</strong> {effectsText(plannedEffects(state, index), t)}
          </p>
          {error && (
            <p role="alert" className={styles.warning}>
              {error}
            </p>
          )}
          <p className={styles.hint}>{t('training.planHint')}</p>
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
  busy: boolean
  onPlan(session: SessionType): void
  onComplete(): void
}

function TodayActions({ state, selectId, error, cooldown, busy, onPlan, onComplete }: TodayActionsProps) {
  const { athlete, week } = state
  const today = week.days[week.currentDayIndex]!
  const effects = previewSession(state, today.session)
  const forced = state.forcedRestDays > 0
  const { t } = useI18n()
  const sessionLabel = t(`session.${today.session}`)

  return (
    <>
      <div className={styles.field}>
        <label htmlFor={selectId} className={styles.srOnly}>
          {t('training.sessionFor', { day: t(weekdayLongKey(today.day)) })}
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
                {t(`session.${id}`)}
              </option>
            ))}
          </select>
        </div>
        {forced ? (
          <p className={styles.injuredHint}>{t('training.injuredLeft', { count: state.forcedRestDays })}</p>
        ) : (
          <p className={styles.hint}>
            {t(`session.desc.${today.session}`)}
            {today.session === 'rest' &&
              (isRecoveryRest(state)
                ? freeRestDays(state) === 2
                  ? t('training.rest.raceWeek')
                  : t('training.rest.recovery')
                : freeRestDays(state) === 2
                  ? t('training.rest.third')
                  : t('training.rest.second'))}
          </p>
        )}
      </div>

      <dl className={styles.effects}>
        <div>
          <dt>{t('stat.xp')}</dt>
          <dd>
            <span className={styles.delta}>{formatDelta(effects.xpGained)}</span>
            <span className={styles.result}>
              {athlete.xp} → {athlete.xp + effects.xpGained}
            </span>
          </dd>
        </div>
        <div>
          <dt>{t('stat.fitness')}</dt>
          <dd>
            <span className={styles.delta}>{formatDelta(effects.fitnessChange)}</span>
            <span className={styles.result}>
              {formatStat(athlete.fitness)} → {formatStat(athlete.fitness + effects.fitnessChange)}
            </span>
          </dd>
        </div>
        <div>
          <dt>{t('stat.fatigue')}</dt>
          <dd>
            <span className={styles.delta}>{formatDelta(effects.fatigueChange)}</span>
            <span className={styles.result}>
              {athlete.fatigue} → {athlete.fatigue + effects.fatigueChange}
            </span>
          </dd>
        </div>
      </dl>
      {effects.attributeGain && (
        <p className={styles.hint}>
          {t('training.trains', {
            attribute: t(`attr.${effects.attributeGain.attribute}`),
            delta: formatDelta(effects.attributeGain.amount),
            from: formatStat(athlete.attributes[effects.attributeGain.attribute]),
            to: formatStat(athlete.attributes[effects.attributeGain.attribute] + effects.attributeGain.amount),
          })}
        </p>
      )}

      {effects.injured && (
        <p className={styles.warning} role="alert">
          {t('training.injuryWarning', {
            fatigue: athlete.fatigue + effects.fatigueChange,
            threshold: INJURY_FATIGUE_THRESHOLD,
            loss: INJURY_FITNESS_LOSS,
            days: INJURY_REST_DAYS,
          })}
        </p>
      )}

      <button
        type="button"
        className={`${button.button} ${effects.injured ? button.danger : button.primary} ${button.block}`}
        aria-disabled={cooldown || busy || undefined}
        onClick={onComplete}
      >
        {busy
          ? t('training.saving')
          : cooldown
            ? t('training.saved')
            : effects.injured
              ? t('training.completeAnyway')
              : today.session === 'rest'
                ? t('training.takeRest', { day: t(weekdayShortKey(today.day)) })
                : t('training.complete', { session: sessionLabel })}
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
  const { t } = useI18n()
  const label = t(`session.${executed.session}`)
  const next = state.week.days[state.week.currentDayIndex]!
  const dayName = t(weekdayLongKey(executed.dayIndex + 1))

  return (
    <div className={`${styles.feedback} ${injured ? styles.feedbackInjured : ''}`}>
      {injured ? (
        <>
          <p className={`${styles.feedbackTitle} ${styles.injuredText}`}>
            {t('training.injuredTitle', { day: dayName, session: label })}
          </p>
          <p>
            {effectsText(outcome, t)} · {t('training.forcedRestDays', { days: INJURY_REST_DAYS })}
          </p>
        </>
      ) : (
        <>
          <p className={styles.feedbackTitle}>
            {t('training.dayComplete', { day: dayName, session: label })}
          </p>
          <p>{effectsText(outcome, t)}</p>
        </>
      )}
      {levelAfter > levelBefore && (
        <p className={styles.levelUp}>
          {t('training.levelUp', { level: levelAfter, points: result.attributePointsAwarded })}{' '}
          <Link to="/attributes" className={styles.inlineLink}>
            {t('training.allocate')}
          </Link>
          <UnlockNotice from={levelBefore} to={levelAfter} />
        </p>
      )}
      {/* The next day is highlighted in the week strip; the rollover is announced here. */}
      {weekCompleted && (
        <p className={styles.next}>
          {t('training.weekComplete', {
            done: executed.week,
            week: state.week.number,
            day: t(weekdayLongKey(next.day)),
            session: t(`session.${next.session}`),
          })}
        </p>
      )}
    </div>
  )
}

/** New appearance options reached by a level-up, with a link to try them on. */
function UnlockNotice({ from, to }: { from: number; to: number }) {
  const { athlete } = useCareer().state
  const { t } = useI18n()
  const unlocks = appearanceUnlocks(from, to, athlete.sex, athlete.appearance.skin)
  if (unlocks.length === 0) return null
  return (
    <>
      {' '}
      {t('training.newLook', { looks: unlocks.join(', ') })}{' '}
      <Link to="/appearance" className={styles.inlineLink}>
        {t('common.changeLook')}
      </Link>
    </>
  )
}
