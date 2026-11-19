import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useGame } from '../../app/game/gameContext'
import { backgroundImage } from '../../components/backdrop/backdrops'
import { campItemName, campItems, type CampItem } from '../../domain/basecamp/catalog'
import { campScene, ownsCampItem } from '../../game-engine/camp'
import type { GameState } from '../../game-engine/gameState'
import { campArt } from '../basecamp/campArt'
import button from '../../components/Button.module.css'
import { useI18n } from '../../i18n/i18n'
import { coachPortrait, WELCOME_STEPS } from './coach'
import styles from './WelcomeScreen.module.css'

/** How long the empty refuge shows alone before the coach comes in (none in tests). */
const INTRO_MS = import.meta.env.MODE === 'test' ? 0 : 3000

/** The refuges a new player can choose: the exterior backgrounds they own (free, or the admin's). */
function refuges(state: GameState): CampItem[] {
  return campItems('exterior', 'background').filter((item) => ownsCampItem(state, item) && campArt(item))
}

/**
 * Trail Coach M1, the first welcome (owner request, 8 November 2026): screens with the coach before
 * a new career starts. Since 19 November 2026 the coach first shows the Base Camp, empty and
 * desolate, and says what it is; then the player chooses their refuge and the welcome goes inside
 * it. The step is saved, so a reload resumes where the player left; finishing or skipping marks it
 * done for good.
 */
export function WelcomeScreen() {
  const { phase, setCoachProgress, setCampItemUsed } = useGame()
  const { t, locale } = useI18n()
  const [chosen, setChosen] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const heading = useRef<HTMLHeadingElement>(null)
  const state = phase.kind === 'playing' ? phase.state : null
  const step = Math.min(state?.coach?.welcomeStep ?? 0, WELCOME_STEPS.length - 1)
  const id = WELCOME_STEPS[step]!
  const shownStep = useRef(step)
  // The empty refuge alone first, then the coach comes in (owner request, 19 November 2026); a tap shows the coach at once.
  const [revealed, setRevealed] = useState(id !== 'place' || INTRO_MS === 0)
  useEffect(() => {
    if (revealed) return
    const timer = window.setTimeout(() => setRevealed(true), INTRO_MS)
    return () => window.clearTimeout(timer)
  }, [revealed])

  // Each new screen is announced from its title (not the one the welcome opens on).
  useEffect(() => {
    if (shownStep.current !== step) heading.current?.focus()
    shownStep.current = step
  }, [step])

  if (!state) return null
  const portrait = coachPortrait(state.athlete.sex, state.athlete.appearance.skin)
  const options = refuges(state)
  const current = campScene(state, 'exterior').background
  const selected = options.find((item) => item.id === chosen) ?? current
  // The welcome happens in the refuge: its picture is the scene behind the coach. Before choosing,
  // the owner's picture of the bare refuge (assets/ui/backgrounds/empty-camp.*), or the default
  // refuge made desolate (grey and dim).
  const emptyCamp = id === 'place' ? backgroundImage('empty-camp') : undefined
  const background = emptyCamp ?? campArt(selected) ?? backgroundImage('dashboard')

  // Finishing ends in the refuge; skipping the whole welcome opens the Dashboard.
  const finish = (to: string) => {
    setCoachProgress({ welcomeStep: step, welcomeDone: true })
    void navigate(to)
  }
  const next = async () => {
    if (id === 'camp' && selected.id !== current.id) {
      setSaving(true)
      setError('')
      const failure = await setCampItemUsed(selected.id, true)
      setSaving(false)
      if (failure) return setError(t('coach.camp.error'))
    }
    if (step < WELCOME_STEPS.length - 1) setCoachProgress({ welcomeStep: step + 1, welcomeDone: false })
    // Into the chosen refuge, where the coach goes on.
    else finish('/base-camp?view=interior')
  }

  return (
    <div className={`${styles.welcome} ${revealed ? '' : styles.intro}`} onClick={() => !revealed && setRevealed(true)}>
      {/* The refuge behind the coach: desolate (grey, dim) until the player chooses it. */}
      <div
        className={`${styles.scene} ${id === 'place' && !emptyCamp ? styles.desolate : ''}`}
        aria-hidden="true"
        style={background ? { backgroundImage: `url(${background})`, ...(selected.spot ? { backgroundPosition: `${Math.round(selected.spot.x * 100)}% 40%` } : {}) } : undefined}
      />
      <div className={styles.top}>
        <ol className={styles.dots} aria-label={t('coach.progress', { step: String(step + 1), count: String(WELCOME_STEPS.length) })}>
          {WELCOME_STEPS.map((name, index) => (
            <li key={name} className={index <= step ? styles.dotOn : styles.dot} />
          ))}
        </ol>
        {step < WELCOME_STEPS.length - 1 && (
          <button type="button" className={styles.skip} onClick={() => finish('/')}>
            {t('coach.skip')}
          </button>
        )}
      </div>

      <div className={styles.stage} hidden={!revealed}>
        {portrait && <img className={styles.coach} src={portrait} alt={t('coach.label')} />}
      </div>

      <section key={id} className={styles.panel} aria-labelledby="coach-welcome-title" hidden={!revealed}>
        <p className={styles.speaker}>{t('coach.label')}</p>
        <h1 id="coach-welcome-title" ref={heading} tabIndex={-1} className={styles.title}>
          {t(`coach.${id}.title`)}
        </h1>
        <p className={styles.text}>{t(`coach.${id}.text`)}</p>
        {id === 'camp' && options.length > 1 && (
          <ul className={styles.refuges} aria-label={t('coach.camp.title')}>
            {options.map((item) => (
              <li key={item.id}>
                <button type="button" aria-pressed={item.id === selected.id} onClick={() => setChosen(item.id)}>
                  <img src={campArt(item)} alt="" />
                  <span>{campItemName(item, locale)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <button
          type="button"
          className={`${button.button} ${button.primary} ${button.block} ${styles.action}`}
          aria-disabled={saving || undefined}
          onClick={() => !saving && void next()}
        >
          {t(`coach.${id}.action`)}
        </button>
      </section>
    </div>
  )
}
