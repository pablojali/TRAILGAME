import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { Card } from '../../components/Card'
import { formatDelta, formatStat } from '../../components/format'
import { Screen, ScrollPanel } from '../../components/Screen'
import { Chips } from '../../components/Tabs'
import { getEquipmentItem, itemName } from '../../domain/equipment/items'
import { getRace, type Race } from '../../domain/races/races'
import type { AidStop, Intensity } from '../../domain/races/strategyConfig'
import { INJURY_FATIGUE_THRESHOLD, INJURY_FITNESS_LOSS, INJURY_REST_DAYS } from '../../domain/training/injury'
import type { GameState } from '../../game-engine/gameState'
import { getRaceSegments } from '../../game-engine/raceEngine'
import { isRaceDayToday } from '../../game-engine/raceSchedule'
import {
  getEntry,
  getRaceReport,
  previewRaceDay,
  type RaceDayResult,
  type RaceStartError,
  type RaceStepError,
} from '../../game-engine/races'
import type { ServerError } from '../../repositories/supabase/careerOpsClient'
import {
  INTENSITY_LABELS,
  INTENSITY_OPTIONS,
  intensityHint,
  segmentCourseText,
  segmentTerrainText,
  STOP_LABELS,
  STOP_OPTIONS,
  stopDuration,
  stopHint,
} from './raceStrategyText'
import { durationText, ordinal, raceTimeText } from './raceText'
import styles from './Races.module.css'

const START_ERRORS: Record<RaceStartError | ServerError, string> = {
  offline: 'Could not reach the server, so the race has not started. Check your connection and try again.',
  'server-error': 'The server could not start the race. Try again.',
  'day-completed': 'Today was already completed. Check the current day and try again.',
  'day-not-current': 'Races take the current day only.',
  'wrong-week': 'The week changed. Check the current day and try again.',
  'unknown-session': 'Something went wrong. Try again.',
  'forced-rest': 'Your runner is injured: racing is locked during forced rest days.',
  'unknown-entry': 'This entry no longer exists.',
  'already-finished': 'This race was already run. Its result is saved.',
  'unknown-race': 'This race does not exist.',
  'race-day': 'Today is race day: start the race.',
  'not-race-day': 'Races are run on Sundays.',
  'not-scheduled': 'Another race is run first.',
  'level-too-low': "Your level is below this race's minimum, so it cannot be run.",
  'race-in-progress': 'The race has already started.',
  'unknown-intensity': 'Choose an intensity.',
  'no-gel': 'You have no gel left. Buy a pack in the shop.',
  'no-bar': 'You have no cereal bar left. Buy a pack in the shop.',
}

const STEP_ERRORS: Record<RaceStepError | ServerError, string> = {
  offline: 'Could not reach the server, so you are still at the aid station. Check your connection and try again.',
  'server-error': 'The server could not run the segment. Try again.',
  'no-race-in-progress': 'There is no race in progress.',
  'wrong-segment': 'The race moved on. Check the aid station and try again.',
  'unknown-intensity': 'Choose an intensity.',
  'unknown-stop': 'Choose a stop.',
}

/**
 * Race day, step by step (Race Engine V1): the preparation (course, equipment, gel and bar, first
 * intensity) and then one aid-station report per segment, until the finish. Every segment is
 * simulated by the server from the decisions sent; the screen only shows the career it returns.
 */
export function RaceRunScreen() {
  const { entryId = '' } = useParams()
  const { state } = useCareer()
  const entry = getEntry(state, entryId)
  const race = entry && getRace(entry.raceId)
  const [finished, setFinished] = useState<RaceDayResult | null>(null)

  if (finished) {
    return (
      <Navigate
        to={`/races/results/${finished.entry.id}`}
        replace
        state={{ levelsGained: finished.levelAfter - finished.levelBefore }}
      />
    )
  }
  if (!entry || !race) {
    return (
      <Screen title="Race not found" description="There is no race entry with this link.">
        <Link to="/races" className={`${button.button} ${button.secondary}`}>
          Back to races
        </Link>
      </Screen>
    )
  }
  if (entry.status === 'finished') return <Navigate to={`/races/results/${entry.id}`} replace />
  if (state.activeRace?.entryId === entry.id) return <AidStation race={race} onFinish={setFinished} />
  if (!isRaceDayToday(state) || state.activeRace) {
    return (
      <Screen eyebrow={race.name} title="Not race day" description="This race is not run today.">
        <Link to={`/races/${race.id}`} className={`${button.button} ${button.primary}`}>
          Go to the race
        </Link>
      </Screen>
    )
  }
  return <Preparation race={race} entryId={entry.id} />
}

