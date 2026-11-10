import { itemLabel } from '../../i18n/equipmentText'
import { useI18n, type MessageKey, type Translate } from '../../i18n/i18n'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { formatStat } from '../../components/format'
import { Screen } from '../../components/Screen'
import { Chips, Tabs } from '../../components/Tabs'
import { getEquipmentItem, getRaceEffect } from '../../domain/equipment/items'
import { ItemArt } from '../equipment/EquipmentScreen'
import { getRace, type Race } from '../../domain/races/races'
import type { AidStop, Intensity } from '../../domain/races/strategyConfig'
import { getRaceSegments, type RaceSegment } from '../../game-engine/raceEngine'
import { isRaceDayToday } from '../../game-engine/raceSchedule'
import {
  getEntry,
  estimateFirstSegment,
  getRaceReport,
  planRaceAhead,
  planRaceBeforeStart,
  previewStep,
  projectRace,
  type RaceDayResult,
  type RaceStartError,
  type RaceStepError,
} from '../../game-engine/races'
import type { ServerError } from '../../repositories/supabase/careerOpsClient'
import {
  INTENSITY_IDS,
  intensityHint,
  intensityKey,
  intensityOptions,
  STOP_IDS,
  stopKey,
  stopDuration,
} from './raceStrategyText'
import { aidAdvice, roughDelta, segmentDemand, segmentKind } from './aidStation'
import { coachPortrait } from '../coach/coach'
import { RACE_STYLES, type RaceStyle } from '../../game-engine/racePlan'
import { loadRacePlan, saveRacePlan } from './racePlanStore'
import { RaceClipPlayer } from './RaceClipPlayer'
import { raceClip } from './raceClips'
import { durationText, ordinal, raceTimeText } from './raceText'
import styles from './Races.module.css'
import gelPicture from '../../../assets/ui/nutrition/gel.webp'
import barPicture from '../../../assets/ui/nutrition/bar.webp'

const START_ERRORS: Record<RaceStartError | ServerError, MessageKey> = {
  offline: 'raceRun.startError.offline',
  'server-error': 'raceRun.startError.server-error',
  'day-completed': 'raceRun.startError.day-completed',
  'day-not-current': 'raceRun.startError.day-not-current',
  'wrong-week': 'raceRun.startError.wrong-week',
  'unknown-session': 'raceRun.startError.unknown-session',
  'forced-rest': 'raceRun.startError.forced-rest',
  'unknown-entry': 'raceRun.startError.unknown-entry',
  'already-finished': 'raceRun.startError.already-finished',
  'unknown-race': 'raceRun.startError.unknown-race',
  'race-day': 'raceRun.startError.race-day',
  'not-race-day': 'raceRun.startError.not-race-day',
  'not-scheduled': 'raceRun.startError.not-scheduled',
  'level-too-low': 'raceRun.startError.level-too-low',
  'race-in-progress': 'raceRun.startError.race-in-progress',
  'unknown-intensity': 'raceRun.startError.unknown-intensity',
  'no-gel': 'raceRun.startError.no-gel',
  'no-bar': 'raceRun.startError.no-bar',
}

