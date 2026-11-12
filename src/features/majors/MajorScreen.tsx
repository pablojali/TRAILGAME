import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { racePhoto } from '../../components/backdrop/backdrops'
import { Screen } from '../../components/Screen'
import { Chips, Tabs } from '../../components/Tabs'
import { getLevel } from '../../domain/athlete/levels'
import { bandOfLevel, defaultPlan, type MajorPlan } from '../../domain/major/major'
import { getRace } from '../../domain/races/races'
import { getRaceSegments } from '../../game-engine/raceEngine'
import { RACE_STYLES, type RaceStyle } from '../../game-engine/racePlan'
import { planRaceBeforeStart, previewPlannedSegment } from '../../game-engine/races'
import { useI18n, type MessageKey } from '../../i18n/i18n'
import type { PlayerMajor } from '../../server/majorOps'
import { formatFatigue } from '../../components/format'
import { courseDetail } from '../races/courseText'
import { SegmentProfile } from '../races/RaceRunScreen'
import { intensityOptions, STOP_IDS, stopKey } from '../races/raceStrategyText'
import { durationText, raceTimeText } from '../races/raceText'
import { levelRange, untilText, whenText } from './majorText'
import { LiveRace } from './LiveRace'
import { majorPhase, useMajors } from './useMajors'
import styles from './Majors.module.css'

type Tab = 'event' | 'plan'

/**
 * A Sunday Major for the player (owner specification, phase 2): when it starts in their time,
 * the course, the categories, registering, the aid-station plan and READY. The live race comes in
 * the next phases; until then a locked grid says so.
 */
export function MajorScreen() {
  const { majorId = '' } = useParams()
  const { majors, error, busy, act, mediaUrl, available } = useMajors()
  const { t, locale } = useI18n()
  const [tab, setTab] = useState<Tab>('event')
  const [message, setMessage] = useState('')
  const now = useNow()
  const major = majors?.find((m) => m.id === majorId)

  if (!available) return <Screen title={t('major.eyebrow')} description={t('major.error.offline')} />
  if (!major) {
    return <Screen title={t('major.eyebrow')} description={majors ? t('major.notFound') : error ? t(`major.error.${error}` as MessageKey) : t('major.loading')} />
  }
  const race = getRace(major.raceId)
  const phase = majorPhase(major, now)
  // On the grid: the live race (phase 4) in place of the event and plan.
  const racing = major.registration?.status === 'RACING'
  const run = async (request: Parameters<typeof act>[0], done = '') => {
    setMessage('')
    const problem = await act(request)
    setMessage(problem ? t(`major.error.${problem}` as MessageKey) : done)
  }

  return (
    <Screen
      eyebrow={t('major.eyebrow')}
      title={major.name}
      description={t('major.start', { when: `${whenText(major.scheduledStartAt, locale)} · ${untilText(major.scheduledStartAt, now, locale)}` })}
    >
      <div className={styles.screen}>
        {racing ? (
          <LiveRace major={major} mediaUrl={mediaUrl} />
        ) : (
          <Tabs<Tab>
            label={major.name}
            tabs={[
              { id: 'event', label: t('major.tab.event') },
              { id: 'plan', label: t('major.tab.plan') },
            ]}
            value={tab}
            onChange={setTab}
          >
            {tab === 'event' ? (
              <div className={styles.panel}>
                <div className={styles.hero}>
                  {major.bannerPath ? (
                    <img src={mediaUrl(major.bannerPath)} alt="" />
                  ) : race && racePhoto(race.id) ? (
                    <img src={racePhoto(race.id)} alt="" />
                  ) : null}
                  <span className={`${styles.chip} ${styles[`phase-${phase}`] ?? ''}`}>
                    {phase === 'SCHEDULED' && major.registrationOpenAt
                      ? t('major.status.SCHEDULED', { when: whenText(major.registrationOpenAt, locale) })
                      : t(`major.status.${phase}` as MessageKey)}
                  </span>
                </div>
                <div className={styles.info}>
                <p className={styles.start}>
                  {t('major.start', { when: `${whenText(major.scheduledStartAt, locale)} · ${untilText(major.scheduledStartAt, now, locale)}` })}
                </p>
                {race && (
                  <p className={styles.course}>
                    {t('major.course', { race: race.name, km: race.distanceKm, gain: race.elevationGainM.toLocaleString(locale) })}
                  </p>
                )}
                {major.description && <p className={styles.description}>{major.description}</p>}
                {major.status === 'CANCELLED' && major.cancelReason && <p className={styles.warning}>{t('major.cancelReason', { reason: major.cancelReason })}</p>}
                </div>
                <Categories major={major} />
                <YourEntry major={major} phase={phase} now={now} />
              </div>
            ) : (
              <PlanPanel major={major} onSave={(plan) => run({ action: 'save-plan', id: major.id, plan })} />
            )}
          </Tabs>
        )}

        <div className={styles.grow} />
        {message && (
          <p role="status" className={styles.message}>
            {message}
          </p>
        )}
        <div className={styles.actionBar}>
          <Actions major={major} phase={phase} busy={busy} run={run} />
        </div>
      </div>
    </Screen>
  )
}

