import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { formatStat } from '../../components/format'
import { Screen } from '../../components/Screen'
import { Chips, Tabs } from '../../components/Tabs'
import { getEquipmentItem } from '../../domain/equipment/items'
import { ItemArt } from '../equipment/EquipmentScreen'
import { getRace, type Race } from '../../domain/races/races'
import type { AidStop, Intensity } from '../../domain/races/strategyConfig'
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
import { RaceClipPlayer } from './RaceClipPlayer'
import { raceClip } from './raceClips'
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
  // A start or step waiting for the server: the screen does not move on by itself meanwhile.
  const [waiting, setWaiting] = useState(false)
  // The segment clip being shown (owner request, 3 November 2026), and the finish it leads to.
  const [clipRun, setClipRun] = useState<{ segment: number; ready: boolean; finished: RaceDayResult | null } | null>(null)

  /**
   * Runs a race start or step, showing the clip of the segment it runs (1-based `segment`) when the
   * race has one. The clip is only presentation: the step is the server's, sent once from a tap.
   */
  async function present<R>(
    segment: number,
    action: () => Promise<R>,
    outcome: (result: R) => { ok: boolean; finished: RaceDayResult | null },
  ): Promise<R> {
    const clip = race ? raceClip(race.id, segment) : null
    setWaiting(true)
    if (clip) setClipRun({ segment, ready: false, finished: null })
    const result = await action()
    const { ok, finished: raced } = outcome(result)
    setWaiting(false)
    if (!ok) setClipRun(null)
    else if (clip) setClipRun({ segment, ready: true, finished: raced })
    else if (raced) setFinished(raced)
    return result
  }

  const clipFinish = useRef<RaceDayResult | null>(null)
  clipFinish.current = clipRun?.finished ?? null
  const clipDone = useCallback(() => {
    const raced = clipFinish.current
    setClipRun(null)
    if (raced) setFinished(raced)
  }, [])

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
  const clip = clipRun && raceClip(race.id, clipRun.segment)
  const overlay = clipRun && clip && (
    <RaceClipPlayer clip={clip} title={clipTitle(race, clipRun.segment)} ready={clipRun.ready} onDone={clipDone} />
  )
  if (entry.status === 'finished') {
    // Just finished here: wait for the result (and its clip) before going to the result.
    return waiting || clipRun ? overlay : <Navigate to={`/races/results/${entry.id}`} replace />
  }
  if (state.activeRace?.entryId === entry.id) {
    return (
      <>
        <AidStation race={race} present={present} />
        {overlay}
      </>
    )
  }
  if (!isRaceDayToday(state) || state.activeRace) {
    return (
      <Screen eyebrow={race.name} title="Not race day" description="This race is not run today.">
        <Link to={`/races/${race.id}`} className={`${button.button} ${button.primary}`}>
          Go to the race
        </Link>
      </Screen>
    )
  }
  return (
    <>
      <Preparation race={race} entryId={entry.id} present={present} />
      {overlay}
    </>
  )
}

/** Runs a start or step with its clip (see `RaceRunScreen.present`). */
type Present = <R>(
  segment: number,
  action: () => Promise<R>,
  outcome: (result: R) => { ok: boolean; finished: RaceDayResult | null },
) => Promise<R>

/** "Segment 2 of 4 · 5.5 km · +433 m". */
function clipTitle(race: Race, segment: number): string {
  const segments = getRaceSegments(race)
  const info = segments[segment - 1]
  const course = info ? ` · ${(info.distanceM / 1000).toFixed(1)} km · +${Math.round(info.gainM)} m` : ''
  return `${race.name} · Segment ${segment} of ${segments.length}${course}`
}

/** Course, equipment, nutrition and the first intensity, then Start. */
function Preparation({ race, entryId, present }: { race: Race; entryId: string; present: Present }) {
  const { state, startRace } = useCareer()
  const { consumables, week } = state
  const segments = getRaceSegments(race)
  const [intensity, setIntensity] = useState<Intensity>('target')
  // Taken by default whenever there is stock, also when the stock arrives after the screen opened
  // (e.g. the server's career synced a moment later); only the player's own choice overrides it.
  const [gelChoice, setGel] = useState<boolean | null>(null)
  const [barChoice, setBar] = useState<boolean | null>(null)
  const gel = gelChoice ?? consumables.gel > 0
  const bar = barChoice ?? consumables.bar > 0
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'strategy' | 'equipment'>('strategy')

  async function start() {
    if (busy) return
    setBusy(true)
    setError('')
    const failure = await present(
      1,
      () =>
        startRace({ week: week.number, dayIndex: week.currentDayIndex }, entryId, {
          intensity,
          gel: gel && consumables.gel > 0,
          bar: bar && consumables.bar > 0,
        }),
      (result) => ({ ok: result === null, finished: null }),
    )
    setBusy(false)
    if (failure) setError(START_ERRORS[failure])
  }

  return (
    <Screen eyebrow={`${race.name} · Race day`} title="Race preparation" description="Choose what to carry and how hard to start.">
      {/*
       * Two tabs (owner request, 4 November 2026): Strategy and the equipment worn, so the finish arch
       * and the ground of the picture stay visible. Start race is under both.
       */}
      <div className={styles.tileScreen}>
        <Tabs<'strategy' | 'equipment'>
          label="Race preparation"
          tabs={[
            { id: 'strategy', label: 'Strategy' },
            { id: 'equipment', label: 'Equipment' },
          ]}
          value={tab}
          onChange={setTab}
        >
          {tab === 'strategy' ? (
            <div className={styles.prepPanel}>
              <section className={`${styles.tile} ${styles.tileWide}`} aria-label="Course">
                <span className={styles.tileLabel}>
                  Course · {segments.length} segments, {segments.length - 1} aid {segments.length === 2 ? 'station' : 'stations'}
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
            </div>
          ) : (
            <WornEquipment />
          )}
        </Tabs>

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

/** The pictures of the equipment worn, each with its name and level; opens Equipment. */
function WornEquipment() {
  const { state } = useCareer()
  const worn = state.equipment.map((id) => getEquipmentItem(id)).filter((item) => item !== undefined)
  return (
    <div className={styles.prepPanel}>
      {worn.length ? (
        <ul className={styles.wornGrid} aria-label="Equipment worn">
          {worn.map((item) => (
            <li key={item.id} className={styles.wornItem}>
              <span className={styles.wornArt}>
                <ItemArt item={item} />
              </span>
              <span className={styles.wornName}>{item.label}</span>
              {item.level !== undefined && <span className={styles.wornLevel}>Lvl {item.level}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.tileNote}>Nothing equipped.</p>
      )}
      <Link to="/equipment" className={styles.tileNote}>
        Change equipment ›
      </Link>
    </div>
  )
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
function AidStation({ race, present }: { race: Race; present: Present }) {
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
    // The step runs segment index `segmentsDone`, i.e. segment number segmentsDone + 1.
    const result = await present(
      report.segmentsDone + 1,
      () => stepRace({ segment: report.segmentsDone, stop, intensity }),
      (r) => ({ ok: r.ok, finished: r.ok ? r.finished : null }),
    )
    setBusy(false)
    if (!result.ok) setError(STEP_ERRORS[result.error])
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
              options={STOP_OPTIONS.map((o) => ({ id: o.id, label: `${o.label} ${stopDuration(report.stopS[o.id])}` }))}
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
