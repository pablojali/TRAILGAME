import { useI18n, type MessageKey, type Translate } from '../../i18n/i18n'
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
  intensityHint,
  intensityKey,
  intensityOptions,
  STOP_IDS,
  stopKey,
  stopDuration,
} from './raceStrategyText'
import { RaceClipPlayer } from './RaceClipPlayer'
import { raceClip } from './raceClips'
import { durationText, ordinal, raceTimeText } from './raceText'
import styles from './Races.module.css'

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
  const { t } = useI18n()

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
    if (failure) setError(t(START_ERRORS[failure]))
  }

  return (
    <Screen eyebrow={t('raceRun.eyebrow', { race: race.name })} title={t('raceRun.title')} description={t('raceRun.description')}>
      {/*
       * Two tabs (owner request, 4 November 2026): Strategy and the equipment worn, so the finish arch
       * and the ground of the picture stay visible. Start race is under both.
       */}
      <div className={styles.tileScreen}>
        <Tabs<'strategy' | 'equipment'>
          label={t('raceRun.tabs')}
          tabs={[
            { id: 'strategy', label: t('raceRun.tab.strategy') },
            { id: 'equipment', label: t('raceRun.tab.equipment') },
          ]}
          value={tab}
          onChange={setTab}
        >
          {tab === 'strategy' ? (
            <div className={styles.prepPanel}>
              <section className={`${styles.tile} ${styles.tileWide}`} aria-label={t('raceRun.course')}>
                <span className={styles.tileLabel}>
                  {t('raceRun.courseLabel', { segments: segments.length, count: segments.length - 1 })}
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

              <div className={styles.choiceTiles} role="group" aria-label={t('raceRun.nutrition')}>
                <NutritionToggle label={t('raceRun.gel')} effect={t('raceRun.gelEffect')} stock={consumables.gel} taken={gel} onChange={setGel} />
                <NutritionToggle label={t('raceRun.bar')} effect={t('raceRun.barEffect')} stock={consumables.bar} taken={bar} onChange={setBar} />
              </div>
              {(consumables.gel === 0 || consumables.bar === 0) && (
                <Link to="/equipment?tab=shop" className={styles.tileNote}>
                  {t('raceRun.buyPacks')}
                </Link>
              )}

              <section className={styles.tile} aria-label={t('raceRun.segmentIntensity', { segment: 1 })}>
                <span className={styles.tileLabel}>{t('raceRun.segmentIntensity', { segment: 1 })}</span>
                <div className={styles.chipsTight}>
                  <Chips<Intensity>
                    label={t('raceRun.segmentIntensity', { segment: 1 })}
                    options={intensityOptions(t)}
                    value={intensity}
                    onChange={setIntensity}
                  />
                </div>
                <span className={`${styles.tileNote} ${styles.tileHint}`}>{intensityHint(intensity, t)}</span>
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
          {busy ? t('raceRun.starting') : t('raceRun.start')}
        </button>
      </div>
    </Screen>
  )
}

/** The pictures of the equipment worn, each with its name and level; opens Equipment. */
function WornEquipment() {
  const { state } = useCareer()
  const worn = state.equipment.map((id) => getEquipmentItem(id)).filter((item) => item !== undefined)
  const { t } = useI18n()
  return (
    <div className={styles.prepPanel}>
      {worn.length ? (
        <ul className={styles.wornGrid} aria-label={t('raceRun.equipmentWorn')}>
          {worn.map((item) => (
            <li key={item.id} className={styles.wornItem}>
              <span className={styles.wornArt}>
                <ItemArt item={item} />
              </span>
              <span className={styles.wornName}>{item.label}</span>
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
  const { t, locale } = useI18n()
  const item = label.toLocaleLowerCase(locale === 'de' ? 'en' : locale)
  return (
    <button
      type="button"
      className={styles.choice}
      aria-label={t(none ? 'raceRun.toggleNone' : taken ? 'raceRun.toggleTake' : 'raceRun.toggleLeave', {
        item: locale === 'de' ? label : item,
        effect,
        stock,
      })}
      aria-pressed={!none && taken}
      aria-disabled={none || undefined}
      onClick={() => !none && onChange(!taken)}
    >
      <span className={styles.tileLabel}>{label}</span>
      <strong>{none ? t('raceRun.noneInStock') : taken ? t('raceRun.takeIt') : t('raceRun.leaveIt')}</strong>
      <span className={styles.tileNote}>{t('raceRun.inStock', { effect, stock })}</span>
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
  const { t, locale } = useI18n()

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
    if (!result.ok) setError(t(STEP_ERRORS[result.error]))
  }

  return (
    <Screen
      eyebrow={t('raceRun.aidEyebrow', { race: race.name, station, stations: report.segmentCount - 1 })}
      title={t('raceRun.positionTitle', { position: ordinal(report.position, locale), field: report.fieldSize })}
      description={t('raceRun.aidDescription', { time: raceTimeText(report.elapsedS), segment: station, count: report.segmentCount })}
    >
      {/*
       * The aid station picture stays visible on the left; the report and the decisions are a
       * column on the right (owner request, 2 November 2026). No scrolling.
       */}
      <div className={styles.aidLayout}>
        <div className={styles.aidPanel} role="region" aria-label={t('raceRun.report')}>
          <h2 ref={heading} tabIndex={-1} className={styles.srOnly}>
            {t('raceRun.station', { station })}
          </h2>
          <dl className={styles.statRows}>
            <div>
              <dt>{t('raceRun.raceTime')}</dt>
              <dd>{raceTimeText(report.elapsedS)}</dd>
            </div>
            <div>
              <dt>{t('raceRun.ahead')}</dt>
              <dd>{report.gapAheadS === null ? t('raceRun.youLead') : `+${durationText(report.gapAheadS)}`}</dd>
            </div>
            <div>
              <dt>{t('raceRun.behind')}</dt>
              <dd>{report.gapBehindS === null ? t('raceRun.nobody') : `−${durationText(report.gapBehindS)}`}</dd>
            </div>
            <div>
              <dt>{t('raceRun.energy')}</dt>
              <dd>{formatStat(report.energy)}</dd>
            </div>
            <div>
              <dt>{t('stat.fatigue')}</dt>
              <dd>{formatStat(report.fatigue)}</dd>
            </div>
            <div>
              <dt>{t('raceRun.nutrition')}</dt>
              <dd>
                {[report.nutrition.gel && t('raceRun.nutritionGel'), report.nutrition.bar && t('raceRun.nutritionBar')]
                  .filter(Boolean)
                  .join(' + ') || t('raceRun.none')}
              </dd>
            </div>
            <div>
              <dt>{t('raceRun.segment', { segment: station })}</dt>
              <dd>
                {t(intensityKey(report.last.intensity))} · {durationText(report.last.segmentS)}
              </dd>
            </div>
            <div>
              <dt>{t(lastSegment ? 'raceRun.nextFinish' : 'raceRun.next', { segment: station + 1 })}</dt>
              <dd>
                {(report.next.distanceM / 1000).toFixed(1)} km · +{Math.round(report.next.gainM)} / −
                {Math.round(report.next.lossM)} m
              </dd>
            </div>
          </dl>

          <section className={styles.aidChoice} aria-label={t('raceRun.stopLabel')}>
            <span className={styles.tileLabel}>{t('raceRun.stopLabel')}</span>
            <Chips<AidStop>
              label={t('raceRun.stopLabel')}
              options={STOP_IDS.map((id) => ({ id, label: `${t(stopKey(id))} ${stopDuration(report.stopS[id])}` }))}
              value={stop}
              onChange={setStop}
            />
          </section>

          <section className={styles.aidChoice} aria-label={t('raceRun.segmentIntensity', { segment: station + 1 })}>
            <span className={styles.tileLabel}>{t('raceRun.segmentIntensity', { segment: station + 1 })}</span>
            <Chips<Intensity>
              label={t('raceRun.segmentIntensity', { segment: station + 1 })}
              options={intensityOptions(t)}
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
          {busy
            ? t('raceRun.running')
            : t(lastSegment ? 'raceRun.stopFinish' : 'raceRun.stopContinue', { stop: t(stopKey(stop)) })}
        </button>
      </div>
    </Screen>
  )
}