/** Re-renders every 15 seconds, for the countdowns and the READY window opening. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

function Categories({ major }: { major: PlayerMajor }) {
  const { state } = useCareer()
  const { t } = useI18n()
  const level = getLevel(state.athlete.xp)
  const yours = major.registration?.categoryIdx ?? bandOfLevel(major.categories.map((c) => ({ ...c, min: c.minLevel, max: c.maxLevel })), level)?.idx
  return (
    <ul className={styles.categories} aria-label={t('major.yourCategory')}>
      {major.categories.map((c) => {
        const counts = major.entrants[c.idx] ?? { main: 0, waitlist: 0 }
        return (
          <li key={c.idx} aria-current={c.idx === yours || undefined}>
            <span>{t('major.category', { name: c.name, range: levelRange(c.minLevel, c.maxLevel) })}</span>
            <span className={styles.count}>
              {t('major.entrants', { main: counts.main, limit: major.participantLimit ?? 50, waitlist: counts.waitlist })}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function YourEntry({ major, phase, now }: { major: PlayerMajor; phase: ReturnType<typeof majorPhase>; now: number }) {
  const { t, locale } = useI18n()
  const mine = major.registration
  if (!mine || mine.status === 'WITHDRAWN') return null
  const status =
    mine.status === 'REGISTERED' && mine.list === 'waitlist' ? t('major.you.waitlist') : t(`major.you.${mine.status}` as MessageKey)
  return (
    <section className={styles.entry} aria-label={status}>
      <strong>{status}</strong>
      <span>{t('major.levelFrozen', { level: mine.level })}</span>
      {(mine.status === 'REGISTERED' || mine.status === 'READY') &&
        (phase === 'READY' ? (
          <span>{t('major.readyHint')}</span>
        ) : (
          major.readyOpenAt && <span>{t('major.readyWaits', { when: `${whenText(major.readyOpenAt, locale)} (${untilText(major.readyOpenAt, now, locale)})` })}</span>
        ))}
      {mine.status === 'RACING' && <span>{t('major.lockedHint')}</span>}
    </section>
  )
}

function Actions({
  major,
  phase,
  busy,
  run,
}: {
  major: PlayerMajor
  phase: ReturnType<typeof majorPhase>
  busy: boolean
  run(request: { action: 'register' | 'withdraw' | 'ready'; id: string }): Promise<void>
}) {
  const { t } = useI18n()
  const mine = major.registration
  const active = mine && (mine.status === 'REGISTERED' || mine.status === 'READY')
  const primary = `${button.button} ${button.primary}`
  if (phase === 'REGISTRATION_OPEN' && !active) {
    return (
      <button type="button" className={primary} aria-disabled={busy || undefined} onClick={() => !busy && void run({ action: 'register', id: major.id })}>
        {t('major.register')}
      </button>
    )
  }
  if (!active || (phase !== 'REGISTRATION_OPEN' && phase !== 'READY')) {
    return (
      <Link to="/races" className={`${button.button} ${button.secondary}`}>
        ‹ {t('races.title')}
      </Link>
    )
  }
  return (
    <div className={styles.actions}>
      <button type="button" className={`${button.button} ${button.secondary}`} aria-disabled={busy || undefined} onClick={() => !busy && void run({ action: 'withdraw', id: major.id })}>
        {t('major.withdraw')}
      </button>
      {phase === 'READY' && (
        <button type="button" className={primary} aria-disabled={busy || undefined} onClick={() => !busy && void run({ action: 'ready', id: major.id })}>
          {mine.status === 'READY' ? t('major.readyAgain') : t('major.ready')}
        </button>
      )}
    </div>
  )
}

/**
 * The aid-station plan (owner specification §4.1; owner request of 12 November 2026): a style that
 * fills every segment, the gel and bar, and a tab per segment with what it is (distance, ascent,
 * descent, technicality, profile) and what each choice gives there, from the runner as they are now
 * (time, gain or loss against Target pace, fatigue on arrival, and the stop after it). Every change
 * is saved at once; the plan applies wherever the runner does not decide in time.
 */
