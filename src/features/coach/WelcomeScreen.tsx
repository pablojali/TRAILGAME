import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useGame } from '../../app/game/gameContext'
import { backgroundImage } from '../../components/backdrop/backdrops'
import button from '../../components/Button.module.css'
import { useI18n, type MessageKey } from '../../i18n/i18n'
import { coachPortrait, WELCOME_STEPS } from './coach'
import styles from './WelcomeScreen.module.css'

const JOURNEY: readonly MessageKey[] = [
  'coach.journey.train',
  'coach.journey.develop',
  'coach.journey.equipment',
  'coach.journey.compete',
  'coach.journey.progress',
]

/**
 * Trail Coach M1, the first welcome (owner request, 8 November 2026): three screens with the coach
 * before a new career's first Dashboard. The step is saved, so a reload resumes where the player
 * left; finishing or skipping marks it done for good and opens the Dashboard.
 */
export function WelcomeScreen() {
  const { phase, setCoachProgress } = useGame()
  const { t } = useI18n()
  const navigate = useNavigate()
  const heading = useRef<HTMLHeadingElement>(null)
  const state = phase.kind === 'playing' ? phase.state : null
  const step = Math.min(state?.coach?.welcomeStep ?? 0, WELCOME_STEPS.length - 1)
  const id = WELCOME_STEPS[step]!
  const shownStep = useRef(step)

  // Each new screen is announced from its title (not the one the welcome opens on).
  useEffect(() => {
    if (shownStep.current !== step) heading.current?.focus()
    shownStep.current = step
  }, [step])

  if (!state) return null
  const portrait = coachPortrait(state.athlete.sex, state.athlete.appearance.skin)
  const background = backgroundImage('dashboard')

  const finish = () => {
    setCoachProgress({ welcomeStep: step, welcomeDone: true })
    void navigate('/')
  }
  const next = () => {
    if (step < WELCOME_STEPS.length - 1) setCoachProgress({ welcomeStep: step + 1, welcomeDone: false })
    else finish()
  }

  return (
    <div className={styles.welcome} style={background ? { backgroundImage: `url(${background})` } : undefined}>
      <div className={styles.top}>
        <ol className={styles.dots} aria-label={t('coach.progress', { step: String(step + 1), count: String(WELCOME_STEPS.length) })}>
          {WELCOME_STEPS.map((name, index) => (
            <li key={name} className={index <= step ? styles.dotOn : styles.dot} />
          ))}
        </ol>
        {step < WELCOME_STEPS.length - 1 && (
          <button type="button" className={styles.skip} onClick={finish}>
            {t('coach.skip')}
          </button>
        )}
      </div>

      <div className={styles.stage}>
        {portrait && <img className={styles.coach} src={portrait} alt={t('coach.label')} />}
      </div>

      <section key={id} className={styles.panel} aria-labelledby="coach-welcome-title">
        <p className={styles.speaker}>{t('coach.label')}</p>
        <h1 id="coach-welcome-title" ref={heading} tabIndex={-1} className={styles.title}>
          {t(`coach.${id}.title`)}
        </h1>
        {id === 'journey' && (
          <ul className={styles.journey}>
            {JOURNEY.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        )}
        <p className={styles.text}>{t(`coach.${id}.text`)}</p>
        <button type="button" className={`${button.button} ${button.primary} ${button.block} ${styles.action}`} onClick={next}>
          {t(`coach.${id}.action`)}
        </button>
      </section>
    </div>
  )
}
