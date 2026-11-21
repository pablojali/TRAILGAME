import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Avatar } from '../../components/avatar/Avatar'
import { campScene, campSpots } from '../../game-engine/camp'
import { useI18n } from '../../i18n/i18n'
import { getCampService, MESSAGE_MAX, type CampService, type MessageError, type PublicCamp } from '../../repositories/supabase/campClient'
import styles from './BaseCamp.module.css'
import { ExteriorAmbience, InteriorAmbience, Panorama } from './BaseCampScreen'
import { FriendButton } from './Friends'
import { defaultRefuge } from './visits'

/**
 * Another runner's refuge (owner design, 17 November 2026): their Base Camp outside, as they have
 * it, opened from the rankings, the Majors and the mailbox. Opening it records the visit for its
 * owner; the visitor can congratulate them once a day. A friend can go in and leave a message.
 * Nothing else in it can be used.
 */
export function CampVisitScreen({ service = getCampService() }: { service?: CampService | null }) {
  const { t } = useI18n()
  const { name = '' } = useParams()
  const navigate = useNavigate()
  const [refuge, setRefuge] = useState<PublicCamp | 'offline' | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [congratulated, setCongratulated] = useState(false)
  const [sending, setSending] = useState(false)
  const [inside, setInside] = useState(false)
  const [writing, setWriting] = useState(false)

  useEffect(() => {
    if (!service) return
    let live = true
    setRefuge(null)
    void service.refuge(name).then(async (found) => {
      if (!live) return
      // One's own refuge is Base Camp itself.
      if (found !== 'offline' && found.me) return navigate('/base-camp', { replace: true })
      setRefuge(found)
      if (found === 'offline') return
      const visited = await service.visit(found.name, false)
      if (live && visited !== 'offline') setCongratulated(visited.congratulated)
    })
    return () => {
      live = false
    }
  }, [service, name, attempt, navigate])

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/base-camp'))
  const shown = !service ? 'offline' : refuge

  async function congratulate(runner: string) {
    if (!service || sending || congratulated) return
    setSending(true)
    const answer = await service.visit(runner, true)
    setSending(false)
    if (answer !== 'offline') setCongratulated(answer.congratulated)
  }

  if (shown === null || shown === 'offline') {
    return (
      <section className={styles.camp} aria-labelledby="camp-visit-title">
        <header className={styles.bar}>
          <button type="button" className={styles.customize} onClick={back}>
            {t('basecamp.visit.back')}
          </button>
          <h1 id="camp-visit-title" className={styles.title}>
            {t('basecamp.visit.title', { name })}
          </h1>
        </header>
        <div className={styles.visitState}>
          {shown === null ? (
            <p role="status">{t('basecamp.visit.loading')}</p>
          ) : (
            <>
              <p role="alert">{t('basecamp.visit.offline')}</p>
              {service && (
                <button type="button" className={styles.customize} onClick={() => setAttempt((n) => n + 1)}>
                  {t('basecamp.visit.retry')}
                </button>
              )}
            </>
          )}
        </div>
      </section>
    )
  }

  const holder = { camp: shown.camp ?? defaultRefuge(shown.name) }
  // Friends can go in (owner design, 17 November 2026); everyone else sees the outside.
  const view = inside && shown.friend ? 'interior' : 'exterior'
  const scene = campScene(holder, view)
  const spots = campSpots(holder, view)
  const door = spots.find((spot) => spot.action === 'enter')
  const gear = spots.find((spot) => spot.action === 'gear')
  const focus = view === 'exterior' ? (door?.x ?? 0.5) : (gear?.x ?? 0)
  // The owner stands a little into the room from where the view opens.
  const runnerX = Math.min(0.85, Math.max(0.15, (gear?.x ?? 0) + 0.2))

  return (
    <section className={styles.camp} aria-labelledby="camp-visit-title">
      <header className={styles.bar}>
        {view === 'interior' ? (
          <button type="button" className={styles.customize} onClick={() => setInside(false)}>
            {t('basecamp.goOut')}
          </button>
        ) : (
          <button type="button" className={styles.customize} onClick={back}>
            {t('basecamp.visit.back')}
          </button>
        )}
        <h1 id="camp-visit-title" className={styles.title}>
          {t('basecamp.visit.title', { name: shown.name })}
        </h1>
        {view === 'interior' && (
          <button type="button" className={styles.customize} onClick={() => setWriting(true)}>
            {t('basecamp.visit.leaveMessage')}
          </button>
        )}
        <button
          type="button"
          className={styles.customize}
          aria-pressed={congratulated}
          aria-disabled={congratulated || sending || undefined}
          onClick={() => void congratulate(shown.name)}
        >
          {t(congratulated ? 'basecamp.visit.congratulated' : 'basecamp.visit.congratulate')}
        </button>
        <FriendButton name={shown.name} service={service} />
        {shown.online && (
          <span className={styles.srOnly} role="status">
            {t('basecamp.visit.home', { name: shown.name })}
          </span>
        )}
      </header>
      <Panorama key={`${view}:${scene.picture.id}`} scene={view} background={scene.background} layers={[scene.picture === scene.background ? null : scene.picture, scene.cabin, ...scene.decor]} focus={focus}>
        {view === 'exterior' ? <ExteriorAmbience picture={scene.picture} /> : <InteriorAmbience picture={scene.picture} />}
        {/* The owner's game is open: a lamp lit over the door (owner design, 18 November 2026). */}
        {view === 'exterior' && shown.online && door && (
          <span className={styles.homeLamp} style={{ left: `${door.x * 100}%`, top: `${Math.max(0.04, door.y - 0.14) * 100}%` }} aria-hidden="true" />
        )}
        {/* Inside, a friend finds the owner at home: their avatar in their clothes, no equipment. */}
        {view === 'interior' && shown.avatar && (
          <div className={styles.homeRunner} style={{ left: `${runnerX * 100}%` }}>
            <Avatar sex={shown.avatar.sex} appearance={shown.avatar.appearance} equipment={[]} alive label={t('basecamp.visit.atHome', { name: shown.name })} />
          </div>
        )}
        {/* A friend finds the door open. */}
        {view === 'exterior' && shown.friend && door && (
          <button type="button" className={styles.spot} style={{ left: `${door.x * 100}%`, top: `${door.y * 100}%` }} onClick={() => setInside(true)}>
            <span className={styles.ring} aria-hidden="true" />
            <span className={styles.spotLabel}>{t('basecamp.enter')}</span>
          </button>
        )}
      </Panorama>
      <p className={styles.hint} aria-hidden="true">
        {t('basecamp.swipe')}
      </p>
      {writing && service && <MessageDialog name={shown.name} service={service} onClose={() => setWriting(false)} />}
    </section>
  )
}

