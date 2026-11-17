import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { campScene, campSpots } from '../../game-engine/camp'
import { useI18n } from '../../i18n/i18n'
import { getCampService, type CampService, type PublicCamp } from '../../repositories/supabase/campClient'
import styles from './BaseCamp.module.css'
import { ExteriorAmbience, Panorama } from './BaseCampScreen'
import { FriendButton } from './Friends'
import { defaultRefuge } from './visits'

/**
 * Another runner's refuge (owner design, 17 November 2026): their Base Camp outside, as they have
 * it, opened from the rankings, the Majors and the mailbox. Opening it records the visit for its
 * owner; the visitor can congratulate them once a day. Nothing in it can be used: no buttons.
 */
export function CampVisitScreen({ service = getCampService() }: { service?: CampService | null }) {
  const { t } = useI18n()
  const { name = '' } = useParams()
  const navigate = useNavigate()
  const [refuge, setRefuge] = useState<PublicCamp | 'offline' | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [congratulated, setCongratulated] = useState(false)
  const [sending, setSending] = useState(false)

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
  const scene = campScene(holder, 'exterior')
  const door = campSpots(holder, 'exterior').find((spot) => spot.action === 'enter')

  return (
    <section className={styles.camp} aria-labelledby="camp-visit-title">
      <header className={styles.bar}>
        <button type="button" className={styles.customize} onClick={back}>
          {t('basecamp.visit.back')}
        </button>
        <h1 id="camp-visit-title" className={styles.title}>
          {t('basecamp.visit.title', { name: shown.name })}
        </h1>
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
      </header>
      <Panorama key={scene.picture.id} scene="exterior" background={scene.picture} layers={[scene.cabin]} objects={scene.placed} focus={door?.x ?? 0.5}>
        <ExteriorAmbience picture={scene.picture} />
      </Panorama>
      <p className={styles.hint} aria-hidden="true">
        {t('basecamp.swipe')}
      </p>
    </section>
  )
}