/** Course, equipment, nutrition and the first intensity, then Start. */
function Preparation({ race, entryId }: { race: Race; entryId: string }) {
  const { state, startRace } = useCareer()
  const { athlete, consumables, week } = state
  const segments = getRaceSegments(race)
  const [intensity, setIntensity] = useState<Intensity>('target')
  const [gel, setGel] = useState(consumables.gel > 0)
  const [bar, setBar] = useState(consumables.bar > 0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const preview = previewRaceDay(state, race)
  const fatigueAfter = athlete.fatigue + preview.fatigueChange

  async function start() {
    if (busy) return
    setBusy(true)
    setError('')
    const failure = await startRace({ week: week.number, dayIndex: week.currentDayIndex }, entryId, {
      intensity,
      gel: gel && consumables.gel > 0,
      bar: bar && consumables.bar > 0,
    })
    setBusy(false)
    if (failure) setError(START_ERRORS[failure])
  }

  return (
    <Screen
      eyebrow={`${race.name} · Race day`}
      title="Race preparation"
      description="Plan your race: choose what to carry and how hard to start. You decide again at every aid station."
      showDescription
    >
      <ScrollPanel label="Race preparation">
        <Card title={`Course · ${segments.length} segments, ${segments.length - 1} aid stations`}>
          <ol className={styles.segmentList}>
            {segments.map((segment) => (
              <li key={segment.index}>
                <strong>Segment {segment.index + 1}</strong> · {segmentCourseText(segment)}
                <span className={styles.muted}> · {segmentTerrainText(segment)}</span>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Equipment">
          <p>{equipmentText(state)}</p>
          <Link to="/equipment">Change equipment</Link>
        </Card>

        <Card title="Nutrition">
          <p className={styles.muted}>One gel and one cereal bar last the whole race. They are used up.</p>
          <div className={styles.choiceRow}>
            <NutritionToggle label="Energy gel" effect="1.5% faster" stock={consumables.gel} taken={gel} onChange={setGel} />
            <NutritionToggle
              label="Cereal bar"
              effect="1.5% less fatigue"
              stock={consumables.bar}
              taken={bar}
              onChange={setBar}
            />
          </div>
          {(consumables.gel === 0 || consumables.bar === 0) && (
            <Link to="/equipment?tab=shop">Buy packs in the shop</Link>
          )}
        </Card>

        <Card title="Segment 1 intensity">
          <Chips<Intensity> label="Segment 1 intensity" options={INTENSITY_OPTIONS} value={intensity} onChange={setIntensity} />
          <p className={styles.muted}>{intensityHint(intensity)}</p>
        </Card>

        <Card title="Condition">
          <p>
            Fatigue {formatStat(athlete.fatigue)}. At Target pace with Normal stops it would end near{' '}
            {formatStat(fatigueAfter)} ({formatDelta(preview.fatigueChange)}).
          </p>
          {preview.injured && (
            <p className={styles.warning} role="note">
              Injury warning: above {INJURY_FATIGUE_THRESHOLD} Fatigue at the finish you get injured: −
              {INJURY_FITNESS_LOSS} Fitness and {INJURY_REST_DAYS} forced rest days. Easier segments and longer
              stops keep Fatigue down.
            </p>
          )}
        </Card>
      </ScrollPanel>

      {error && (
        <p role="alert" className={styles.warning}>
          {error}
        </p>
      )}
      <div className={styles.links}>
        <button
          type="button"
          className={`${button.button} ${button.primary}`}
          aria-disabled={busy || undefined}
          onClick={start}
        >
          {busy ? 'Starting…' : 'Start race'}
        </button>
      </div>
    </Screen>
  )
}

function equipmentText(state: GameState): string {
  const names = state.equipment
    .map((id) => getEquipmentItem(id))
    .filter((item) => item !== undefined)
    .map((item) => itemName(item))
  return names.length ? names.join(', ') : 'Nothing equipped.'
}

function NutritionToggle({
  label,
  effect,
  stock,
  taken,
  onChange,
}: {
  label: string
  effect: string
  stock: number
  taken: boolean
  onChange(taken: boolean): void
}) {
  const none = stock === 0
  return (
    <button
      type="button"
      className={styles.choice}
      aria-pressed={!none && taken}
      aria-disabled={none || undefined}
      onClick={() => !none && onChange(!taken)}
    >
      <strong>
        {none ? `No ${label.toLowerCase()}` : taken ? `Take ${label.toLowerCase()}` : `Leave ${label.toLowerCase()}`}
      </strong>
      <span className={styles.muted}>
        {effect} · {stock} in stock
      </span>
    </button>
  )
}

/** The report at an aid station and the decisions for the next segment. */
function AidStation({ race, onFinish }: { race: Race; onFinish(result: RaceDayResult): void }) {
  const { state, stepRace } = useCareer()
  const report = getRaceReport(state)!
  const [stop, setStop] = useState<AidStop>('normal')
  const [intensity, setIntensity] = useState<Intensity>(report.last.intensity)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const station = report.segmentsDone
  const lastSegment = report.segmentsDone === report.segmentCount - 1

  // Every new aid station: back to the defaults, focus on the report.
  useEffect(() => {
    setStop('normal')
    setError('')
    heading.current?.focus()
  }, [station])

  async function go() {
    if (busy) return
    setBusy(true)
    setError('')
    const result = await stepRace({ segment: report.segmentsDone, stop, intensity })
    setBusy(false)
    if (!result.ok) return setError(STEP_ERRORS[result.error])
    if (result.finished) onFinish(result.finished)
  }

  return (
    <Screen
      eyebrow={`${race.name} · Aid station ${station} of ${report.segmentCount - 1}`}
      title={`${ordinal(report.position)} of ${report.fieldSize}`}
      description={`Race time ${raceTimeText(report.elapsedS)} after segment ${station} of ${report.segmentCount}.`}
      showDescription
    >
      <ScrollPanel label="Aid station report">
        <h2 ref={heading} tabIndex={-1} className={styles.srOnly}>
          Aid station {station}
        </h2>
        <dl className={styles.reportGrid}>
          <div>
            <dt>Position</dt>
            <dd>
              {ordinal(report.position)} / {report.fieldSize}
            </dd>
          </div>
          <div>
            <dt>Race time</dt>
            <dd>{raceTimeText(report.elapsedS)}</dd>
          </div>
          <div>
            <dt>Rival ahead</dt>
            <dd>{report.gapAheadS === null ? 'Nobody: you lead' : `${durationText(report.gapAheadS)} ahead`}</dd>
          </div>
          <div>
            <dt>Rival behind</dt>
            <dd>{report.gapBehindS === null ? 'Nobody' : `${durationText(report.gapBehindS)} behind`}</dd>
          </div>
          <div>
            <dt>Energy</dt>
            <dd>{formatStat(report.energy)}</dd>
          </div>
          <div>
            <dt>Fatigue</dt>
            <dd>{formatStat(report.fatigue)}</dd>
          </div>
        </dl>

        <Card title={`Segment ${station}`}>
          <p>
            {INTENSITY_LABELS[report.last.intensity]} · {durationText(report.last.segmentS)} ·{' '}
            {ordinal(report.last.position)} on arrival
          </p>
          <p className={styles.muted}>
            Nutrition:{' '}
            {[report.nutrition.gel && 'gel', report.nutrition.bar && 'cereal bar'].filter(Boolean).join(' and ') ||
              'none'}{' '}
            taken.
          </p>
        </Card>

        <Card title={`Next: segment ${station + 1}${lastSegment ? ' to the finish' : ''}`}>
          <p>{segmentCourseText(report.next)}</p>
          <p className={styles.muted}>{segmentTerrainText(report.next)}</p>
        </Card>

        <Card title="Aid station stop">
          <Chips<AidStop>
            label="Aid station stop"
            options={STOP_OPTIONS.map((o) => ({ id: o.id, label: `${o.label} · ${stopDuration(o.id)}` }))}
            value={stop}
            onChange={setStop}
          />
          <p className={styles.muted}>{stopHint(stop)}</p>
        </Card>

        <Card title={`Segment ${station + 1} intensity`}>
          <Chips<Intensity> label={`Segment ${station + 1} intensity`} options={INTENSITY_OPTIONS} value={intensity} onChange={setIntensity} />
          <p className={styles.muted}>{intensityHint(intensity)}</p>
        </Card>
      </ScrollPanel>

      {error && (
        <p role="alert" className={styles.warning}>
          {error}
        </p>
      )}
      <div className={styles.links}>
        <button type="button" className={`${button.button} ${button.primary}`} aria-disabled={busy || undefined} onClick={go}>
          {busy ? 'Running…' : lastSegment ? `${STOP_LABELS[stop]} stop, run to the finish` : `${STOP_LABELS[stop]} stop, continue`}
        </button>
      </div>
    </Screen>
  )
}
