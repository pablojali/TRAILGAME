import { useCallback, useEffect, useRef, useState } from 'react'
import button from '../../components/Button.module.css'
import { Chips, Tabs } from '../../components/Tabs'
import { useBackdropScene } from '../../components/backdrop/sceneOverride'
import { getRace } from '../../domain/races/races'
import type { AidStop, Intensity } from '../../domain/races/strategyConfig'
import { useI18n, type MessageKey } from '../../i18n/i18n'
import { useGame } from '../../app/game/gameContext'
import { getMajorService } from '../../repositories/supabase/majorClient'
import type { LiveRace as LiveRaceView, PlayerMajor } from '../../server/majorOps'
import { raceClip } from '../races/raceClips'
import { intensityKey, intensityOptions, STOP_IDS, stopKey } from '../races/raceStrategyText'
import { durationText, ordinal, raceTimeText } from '../races/raceText'
import { LiveTracker } from './LiveTracker'
import styles from './Majors.module.css'

type Tab = 'race' | 'standings'

/**
 * The live Sunday Major (owner specification §5, §11, §14; phase 4): the category's phase with
 * the server's countdown, the runner's place and gaps, the aid-station decision while its window is
 * open, and the standings of the 50 (players and NPCs, and who raced the last aid station on their
 * plan). The server alone moves the race on; this screen asks for its state every few seconds and
 * when a countdown ends, so a lost connection only means catching up when it is back.
 */
export function LiveRace({ major, mediaUrl }: { major: PlayerMajor; mediaUrl(path: string): string }) {
  const { race, error, skew, refresh } = useLiveRace(major.id)
  const { t, locale } = useI18n()
  const [tab, setTab] = useState<Tab>('race')
  const now = useTicker()
  // At an aid station: the solo races' aid-station picture behind the screen.
  useBackdropScene(race?.category.phase === 'PA' ? 'aid-station' : null)
  // At the finish: the result, coins, XP and points go into the career now.
  const finished = race?.category.phase === 'FINISHED'
  const { claimMajorResults } = useGame()
  useEffect(() => {
    if (finished) void claimMajorResults()
  }, [finished, claimMajorResults])
  if (!race) return <p className={styles.hint}>{error ? t(`major.error.${error}` as MessageKey) : t('major.loading')}</p>

  const { category, me } = race
  const ends = category.phaseEndsAt ? Date.parse(category.phaseEndsAt) - skew : null
  const left = ends ? Math.max(0, Math.round((ends - now) / 1000)) : 0
  const mine = race.standings.find((row) => row.me)
  const total = category.segments ?? 0
  const phaseText =
    category.phase === 'RUNNING'
      ? t('major.live.running', { n: category.segment + 1, total })
      : category.phase === 'PA'
        ? t('major.live.pa', { n: category.segment + 1 })
        : category.phase === 'FINISHED'
          ? t('major.live.finished')
          : t('major.live.waiting')
  const courseRace = getRace(major.raceId)
  const clipPath = category.phase === 'RUNNING' ? major.clips[String(category.segment + 1)] : undefined
  const ownClip = clipPath ? { mp4: mediaUrl(clipPath), poster: mediaUrl(clipPath.replace(/\.mp4$/, '.jpg')) } : null
  const clip = ownClip ?? (courseRace && category.phase === 'RUNNING' ? raceClip(courseRace.id, category.segment + 1) : null)

  return (
    <div className={styles.live}>
      <section className={styles.phase} aria-label={phaseText}>
        <div className={styles.phaseHead}>
          <strong>{phaseText}</strong>
          {ends && category.phase !== 'FINISHED' && <span className={styles.countdown}>{t('major.live.left', { time: durationText(left) })}</span>}
        </div>
        {ends && category.phase !== 'FINISHED' && (
          <span className={styles.phaseTrack} aria-hidden="true">
            <span style={{ width: `${phaseShare(race, ends, now)}%` }} />
          </span>
        )}
        {mine && me && (
          <div className={styles.liveStats}>
            <span>
              <b>{ordinal(mine.position, locale)}</b> / {race.standings.length}
              <PositionChange splits={me.splits} />
            </span>
            <span>{raceTimeText(mine.timeS)}</span>
            <span>
              {t('major.live.energy')} <b>{Math.round(me.energy)}</b>
            </span>
          </div>
        )}
      </section>

      <Tabs<Tab>
        label={major.name}
        tabs={[
          { id: 'race', label: t('major.live.tab.race') },
          { id: 'standings', label: t('major.live.tab.standings') },
        ]}
        value={tab}
        onChange={setTab}
      >
        {tab === 'race' ? (
          <div className={styles.panel}>
            {category.phase === 'RUNNING' && (
              <>
                {clip?.mp4 ? (
                  <video className={styles.liveClip} src={clip.mp4} poster={clip.poster} autoPlay muted loop playsInline />
                ) : null}
                {race.live.length > 0 && ends ? (
                  <LiveTracker race={race} raceId={major.raceId} ends={ends} now={now} />
                ) : (
                  <p className={styles.entry}>{t('major.live.runningHint')}</p>
                )}
              </>
            )}
            {mine && <Gaps race={race} />}
            {category.phase === 'PA' && <Decision major={major} race={race} open={left > 0} onSent={refresh} />}
            {category.phase === 'FINISHED' && mine && (
              <p className={styles.entry}>
                {t('major.live.result', { position: ordinal(mine.position, locale), field: race.standings.length, time: raceTimeText(mine.timeS) })}
                {race.prize && <span> {t('major.live.prize', race.prize)}</span>}
              </p>
            )}
          </div>
        ) : (
          <Standings race={race} />
        )}
      </Tabs>
    </div>
  )
}

