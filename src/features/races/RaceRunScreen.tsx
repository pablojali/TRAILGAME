import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { formatStat } from '../../components/format'
import { Screen } from '../../components/Screen'
import { Chips } from '../../components/Tabs'
import { getEquipmentItem, itemName } from '../../domain/equipment/items'
import { getRace, type Race } from '../../domain/races/races'
import type { AidStop, Intensity } from '../../domain/races/strategyConfig'
import type { GameState } from '../../game-engine/gameState'
import { getRaceSegments } from '../../game-engine/raceEngine'
import { isRaceDayToday } from '../../game-engine/raceSchedule'
import {
  getEntry,
  getRaceReport,
  type RaceDayResult,
  type RaceStartError,
  type RaceStepError,
} from '../../game-engine/races'
import type { ServerError } from '../../repositories/supabase/careerOpsClient'
import {
  INTENSITY_LABELS,
  INTENSITY_OPTIONS,
  intensityHint,
  STOP_LABELS,
  STOP_OPTIONS,
  stopDuration,
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
  const { consumables, week } = state
  const segments = getRaceSegments(race)
  const [intensity, setIntensity] = useState<Intensity>('target')
  const [gel, setGel] = useState(consumables.gel > 0)
  const [bar, setBar] = useState(consumables.bar > 0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
    <Screen eyebrow={`${race.name} · Race day`} title="Race preparation" description="Choose what to carry and how hard to start.">
      {/* Tiles that fit the screen (owner request, 1 November 2026): no scrolling. */}
      <div className={styles.tileScreen}>
        <section className={`${styles.tile} ${styles.tileWide}`} aria-label="Course">
          <span className={styles.tileLabel}>
            Course · {segments.length} segments, {segments.length - 1} aid stations
          </span>
          <ol className={styles.segmentCells}>
            {segments.map((segment) => (
              <li key={segment.index}>
                <span>S{segment.index + 1}</span>
                <span>{(segment.distanceM / 1000).toFixed(1)} km</span>
                <span>
                  +{Math.round(segment.gainM)} / −{Math.round(segment.lossM)}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <Link to="/equipment" className={`${styles.tile} ${styles.tileLink}`}>
          <span className={styles.tileLabel}>Equipment ›</span>
          <span className={styles.tileValue}>{equipmentText(state)}</span>
        </Link>

        <div className={styles.choiceTiles} role="group" aria-label="Nutrition">
          <NutritionToggle label="Energy gel" effect="1.5% faster" stock={consumables.gel} taken={gel} onChange={setGel} />
          <NutritionToggle label="Cereal bar" effect="1.5% less fatigue" stock={consumables.bar} taken={bar} onChange={setBar} />
        </div>
        {(consumables.gel === 0 || consumables.bar === 0) && (
          <Link to="/equipment?tab=shop" className={styles.tileNote}>
            Buy gel and bar packs in the shop ›
          </Link>
        )}

        <section className={styles.tile} aria-label="Segment 1 intensity">
          <span className={styles.tileLabel}>Segment 1 intensity</span>
          <div className={styles.chipsTight}>
            <Chips<Intensity> label="Segment 1 intensity" options={INTENSITY_OPTIONS} value={intensity} onChange={setIntensity} />
          </div>
          <span className={`${styles.tileNote} ${styles.tileHint}`}>{intensityHint(intensity)}</span>
        </section>

        <div className={styles.grow} />
        {error && (
          <p role="alert" className={styles.warning}>
            {error}
          </p>
        )}
        <button type="button" className={`${button.button} ${button.primary}`} aria-disabled={busy || undefined} onClick={start}>
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
      aria-label={`${none ? 'No' : taken ? 'Take' : 'Leave'} ${label.toLowerCase()}: ${effect}, ${stock} in stock`}
      aria-pressed={!none && taken}
      aria-disabled={none || undefined}
      onClick={() => !none && onChange(!taken)}
    >
      <span className={styles.tileLabel}>{label}</span>
      <strong>{none ? 'None in stock' : taken ? 'Take it' : 'Leave it'}</strong>
      <span className={styles.tileNote}>
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
    >
      {/*
       * The aid station picture stays visible on the left; the report and the decisions are a
       * column on the right (owner request, 2 November 2026). No scrolling.
       */}
      <div className={styles.aidLayout}>
        <div className={styles.aidPanel} role="region" aria-label="Aid station report">
          <h2 ref={heading} tabIndex={-1} className={styles.srOnly}>
            Aid station {station}
          </h2>
          <dl className={styles.statRows}>
            <div>
              <dt>Race time</dt>
              <dd>{raceTimeText(report.elapsedS)}</dd>
            </div>
            <div>
              <dt>Ahead</dt>
              <dd>{report.gapAheadS === null ? 'You lead' : `+${durationText(report.gapAheadS)}`}</dd>
            </div>
            <div>
              <dt>Behind</dt>
              <dd>{report.gapBehindS === null ? 'Nobody' : `−${durationText(report.gapBehindS)}`}</dd>
            </div>
            <div>
              <dt>Energy</dt>
              <dd>{formatStat(report.energy)}</dd>
            </div>
            <div>
              <dt>Fatigue</dt>
              <dd>{formatStat(report.fatigue)}</dd>
            </div>
            <div>
              <dt>Nutrition</dt>
              <dd>{[report.nutrition.gel && 'Gel', report.nutrition.bar && 'Bar'].filter(Boolean).join(' + ') || 'None'}</dd>
            </div>
            <div>
              <dt>Segment {station}</dt>
              <dd>
                {INTENSITY_LABELS[report.last.intensity]} · {durationText(report.last.segmentS)}
              </dd>
            </div>
            <div>
              <dt>Next: segment {station + 1}{lastSegment ? ' to the finish' : ''}</dt>
              <dd>
                {(report.next.distanceM / 1000).toFixed(1)} km · +{Math.round(report.next.gainM)} / −
                {Math.round(report.next.lossM)} m
              </dd>
            </div>
          </dl>

          <section className={styles.aidChoice} aria-label="Aid station stop">
            <span className={styles.tileLabel}>Aid station stop</span>
            <Chips<AidStop>
              label="Aid station stop"
              options={STOP_OPTIONS.map((o) => ({ id: o.id, label: `${o.label} ${stopDuration(o.id)}` }))}
              value={stop}
              onChange={setStop}
            />
          </section>

          <section className={styles.aidChoice} aria-label={`Segment ${station + 1} intensity`}>
            <span className={styles.tileLabel}>Segment {station + 1} intensity</span>
            <Chips<Intensity>
              label={`Segment ${station + 1} intensity`}
              options={INTENSITY_OPTIONS}
              value={intensity}
              onChange={setIntensity}
            />
          </section>
        </div>

        {error && (
          <p role="alert" className={`${styles.warning} ${styles.aidWide}`}>
            {error}
          </p>
        )}
        <button
          type="button"
          className={`${button.button} ${button.primary} ${styles.aidWide}`}
          aria-disabled={busy || undefined}
          onClick={go}
        >
          {busy ? 'Running…' : lastSegment ? `${STOP_LABELS[stop]} stop, run to the finish` : `${STOP_LABELS[stop]} stop, continue`}
        </button>
      </div>
    </Screen>
  )
}