const STEP_ERRORS: Record<RaceStepError | ServerError, MessageKey> = {
  offline: 'raceRun.stepError.offline',
  'server-error': 'raceRun.stepError.server-error',
  'no-race-in-progress': 'raceRun.stepError.no-race-in-progress',
  'wrong-segment': 'raceRun.stepError.wrong-segment',
  'unknown-intensity': 'raceRun.stepError.unknown-intensity',
  'unknown-stop': 'raceRun.stepError.unknown-stop',
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
  const { t } = useI18n()

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
      <Screen title={t('raceRun.notFound')} description={t('raceRun.notFoundDescription')}>
        <Link to="/races" className={`${button.button} ${button.secondary}`}>
          {t('races.backToRaces')}
        </Link>
      </Screen>
    )
  }
  const clip = clipRun && raceClip(race.id, clipRun.segment)
  const overlay = clipRun && clip && (
    <RaceClipPlayer clip={clip} title={clipTitle(race, clipRun.segment, t)} ready={clipRun.ready} onDone={clipDone} />
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
      <Screen eyebrow={race.name} title={t('raceRun.notRaceDay')} description={t('raceRun.notRaceDayDescription')}>
        <Link to={`/races/${race.id}`} className={`${button.button} ${button.primary}`}>
          {t('raceRun.goToRace')}
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
function clipTitle(race: Race, segment: number, t: Translate): string {
  const segments = getRaceSegments(race)
  const info = segments[segment - 1]
  const course = info ? ` · ${(info.distanceM / 1000).toFixed(1)} km · +${Math.round(info.gainM)} m` : ''
  return `${t('raceRun.clipTitle', { race: race.name, segment, count: segments.length })}${course}`
}

/** Course, equipment, nutrition and the first intensity, then Start. */
type PrepTab = 'strategy' | 'course' | 'equipment'

function Preparation({ race, entryId, present }: { race: Race; entryId: string; present: Present }) {
  const { state, startRace } = useCareer()
  const { consumables, week } = state
  const segments = getRaceSegments(race)
  // Taken by default whenever there is stock, also when the stock arrives after the screen opened
  // (e.g. the server's career synced a moment later); only the player's own choice overrides it.
  const [gelChoice, setGel] = useState<boolean | null>(null)
  const [barChoice, setBar] = useState<boolean | null>(null)
  const gel = gelChoice ?? consumables.gel > 0
  const bar = barChoice ?? consumables.bar > 0
  // The automatic strategy (owner request, 10 November 2026): a style proposes every segment's
  // intensity; the segments set by hand stay as set until the style changes.
  const [style, setStyleState] = useState<RaceStyle>(() => loadRacePlan(entryId)?.style ?? 'balanced')
  const [fixed, setFixed] = useState<(Intensity | null)[]>(() => loadRacePlan(entryId)?.fixed ?? [])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<PrepTab>('strategy')
  const { t, locale } = useI18n()

  const nutrition = { gel: gel && consumables.gel > 0, bar: bar && consumables.bar > 0 }
  const plan = planRaceBeforeStart(state, race, nutrition, style, fixed)
  const intensity = plan[0] ?? 'target'
  const estimate = estimateFirstSegment(state, race, nutrition, intensity)

  function setStyle(next: RaceStyle) {
    setStyleState(next)
    setFixed([])
  }

  function setSegment(index: number, value: Intensity) {
    setFixed((current) => {
      const next = segments.map((_, i) => current[i] ?? null)
      next[index] = value
      return next
    })
  }

  async function start() {
    if (busy) return
    setBusy(true)
    setError('')
    saveRacePlan(entryId, { style, fixed })
    const failure = await present(
      1,
      () => startRace({ week: week.number, dayIndex: week.currentDayIndex }, entryId, { intensity, ...nutrition }),
      (result) => ({ ok: result === null, finished: null }),
    )
    setBusy(false)
    if (failure) setError(t(START_ERRORS[failure]))
  }

  return (
    <Screen eyebrow={t('raceRun.eyebrow', { race: race.name })} title={t('raceRun.title')} description={t('raceRun.description')}>
      {/*
       * Tabs (owner requests, 4 and 10 November 2026): Strategy, the Course with each segment's
       * effort and planned intensity, and the equipment worn. Start race is under all of them.
       */}
      <div className={styles.tileScreen}>
        <Tabs<PrepTab>
          label={t('raceRun.tabs')}
          tabs={[
            { id: 'strategy', label: t('raceRun.tab.strategy') },
            { id: 'course', label: t('raceRun.tab.course') },
            { id: 'equipment', label: t('raceRun.tab.equipment') },
          ]}
          value={tab}
          onChange={setTab}
        >
          {tab === 'strategy' ? (
            <div className={styles.prepPanel}>
              <div className={styles.choiceTiles} role="group" aria-label={t('raceRun.nutrition')} data-coach="nutrition">
                <NutritionToggle picture={gelPicture} label={t('raceRun.gel')} effect={t('raceRun.gelEffect')} stock={consumables.gel} taken={gel} onChange={setGel} />
                <NutritionToggle picture={barPicture} label={t('raceRun.bar')} effect={t('raceRun.barEffect')} stock={consumables.bar} taken={bar} onChange={setBar} />
              </div>
              {(consumables.gel === 0 || consumables.bar === 0) && (
                <Link to="/equipment?tab=shop" className={styles.tileNote}>
                  {t('raceRun.buyPacks')}
                </Link>
              )}

              <section className={styles.tile} aria-label={t('raceRun.style')}>
                <span className={styles.tileLabel}>{t('raceRun.style')}</span>
                <div className={styles.chipsTight}>
                  <Chips<RaceStyle>
                    label={t('raceRun.style')}
                    options={RACE_STYLES.map((id) => ({ id, label: t(`raceRun.style.${id}` as MessageKey) }))}
                    value={style}
                    onChange={setStyle}
                  />
                </div>
                <span className={`${styles.tileNote} ${styles.tileHint}`}>
                  {t(`raceRun.styleHint.${style}` as MessageKey)} {t('raceRun.styleNote')}
                </span>
              </section>

              <section className={styles.tile} aria-label={t('raceRun.segmentIntensity', { segment: 1 })} data-coach="intensity">
                <span className={styles.tileLabel}>{t('raceRun.segmentIntensity', { segment: 1 })}</span>
                <div className={styles.chipsTight}>
                  <Chips<Intensity>
                    label={t('raceRun.segmentIntensity', { segment: 1 })}
                    options={intensityOptions(t)}
                    value={intensity}
                    onChange={(value) => setSegment(0, value)}
                  />
                </div>
                <span className={`${styles.tileNote} ${styles.tileHint}`}>{intensityHint(intensity, t, race.distanceKm)}</span>
                <span className={styles.estimate}>
                  <span>{t('raceRun.estimatedSegment', { time: durationText(Math.round(estimate.segmentS / 10) * 10) })}</span>
                  <span>{t('raceRun.estimatedFatigue', { n: Math.max(0, Math.round(estimate.fatigueGain)) })}</span>
                </span>
              </section>
            </div>
          ) : tab === 'course' ? (
            <div className={styles.prepPanel}>
              <section className={`${styles.tile} ${styles.tileWide}`} aria-label={t('raceRun.courseOverview')}>
                <span className={styles.tileLabel}>{t('raceRun.courseOverview')}</span>
                <ol className={styles.courseRows}>
                  {segments.map((segment, i) => (
                    <li key={segment.index}>
                      <span className={styles.courseHead}>
                        <strong>
                          S{segment.index + 1} · {t(`raceRun.courseKind.${courseKind(segment)}` as MessageKey)}
                        </strong>
                        <span>{formatKm(segment.distanceM, locale)} km</span>
                      </span>
                      <span className={styles.courseDetail}>{courseDetail(segment, t, locale)}</span>
                      <select
                        className={styles.courseSelect}
                        aria-label={t('raceRun.segmentIntensity', { segment: segment.index + 1 })}
                        data-manual={fixed[i] ? 'true' : undefined}
                        value={plan[i]}
                        onChange={(event) => setSegment(i, event.target.value as Intensity)}
                      >
                        {intensityOptions(t).map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ol>
                <dl className={styles.courseTotals}>
                  <div>
                    <dt>{t('raceRun.totalDistance')}</dt>
                    <dd>{formatKm(segments.reduce((sum, s) => sum + s.distanceM, 0), locale)} km</dd>
                  </div>
                  <div>
                    <dt>{t('raceRun.totalGain')}</dt>
                    <dd>{Math.round(segments.reduce((sum, s) => sum + s.gainM, 0)).toLocaleString(locale)} m</dd>
                  </div>
                </dl>
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
        <button type="button" className={`${button.button} ${button.primary}`} aria-disabled={busy || undefined} onClick={start} data-coach="start-race">
          {busy ? t('raceRun.starting') : t('raceRun.start')}
        </button>
      </div>
    </Screen>
  )
}

/** The kind of effort in one word for the course overview (a technical descent is a descent here). */
function courseKind(segment: RaceSegment): 'climb' | 'descent' | 'runnable' | 'mixed' {
  const kind = segmentKind(segment)
  return kind === 'technical-descent' ? 'descent' : kind
}

function formatKm(metres: number, locale: string): string {
  return (Math.round(metres / 100) / 10).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** "+95 m D+ · 2.4% average gradient", "−95 m D− · Technical descent" or "+40 / −60 m". */
function courseDetail(segment: RaceSegment, t: Translate, locale: string): string {
  const gain = Math.round(segment.gainM)
  const loss = Math.round(segment.lossM)
  const kind = segmentKind(segment)
  if (kind === 'climb') {
    const grade = (Math.round((segment.gainM / segment.distanceM) * 1000) / 10).toLocaleString(locale)
    return t('raceRun.segmentClimb', { gain, grade: `${grade}%` })
  }
  if (kind === 'technical-descent') return t('raceRun.segmentTechnical', { loss })
  if (kind === 'descent') return t('raceRun.segmentDescent', { loss })
  return t('raceRun.segmentMixed', { gain, loss })
}

/** The pictures of the equipment worn, each with its name and level; opens Equipment. */
function WornEquipment() {
  const { state } = useCareer()
  const worn = state.equipment.map((id) => getEquipmentItem(id)).filter((item) => item !== undefined)
  const { t, locale } = useI18n()
  return (
    <div className={styles.prepPanel}>
      {worn.length ? (
        <ul className={styles.wornGrid} aria-label={t('raceRun.equipmentWorn')}>
          {worn.map((item) => (
            <li key={item.id} className={styles.wornItem}>
              <span className={styles.wornArt}>
                <ItemArt item={item} />
              </span>
              <span className={styles.wornName}>{itemLabel(item, locale)}</span>
              {item.level !== undefined && <span className={styles.wornLevel}>{t('common.lvl', { level: item.level })}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.tileNote}>{t('raceRun.nothingEquipped')}</p>
      )}
      <Link to="/equipment" className={styles.tileNote}>
        {t('raceRun.changeEquipment')}
      </Link>
    </div>
  )
}

function NutritionToggle({
  picture,
  label,
  effect,
  stock,
  taken,
  onChange,
}: {
  picture: string
  label: string
  effect: string
  stock: number
  taken: boolean
  onChange(taken: boolean): void
}) {
  const none = stock === 0
  const { t, locale } = useI18n()
  const item = label.toLocaleLowerCase(locale === 'de' ? 'en' : locale)
  return (
    <button
      type="button"
      className={`${styles.choice} ${styles.nutrition}`}
      aria-label={t(none ? 'raceRun.toggleNone' : taken ? 'raceRun.toggleTake' : 'raceRun.toggleLeave', {
        item: locale === 'de' ? label : item,
        effect,
        stock,
      })}
      aria-pressed={!none && taken}
      aria-disabled={none || undefined}
      onClick={() => !none && onChange(!taken)}
    >
      {/*
       * The gel or bar itself, lit with a check when it goes in the race, faded when it stays
       * (owner request, 9 November 2026: "Leave it" read as a choice and left them at home).
       */}
      <span className={styles.nutritionArt}>
        <img src={picture} alt="" />
        {!none && taken && <span className={styles.nutritionCheck} aria-hidden="true">✓</span>}
      </span>
      <span className={styles.nutritionText}>
        <span className={styles.tileLabel}>{label}</span>
        {(none || !taken) && <strong>{none ? t('raceRun.noneInStock') : t('raceRun.leaveIt')}</strong>}
        <span className={styles.tileNote}>{t('raceRun.inStock', { effect, stock })}</span>
      </span>
    </button>
  )
}

/** The elevation of the next segment as a small filled line (owner request, 9 November 2026). */
function SegmentProfile({ segment }: { segment: RaceSegment }) {
  const points: [number, number][] = [[0, 0]]
  let x = 0
  let y = 0
  for (const { block } of segment.pieces) {
    x += block.lengthM
    y += block.gainM - block.lossM
    points.push([x, y])
  }
  const ys = points.map((p) => p[1])
  const low = Math.min(...ys)
  const span = Math.max(Math.max(...ys) - low, 150)
  const width = 100
  const height = 32
  const at = ([px, py]: [number, number]) =>
    `${((px / Math.max(x, 1)) * width).toFixed(1)},${(height - 2 - ((py - low) / span) * (height - 6)).toFixed(1)}`
  const line = points.map(at).join(' ')
  return (
    <svg className={styles.segmentProfile} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,${height} ${line} ${width},${height}`} />
      <polyline points={line} />
    </svg>
  )
}

function Meter({ label, value, tone }: { label: string; value: number; tone: 'energy' | 'fatigue' }) {
  return (
    <div className={styles.meter}>
      <dt>{label}</dt>
      <dd>
        <span className={styles.meterTrack} aria-hidden="true">
          <span className={styles[tone]} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
        </span>
        {formatStat(value)}
      </dd>
    </div>
  )
}

/**
 * The report at an aid station and the decisions for the next segment (owner mockup, 9 November
 * 2026): where the runner is, how they feel, what the next segment looks like, the approximate
 * consequences of each stop and pace, and a coach's tip only when it matters.
 */
function AidStation({ race, present }: { race: Race; present: Present }) {
  const { state, stepRace } = useCareer()
  const report = getRaceReport(state)!
  const [stop, setStop] = useState<AidStop>('normal')
  const station = report.segmentsDone
  // The preparation's strategy proposes this segment's intensity (owner request, 10 November
  // 2026); without one (another device), the last intensity as before.
  const suggested = useMemo(() => {
    const stored = loadRacePlan(state.activeRace!.entryId)
    return stored ? (planRaceAhead(state, stored.style, stored.fixed.slice(station))[0] ?? null) : null
    // Once per aid station: the plan depends on the race so far, not on the choices being made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station])
  const [intensity, setIntensity] = useState<Intensity>(suggested ?? report.last.intensity)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const lastSegment = report.segmentsDone === report.segmentCount - 1
  const { t, locale } = useI18n()

  // Every new aid station: back to the defaults, focus on the report.
  useEffect(() => {
    setStop('normal')
    if (suggested) setIntensity(suggested)
    setError('')
    heading.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station])

  const next = report.next
  const segments = getRaceSegments(race)
  const totalM = segments.reduce((sum, s) => sum + s.distanceM, 0)
  const gainSoFar = segments.slice(0, next.index).reduce((sum, s) => sum + s.gainM, 0)
  const kind = segmentKind(next)
  const demand = segmentDemand(next)

  // Approximate consequences, from the same engine the server runs (owner request: estimates).
  const byStop = Object.fromEntries(STOP_IDS.map((id) => [id, previewStep(state, id, intensity)]))
  const byIntensity = Object.fromEntries(INTENSITY_IDS.map((id) => [id, previewStep(state, stop, id)]))
  const target = byIntensity.target
  const projection = projectRace(state, stop, intensity)
  const active = state.activeRace!
  const technical = active.attributes.technical + getRaceEffect(active.equipment).attributes.technical
  const advice = aidAdvice({
    energy: report.energy,
    kind,
    intensity,
    stop,
    lastSegment,
    gapAheadS: report.gapAheadS,
    gapBehindS: report.gapBehindS,
    technical,
  })
  const spoken = (seconds: number) =>
    seconds < 60 ? t('raceRun.seconds', { count: Math.round(seconds) }) : durationText(seconds)
  const gapSentence =
    report.gapAheadS !== null && report.gapBehindS !== null
      ? t('raceRun.gapBoth', { ahead: spoken(report.gapAheadS), behind: spoken(report.gapBehindS) })
      : report.gapAheadS !== null
        ? t('raceRun.gapLast', { ahead: spoken(report.gapAheadS) })
        : report.gapBehindS !== null
          ? t('raceRun.gapLead', { behind: spoken(report.gapBehindS) })
          : ''
  const portrait = coachPortrait(state.athlete.sex, state.athlete.appearance.skin)

  function timeText(seconds: number): string {
    const delta = roughDelta(seconds)
    return delta.sign ? t('raceRun.timeDelta', { delta: `${delta.sign}${delta.text}` }) : t('raceRun.aboutSame')
  }

  function fatigueText(change: number): string {
    const rounded = Math.round(change)
    if (rounded === 0) return t('raceRun.fatigueSame')
    return t('raceRun.fatigueDelta', { delta: `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}` })
  }

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
    if (!result.ok) setError(t(STEP_ERRORS[result.error]))
  }

  return (
    <Screen
      eyebrow={t('raceRun.aidEyebrow', { race: race.name, station, stations: report.segmentCount - 1 })}
      title={t('raceRun.positionTitle', { position: ordinal(report.position, locale), field: report.fieldSize })}
      description={t('raceRun.aidDescription', { time: raceTimeText(report.elapsedS), segment: station, count: report.segmentCount })}
    >
      <div className={styles.aidLayout}>
        <div className={styles.aidPanel} role="region" aria-label={t('raceRun.report')}>
          <h2 ref={heading} tabIndex={-1} className={styles.srOnly}>
            {t('raceRun.station', { station })}
          </h2>

          <section className={styles.aidCard} aria-label={t('raceRun.runnerState')}>
            <div className={styles.aidProgress}>
              <span>
                {t('raceRun.progress', {
                  done: Math.round(next.startM / 1000),
                  total: Math.round(totalM / 1000),
                  gain: Math.round(gainSoFar).toLocaleString(locale),
                })}
              </span>
              <span>{raceTimeText(report.elapsedS)}</span>
              <span className={styles.aidProgressTrack} aria-hidden="true">
                <span style={{ width: `${(next.startM / totalM) * 100}%` }} />
              </span>
            </div>
            <dl className={styles.stateRow}>
              <Meter label={t('raceRun.energy')} value={report.energy} tone="energy" />
              <Meter label={t('stat.fatigue')} value={report.fatigue} tone="fatigue" />
              <div>
                <dt>{t('raceRun.nutrition')}</dt>
                <dd>
                  {[report.nutrition.gel && t('raceRun.nutritionGel'), report.nutrition.bar && t('raceRun.nutritionBar')]
                    .filter(Boolean)
                    .join(' + ') || t('raceRun.none')}
                </dd>
              </div>
            </dl>
          </section>

          <section className={styles.aidCard} aria-label={t('raceRun.situation')}>
            <span className={styles.tileLabel}>{t('raceRun.situation')}</span>
            <dl className={styles.gapRow}>
              <div>
                <dt>
                  {report.gapAheadS === null ? t('raceRun.ahead') : t('raceRun.runnerAhead', { place: report.position - 1 })}
                </dt>
                <dd className={styles.gapAhead}>
                  {report.gapAheadS === null ? t('raceRun.youLead') : `+${durationText(report.gapAheadS)}`}
                </dd>
              </div>
              <div>
                <dt>
                  {report.gapBehindS === null ? t('raceRun.behind') : t('raceRun.runnerBehind', { place: report.position + 1 })}
                </dt>
                <dd>{report.gapBehindS === null ? t('raceRun.nobody') : durationText(report.gapBehindS)}</dd>
              </div>
            </dl>
            {gapSentence && <p className={styles.gapSentence}>{gapSentence}</p>}
          </section>

          <section className={`${styles.aidCard} ${styles.nextCard}`}>
            <span className={styles.tileLabel}>
              {t(lastSegment ? 'raceRun.nextFinish' : 'raceRun.next', { segment: station + 1 })}
            </span>
            <SegmentProfile segment={next} />
            <div className={styles.nextFacts}>
              <strong>{t(`raceRun.kind.${kind}` as MessageKey)}</strong>
              <span className={styles[`demand-${demand}`]}>{t(`raceRun.demand.${demand}` as MessageKey)}</span>
            </div>
            <span className={styles.nextCourse}>
              {(next.distanceM / 1000).toFixed(1)} km · +{Math.round(next.gainM)} / −{Math.round(next.lossM)} m
            </span>
          </section>

          <section className={styles.aidCard} aria-label={t('raceRun.stopLabel')}>
            <span className={styles.tileLabel}>{t('raceRun.stopLabel')}</span>
            <div className={styles.optionRow}>
              {STOP_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={styles.option}
                  aria-pressed={id === stop}
                  aria-label={`${t(stopKey(id))} ${stopDuration(report.stopS[id])}`}
                  onClick={() => setStop(id)}
                >
                  <span className={styles.optionHead}>
                    <strong>{t(stopKey(id))}</strong>
                    <span>{stopDuration(report.stopS[id])}</span>
                  </span>
                  <span className={styles.good}>
                    {t('raceRun.recovers', { n: Math.round(byStop[id]?.recovered ?? 0) })}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.aidCard} aria-label={t('raceRun.segmentIntensity', { segment: station + 1 })}>
            <span className={styles.tileLabel}>{t('raceRun.segmentIntensity', { segment: station + 1 })}</span>
            <div className={styles.paceGrid}>
              {INTENSITY_IDS.map((id) => {
                const preview = byIntensity[id]
                return (
                  <button
                    key={id}
                    type="button"
                    className={styles.option}
                    aria-pressed={id === intensity}
                    aria-label={t(intensityKey(id))}
                    onClick={() => setIntensity(id)}
                  >
                    <strong>
                      {t(intensityKey(id))}
                      {id === suggested && <span className={styles.planBadge}>{t('raceRun.planned')}</span>}
                    </strong>
                    {preview && target && id !== 'target' ? (
                      <span>
                        {timeText(preview.segmentS - target.segmentS)} ·{' '}
                        {fatigueText(preview.fatigueAtArrival - target.fatigueAtArrival)}
                      </span>
                    ) : (
                      preview && <span>{durationText(Math.round(preview.segmentS))}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </section>

          {projection && (
            <section className={styles.aidCard} aria-label={t('raceRun.projection')}>
              <span className={styles.tileLabel}>{t('raceRun.projection')}</span>
              <dl className={styles.projection}>
                <div>
                  <dt>{t('raceRun.energyAtFinish')}</dt>
                  <dd className={styles.gapAhead}>≈ {Math.round(100 - projection.fatigueAtFinish)}</dd>
                </div>
                <div>
                  <dt>{t('raceRun.fatigueAtFinish')}</dt>
                  <dd>≈ {Math.round(projection.fatigueAtFinish)}</dd>
                </div>
                <div>
                  <dt>{t('raceRun.remaining')}</dt>
                  <dd>≈ {raceTimeText(Math.round(projection.remainingS / 10) * 10)}</dd>
                </div>
                <div>
                  <dt>{t('raceRun.estimatedPlace')}</dt>
                  <dd>
                    {projection.positionRange[0] === projection.positionRange[1]
                      ? ordinal(projection.positionRange[0], locale)
                      : `${ordinal(projection.positionRange[0], locale)}–${ordinal(projection.positionRange[1], locale)}`}
                  </dd>
                </div>
              </dl>
              <span className={styles.projectionNote}>{t('raceRun.projectionNote')}</span>
            </section>
          )}

          {advice && (
            <aside className={styles.coachTip} aria-label={t('raceRun.coachTip')}>
              {portrait ? <img src={portrait} alt="" /> : <span aria-hidden="true">💡</span>}
              <p>
                <strong>{t('raceRun.coachTip')}</strong>
                {t(`raceRun.advice.${advice}` as MessageKey)}
              </p>
            </aside>
          )}
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
          {busy
            ? t('raceRun.running')
            : t(lastSegment ? 'raceRun.stopFinish' : 'raceRun.stopContinue', { stop: t(stopKey(stop)) })}
        </button>
      </div>
    </Screen>
  )
}