function PlanPanel({ major, onSave }: { major: PlayerMajor; onSave(plan: MajorPlan): Promise<void> }) {
  const { state } = useCareer()
  const { t, locale } = useI18n()
  const race = getRace(major.raceId)
  const raceSegments = race ? getRaceSegments(race) : []
  const segments = raceSegments.length
  const saved = major.registration?.plan ?? null
  const [plan, setPlan] = useState<MajorPlan>(() => saved ?? defaultPlan(segments))
  const [open, setOpen] = useState(0)
  const mine = major.registration
  const editable = mine && (mine.status === 'REGISTERED' || mine.status === 'READY') && major.status === 'REGISTRATION_OPEN'
  if (!race) return null
  if (!mine || mine.status === 'WITHDRAWN') return <p className={styles.hint}>{t('major.plan.registerFirst')}</p>

  // Every change is saved at once (owner feedback, 12 November 2026: a plan left unsaved was lost,
  // and READY took the old one). READY waits while a save is on its way.
  const change = (next: MajorPlan) => {
    setPlan(next)
    if (editable) void onSave(next)
  }
  const nutrition = { gel: plan.gel && state.consumables.gel > 0, bar: plan.bar && state.consumables.bar > 0 }
  const setStyle = (style: RaceStyle) => {
    const intensities = planRaceBeforeStart(state, race, nutrition, style)
    change({ ...plan, style, segments: plan.segments.map((s, i) => ({ ...s, intensity: intensities[i] ?? s.intensity })) })
  }
  const setSegment = (i: number, update: Partial<MajorPlan['segments'][number]>) =>
    change({ ...plan, segments: plan.segments.map((s, j) => (j === i ? { ...s, ...update } : s)) })
  const stored = JSON.stringify(plan) === JSON.stringify(saved ?? defaultPlan(segments))

  const index = Math.min(open, segments - 1)
  const segment = raceSegments[index]!
  const chosen = plan.segments[index]!
  const preview = previewPlannedSegment(state, race, nutrition, plan.segments, index)
  const target = preview.options.target.segmentS
  const signed = (seconds: number) => (Math.abs(seconds) < 1 ? '±0:00' : `${seconds < 0 ? '−' : '+'}${durationText(Math.abs(seconds))}`)
  const place = (k: number) => (k === 0 ? t('major.plan.startLine') : k === segments ? t('major.plan.finishLine') : t('major.plan.aid', { n: k }))

  return (
    <div className={`${styles.panel} ${styles.planCard}`}>
      <p className={styles.hint}>{t('major.plan.hint')}</p>
      <div className={styles.styles}>
        <Chips<RaceStyle>
          label={t('raceRun.style')}
          options={RACE_STYLES.map((id) => ({ id, label: t(`raceRun.style.${id}` as MessageKey) }))}
          value={plan.style ?? ('' as RaceStyle)}
          onChange={(style) => editable && setStyle(style)}
        />
      </div>
      <div className={styles.nutrition}>
        {(['gel', 'bar'] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={styles.toggle}
            aria-pressed={plan[item]}
            disabled={!editable}
            onClick={() => change({ ...plan, [item]: !plan[item] })}
          >
            {t(item === 'gel' ? 'raceRun.gel' : 'raceRun.bar')} · {state.consumables[item]}
          </button>
        ))}
      </div>

      <div className={styles.segmentTabs} role="tablist" aria-label={t('major.plan.tabs')}>
        {raceSegments.map((_, k) => (
          <button key={k} type="button" role="tab" aria-selected={k === index} className={styles.segmentTab} onClick={() => setOpen(k)}>
            {t('major.plan.segment', { n: k + 1 })}
          </button>
        ))}
      </div>

      <section className={styles.segmentCard} aria-label={t('major.plan.segment', { n: index + 1 })}>
        <div className={styles.segmentHead}>
          <strong>
            {place(index)} → {place(index + 1)}
          </strong>
          <span>
            {(segment.distanceM / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} km · +{Math.round(segment.gainM)} m · −{Math.round(segment.lossM)} m
            {segment.technicality > 0 ? ` · ${t('major.plan.technical', { n: segment.technicality })}` : ''}
          </span>
        </div>
        <SegmentProfile segment={segment} />
        <p className={styles.hint}>{courseDetail(segment, t, locale)}</p>
        <p className={styles.hint}>
          {t('major.plan.arrive', { time: raceTimeText(Math.round(preview.startS)), fatigue: formatFatigue(preview.startFatigue) })}
        </p>

        <table className={styles.choiceTable}>
          <caption>{t('major.plan.pace')}</caption>
          <thead>
            <tr>
              <th />
              <th>{t('major.plan.time')}</th>
              <th>{t('major.plan.vsTarget')}</th>
              <th>{t('major.plan.fatigueArrival')}</th>
            </tr>
          </thead>
          <tbody>
            {intensityOptions(t).map((option) => {
              const row = preview.options[option.id]
              return (
                <tr key={option.id} aria-selected={chosen.intensity === option.id}>
                  <th scope="row">
                    <button type="button" className={styles.choice} aria-pressed={chosen.intensity === option.id} disabled={!editable} onClick={() => setSegment(index, { intensity: option.id })}>
                      {option.label}
                    </button>
                  </th>
                  <td>{durationText(Math.round(row.segmentS))}</td>
                  <td className={row.segmentS < target - 0.5 ? styles.gain : row.segmentS > target + 0.5 ? styles.loss : ''}>{signed(row.segmentS - target)}</td>
                  <td>{formatFatigue(row.fatigueAtArrival)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {preview.stops && chosen.stop !== null ? (
          <table className={styles.choiceTable}>
            <caption>{t('major.plan.stopAfter', { place: place(index + 1) })}</caption>
            <thead>
              <tr>
                <th />
                <th>{t('major.plan.time')}</th>
                <th />
                <th>{t('major.plan.fatigueAfter')}</th>
              </tr>
            </thead>
            <tbody>
              {STOP_IDS.map((id) => {
                const row = preview.stops![id]
                return (
                  <tr key={id} aria-selected={chosen.stop === id}>
                    <th scope="row">
                      <button type="button" className={styles.choice} aria-pressed={chosen.stop === id} disabled={!editable} onClick={() => setSegment(index, { stop: id })}>
                        {t(stopKey(id))}
                      </button>
                    </th>
                    <td>{durationText(row.stopS)}</td>
                    <td />
                    <td>{formatFatigue(row.fatigueAfter)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className={styles.finish}>{t('major.plan.finish')}</p>
        )}
      </section>

      <p className={styles.entry}>
        {t('major.plan.total', { time: raceTimeText(Math.round(preview.finishS)), fatigue: formatFatigue(preview.fatigueAtFinish) })}
      </p>
      <p className={styles.hint}>{t('major.plan.estimates')}</p>
      {editable && <p className={styles.hint}>{stored ? t('major.plan.autosaved') : t('major.plan.saving')}</p>}
    </div>
  )
}