/** A message for a friend's mailbox (owner idea, 17 November 2026): up to 140 characters. */
function MessageDialog({ name, service, onClose }: { name: string; service: CampService; onClose(): void }) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [state, setState] = useState<'sent' | MessageError | null>(null)
  const clean = text.trim()

  async function send() {
    if (busy || !clean) return
    setBusy(true)
    const answer = await service.leaveMessage(name, clean)
    setBusy(false)
    setState(answer === true ? 'sent' : answer)
    if (answer === true) setText('')
  }

  return (
    <div className={styles.shopBack} role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className={styles.shop} role="dialog" aria-modal="true" aria-labelledby="camp-message-title">
        <header className={styles.shopHead}>
          <h2 id="camp-message-title">{t('basecamp.visit.messageTitle', { name })}</h2>
          <button type="button" className={styles.close} onClick={onClose}>
            {t('basecamp.shop.close')}
          </button>
        </header>
        <div className={`${styles.shopBody} ${styles.messageBox}`}>
          {state && (
            <p role={state === 'sent' ? 'status' : 'alert'} className={state === 'sent' ? styles.shopNote : styles.shopError}>
              {t(`basecamp.visit.message.${state}`)}
            </p>
          )}
          <label className={styles.srOnly} htmlFor="camp-message-text">
            {t('basecamp.visit.messageLabel')}
          </label>
          <textarea
            id="camp-message-text"
            maxLength={MESSAGE_MAX}
            value={text}
            placeholder={t('basecamp.visit.messagePlaceholder')}
            onChange={(e) => {
              setText(e.target.value)
              if (state === 'sent') setState(null)
            }}
          />
          <span className={styles.messageCount} aria-live="polite">
            {text.length}/{MESSAGE_MAX}
          </span>
          <button type="button" className={styles.action} aria-disabled={busy || !clean || undefined} onClick={() => void send()}>
            {t('basecamp.visit.send')}
          </button>
        </div>
      </section>
    </div>
  )
}