/**
 * Places gained (+, green) or lost (−, red) on the last segment run, big, popping in when it
 * changes (owner request, 12 November 2026). Nothing before the first segment or when unchanged.
 */
function PositionChange({ splits }: { splits: readonly { position: number }[] }) {
  const { t } = useI18n()
  if (splits.length < 1) return null
  // Before the first aid station the runners start together: no change to show.
  const before = splits.length >= 2 ? splits[splits.length - 2]!.position : null
  if (before === null) return null
  const delta = before - splits[splits.length - 1]!.position
  if (delta === 0) return null
  return (
    <span
      key={splits.length}
      className={`${styles.positionChange} ${delta > 0 ? styles.positionUp : styles.positionDown}`}
      aria-label={`${t(delta > 0 ? 'major.live.gained' : 'major.live.lost')}: ${Math.abs(delta)}`}
    >
      {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
    </span>
  )
}

/** How far into the current phase we are, from the major's phase lengths. */
function phaseShare(race: LiveRaceView, ends: number, now: number): number {
  const length = race.category.phase === 'PA' ? race.windowS * 1000 : race.runningS * 1000
  return Math.min(100, Math.max(0, 100 - ((ends - now) / length) * 100))
}

/** The runners just ahead and just behind, with the gaps. */
function Gaps({ race }: { race: LiveRaceView }) {
  const { t } = useI18n()
  const i = race.standings.findIndex((row) => row.me)
  const mine = race.standings[i]!
  const ahead = race.standings[i - 1]
  const behind = race.standings[i + 1]
  return (
    <dl className={styles.gapCards}>
      <div>
        <dt>{ahead ? t('major.live.ahead', { name: ahead.name }) : t('major.live.leading')}</dt>
        <dd className={styles.gapAhead}>{ahead ? `+${durationText(mine.timeS - ahead.timeS)}` : '—'}</dd>
      </div>
      <div>
        <dt>{behind ? t('major.live.behind', { name: behind.name }) : t('major.live.last')}</dt>
        <dd>{behind ? durationText(behind.timeS - mine.timeS) : '—'}</dd>
      </div>
    </dl>
  )
}

/** The aid-station decision while the window is open: stop and next pace, changeable until it closes. */
function Decision({ major, race, open, onSent }: { major: PlayerMajor; race: LiveRaceView; open: boolean; onSent(): void }) {
  const { t } = useI18n()
  const sent = race.myDecision?.source === 'PLAYER' ? race.myDecision : null
  const planned = race.planned
  const [stop, setStop] = useState<AidStop>(sent?.stop ?? planned?.stop ?? 'normal')
  const [intensity, setIntensity] = useState<Intensity>(sent?.intensity ?? planned?.intensity ?? 'target')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const dirty = !sent || sent.stop !== stop || sent.intensity !== intensity

  async function send() {
    const service = getMajorService()
    if (!service || busy || !dirty) return
    setBusy(true)
    setMessage('')
    const answer = await service.race({ action: 'decide', id: major.id, segment: race.category.segment, stop, intensity })
    setBusy(false)
    if (!answer.ok) setMessage(t(`major.error.${answer.error}` as MessageKey))
    onSent()
  }

  return (
    <section className={styles.planCard} aria-label={t('major.live.pa', { n: race.category.segment + 1 })}>
      <span className={styles.label}>{t('raceRun.stopLabel')}</span>
      <Chips<AidStop> label={t('raceRun.stopLabel')} options={STOP_IDS.map((id) => ({ id, label: t(stopKey(id)) }))} value={stop} onChange={setStop} />
      <span className={styles.label}>{t('raceRun.segmentIntensity', { segment: race.category.segment + 2 })}</span>
      <Chips<Intensity> label={t('raceRun.segmentIntensity', { segment: race.category.segment + 2 })} options={intensityOptions(t)} value={intensity} onChange={setIntensity} />
      <p className={styles.hint}>
        {sent
          ? t('major.live.sent', { stop: t(stopKey(sent.stop)), pace: t(intensityKey(sent.intensity)) })
          : planned
            ? t('major.live.planned', { stop: t(stopKey(planned.stop)), pace: t(intensityKey(planned.intensity)) })
            : ''}
      </p>
      {message && (
        <p role="alert" className={styles.warning}>
          {message}
        </p>
      )}
      <button type="button" className={`${button.button} ${button.primary}`} aria-disabled={busy || !open || !dirty || undefined} onClick={() => open && void send()}>
        {sent ? t('major.live.change') : t('major.live.confirm')}
      </button>
    </section>
  )
}

/** The category's 50 runners in order, NPCs and automatic decisions marked, the player's row highlighted. */
function Standings({ race }: { race: LiveRaceView }) {
  const { t } = useI18n()
  return (
    <ol className={styles.standings} aria-label={t('major.live.tab.standings')}>
      {race.standings.map((row) => (
        <li key={row.slot} aria-current={row.me || undefined}>
          <span className={styles.pos}>{row.position}</span>
          <span className={styles.who}>
            {row.name}
            {row.me && <em> · {t('major.live.you')}</em>}
          </span>
          {row.auto && <span className={styles.tagAuto}>{t('major.live.auto')}</span>}
          <span className={styles.gap}>{row.gapS === 0 ? raceTimeText(row.timeS) : `+${durationText(row.gapS)}`}</span>
        </li>
      ))}
    </ol>
  )
}

/** Polls the live race: every 4 s, and right after a countdown ends. Tracks the server clock's offset. */
function useLiveRace(eventId: string) {
  const [race, setRace] = useState<LiveRaceView | null>(null)
  const [error, setError] = useState('')
  const [skew, setSkew] = useState(0)
  const alive = useRef(true)
  const refresh = useCallback(async () => {
    const service = getMajorService()
    if (!service) return setError('offline')
    const sentAt = Date.now()
    const answer = await service.race({ action: 'race-state', id: eventId })
    if (!alive.current) return
    if (!answer.ok) return setError(answer.error)
    setError('')
    setRace(answer.race)
    // Server time minus local time, halfway through the request.
    setSkew(Date.now() - (Date.now() - sentAt) / 2 - Date.parse(answer.now))
  }, [eventId])
  useEffect(() => {
    alive.current = true
    // Fetching from the server: the state is set when the answer arrives.
    void refresh()
    const timer = window.setInterval(() => void refresh(), 4000)
    return () => {
      alive.current = false
      window.clearInterval(timer)
    }
  }, [refresh])
  return { race, error, skew, refresh: () => void refresh() }
}

/** Re-renders every second, for the countdowns. */
function useTicker(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}
