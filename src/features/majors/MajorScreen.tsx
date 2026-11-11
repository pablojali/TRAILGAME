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
import type { AidStop, Intensity } from '../../domain/races/strategyConfig'
import { getRaceSegments } from '../../game-engine/raceEngine'
import { RACE_STYLES, type RaceStyle } from '../../game-engine/racePlan'
import { planRaceBeforeStart } from '../../game-engine/races'
import { useI18n, type MessageKey } from '../../i18n/i18n'
import type { PlayerMajor } from '../../server/majorOps'
import { intensityOptions, STOP_IDS, stopKey } from '../races/raceStrategyText'
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
              <PlanPanel major={major} busy={busy} onSave={(plan) => run({ action: 'save-plan', id: major.id, plan }, t('major.plan.saved'))} />
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
 * The aid-station plan (owner specification §4.1): a style that fills every segment, then each
 * segment's intensity and the stop after it by hand, and the gel and bar to take. Saved on the
 * server; applied wherever the runner does not decide in time.
 */
function PlanPanel({ major, busy, onSave }: { major: PlayerMajor; busy: boolean; onSave(plan: MajorPlan): void }) {
  const { state } = useCareer()
  const { t } = useI18n()
  const race = getRace(major.raceId)
  const segments = race ? getRaceSegments(race).length : 0
  const saved = major.registration?.plan ?? null
  const [plan, setPlan] = useState<MajorPlan>(() => saved ?? defaultPlan(segments))
  const mine = major.registration
  const editable = mine && (mine.status === 'REGISTERED' || mine.status === 'READY') && (major.status === 'REGISTRATION_OPEN')
  if (!race) return null
  if (!mine || mine.status === 'WITHDRAWN') return <p className={styles.hint}>{t('major.plan.registerFirst')}</p>

  const setStyle = (style: RaceStyle) => {
    const intensities = planRaceBeforeStart(state, race, { gel: plan.gel, bar: plan.bar }, style)
    setPlan({ ...plan, style, segments: plan.segments.map((s, i) => ({ ...s, intensity: intensities[i] ?? s.intensity })) })
  }
  const setSegment = (i: number, change: Partial<MajorPlan['segments'][number]>) =>
    setPlan({ ...plan, segments: plan.segments.map((s, j) => (j === i ? { ...s, ...change } : s)) })
  const dirty = JSON.stringify(plan) !== JSON.stringify(saved ?? defaultPlan(segments))

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
      <ol className={styles.planRows}>
        {plan.segments.map((segment, i) => (
          <li key={i}>
            <strong>{t('major.plan.segment', { n: i + 1 })}</strong>
            <select
              aria-label={t('major.plan.intensity', { n: i + 1 })}
              value={segment.intensity}
              disabled={!editable}
              onChange={(e) => setSegment(i, { intensity: e.target.value as Intensity })}
            >
              {intensityOptions(t).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            {segment.stop === null ? (
              <span className={styles.finish}>{t('major.plan.finish')}</span>
            ) : (
              <select
                aria-label={t('major.plan.stop', { n: i + 1 })}
                value={segment.stop}
                disabled={!editable}
                onChange={(e) => setSegment(i, { stop: e.target.value as AidStop })}
              >
                {STOP_IDS.map((id) => (
                  <option key={id} value={id}>
                    {t(stopKey(id))}
                  </option>
                ))}
              </select>
            )}
          </li>
        ))}
      </ol>
      <div className={styles.nutrition}>
        {(['gel', 'bar'] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={styles.toggle}
            aria-pressed={plan[item]}
            disabled={!editable}
            onClick={() => setPlan({ ...plan, [item]: !plan[item] })}
          >
            {t(item === 'gel' ? 'raceRun.gel' : 'raceRun.bar')} · {state.consumables[item]}
          </button>
        ))}
      </div>
      {editable && (
        <button type="button" className={`${button.button} ${button.secondary}`} aria-disabled={busy || !dirty || undefined} onClick={() => !busy && dirty && onSave(plan)}>
          {t('major.plan.save')}
        </button>
      )}
    </div>
  )
}
