import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { useNavigate } from 'react-router'
import { useGame } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { Meter } from '../../components/Card'
import {
  ATHLETE_NAME_MAX_LENGTH,
  ATTRIBUTE_IDS,
  ATTRIBUTE_LABELS,
  cleanAthleteName,
  SEX_LABELS,
  SEXES,
  type ProfileId,
  type Sex,
} from '../../domain/athlete/athlete'
import { PROFILE_ATTRIBUTE_TOTAL, PROFILE_IDS, PROFILES } from '../../domain/athlete/profiles'
import type { IncompatibleReason } from '../../repositories/gameRepository'
import { RunnerArt } from './RunnerArt'
import styles from './CareerCreation.module.css'

/** Preselected sex in the selector (spec: one option must be preselected). */
const DEFAULT_SEX: Sex = 'female'

/** Bars compare starting values, which all lie in 12–20; scale them to the highest one. */
const BAR_MAX = Math.max(...PROFILE_IDS.flatMap((id) => Object.values(PROFILES[id].attributes)))

interface CareerCreationScreenProps {
  /** Set when confirming will overwrite an existing (incompatible) save. */
  replacing: IncompatibleReason | null
}

type Step = 'profile' | 'name'

/** New-career flow: choose sex and profile, then name the runner. Writes only on the last step. */
export function CareerCreationScreen({ replacing }: CareerCreationScreenProps) {
  const [step, setStep] = useState<Step>('profile')
  const [sex, setSex] = useState<Sex>(DEFAULT_SEX)
  const [profileIndex, setProfileIndex] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const isFirstRender = useRef(true)

  // Move focus to the new step's heading when the step changes (not on first render).
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    heading.current?.focus()
  }, [step])

  const profile = PROFILE_IDS[profileIndex] ?? PROFILE_IDS[0]!

  return step === 'profile' ? (
    <ProfileStep
      headingRef={heading}
      sex={sex}
      onSexChange={setSex}
      index={profileIndex}
      onIndexChange={setProfileIndex}
      onChoose={() => setStep('name')}
    />
  ) : (
    <NameStep
      headingRef={heading}
      profile={profile}
      sex={sex}
      replacing={replacing}
      onBack={() => setStep('profile')}
    />
  )
}

interface ProfileStepProps {
  headingRef: RefObject<HTMLHeadingElement | null>
  sex: Sex
  onSexChange(sex: Sex): void
  index: number
  onIndexChange(index: number): void
  onChoose(): void
}

function ProfileStep({ headingRef, sex, onSexChange, index, onIndexChange, onChoose }: ProfileStepProps) {
  const carousel = useRef<HTMLDivElement>(null)
  const scrollTimer = useRef<number | undefined>(undefined)
  const sexLegendId = useId()
  const selected = PROFILES[PROFILE_IDS[index] ?? PROFILE_IDS[0]!]

  // Keep the carousel on the selected card when returning to this step.
  useEffect(() => {
    scrollToIndex(index, false)
    return () => window.clearTimeout(scrollTimer.current)
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function scrollToIndex(next: number, smooth = true) {
    const container = carousel.current
    const slide = container?.children[next] as HTMLElement | undefined
    if (!container || !slide) return
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    container.scrollTo?.({
      left: slide.offsetLeft - (container.clientWidth - slide.offsetWidth) / 2,
      behavior: smooth && !reduceMotion ? 'smooth' : 'auto',
    })
  }

  function select(next: number) {
    const clamped = Math.min(PROFILE_IDS.length - 1, Math.max(0, next))
    onIndexChange(clamped)
    scrollToIndex(clamped)
  }

  // The card closest to the centre becomes the selection once scrolling settles (swipe or snap).
  function onScroll() {
    window.clearTimeout(scrollTimer.current)
    scrollTimer.current = window.setTimeout(() => {
      const container = carousel.current
      if (!container || container.clientWidth === 0) return
      const centre = container.scrollLeft + container.clientWidth / 2
      let nearest = index
      let best = Number.POSITIVE_INFINITY
      Array.from(container.children).forEach((child, i) => {
        const el = child as HTMLElement
        const distance = Math.abs(el.offsetLeft + el.offsetWidth / 2 - centre)
        if (distance < best) {
          best = distance
          nearest = i
        }
      })
      if (nearest !== index) onIndexChange(nearest)
    }, 80)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      select(index + 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      select(index - 1)
    }
  }

  return (
    <section className={styles.step} aria-labelledby="creation-title">
      <title>Choose your athlete · Trail Manager</title>
      <header className={styles.header}>
        <p className={styles.eyebrow}>New career · Step 1 of 2</p>
        <h1 id="creation-title" ref={headingRef} tabIndex={-1} className={styles.title}>
          Choose your athlete
        </h1>
        <p className={styles.help}>Swipe to compare profiles, then choose one.</p>
      </header>

      <fieldset className={styles.sexToggle} aria-labelledby={sexLegendId}>
        <legend id={sexLegendId} className={styles.srOnly}>
          Runner sex
        </legend>
        {SEXES.map((option) => (
          <label key={option} className={`${styles.segment} ${sex === option ? styles.segmentOn : ''}`}>
            <input
              type="radio"
              name="sex"
              value={option}
              checked={sex === option}
              onChange={() => onSexChange(option)}
              className={styles.srOnlyInput}
            />
            {SEX_LABELS[option]}
          </label>
        ))}
      </fieldset>

      <div
        ref={carousel}
        className={styles.carousel}
        role="region"
        aria-roledescription="carousel"
        aria-label="Starting profiles. Use the left and right arrow keys to switch."
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
      >
        {PROFILE_IDS.map((id, i) => {
          const profile = PROFILES[id]
          const isSelected = i === index
          return (
            <article
              key={id}
              className={`${styles.slide} ${isSelected ? styles.slideSelected : ''}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${profile.label}, ${i + 1} of ${PROFILE_IDS.length}`}
              aria-current={isSelected ? 'true' : undefined}
              onClick={() => !isSelected && select(i)}
            >
              <RunnerArt profile={id} sex={sex} className={styles.slideArt} />
              <h2 className={styles.profileName}>{profile.label}</h2>
              <p className={styles.description}>{profile.description}</p>
              <ul className={styles.bars}>
                {ATTRIBUTE_IDS.map((attr) => {
                  const value = profile.attributes[attr]
                  const strong = profile.strengths.includes(attr)
                  const weak = profile.weaknesses.includes(attr)
                  return (
                    <li key={attr} className={strong ? styles.strong : weak ? styles.weak : undefined}>
                      <span className={styles.barText}>
                        <span>
                          {strong && <span aria-hidden="true">▲ </span>}
                          {weak && <span aria-hidden="true">▼ </span>}
                          {ATTRIBUTE_LABELS[attr]}
                          {strong && <span className={styles.srOnly}> (strength)</span>}
                          {weak && <span className={styles.srOnly}> (weakness)</span>}
                        </span>
                        <span className={styles.barValue}>{value}</span>
                      </span>
                      <Meter
                        label={ATTRIBUTE_LABELS[attr]}
                        value={value}
                        max={BAR_MAX}
                        valueText={`${value} points`}
                        className={styles.bar}
                      />
                    </li>
                  )
                })}
              </ul>
              <p className={styles.total}>{PROFILE_ATTRIBUTE_TOTAL} points</p>
            </article>
          )
        })}
      </div>

      <div className={styles.dots}>
        {PROFILE_IDS.map((id, i) => (
          <button
            key={id}
            type="button"
            className={styles.dot}
            aria-label={`Show ${PROFILES[id].label}`}
            aria-pressed={i === index}
            onClick={() => select(i)}
          >
            <span className={styles.dotMark} aria-hidden="true" />
          </button>
        ))}
      </div>

      <button type="button" className={`${button.button} ${button.primary} ${button.block}`} onClick={onChoose}>
        Choose {selected.label}
      </button>
    </section>
  )
}

interface NameStepProps {
  headingRef: RefObject<HTMLHeadingElement | null>
  profile: ProfileId
  sex: Sex
  replacing: IncompatibleReason | null
  onBack(): void
}

function NameStep({ headingRef, profile, sex, replacing, onBack }: NameStepProps) {
  const { startCareer } = useGame()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [showError, setShowError] = useState(false)
  const inputId = useId()
  const hintId = useId()
  const errorId = useId()

  return (
    <section className={styles.step} aria-labelledby="creation-title">
      <title>Name your runner · Trail Manager</title>
      <header className={styles.header}>
        <p className={styles.eyebrow}>New career · Step 2 of 2</p>
        <h1 id="creation-title" ref={headingRef} tabIndex={-1} className={styles.title}>
          Name your runner
        </h1>
        <p className={styles.help}>Your runner's name appears on the Dashboard.</p>
      </header>

      <div className={styles.preview}>
        <RunnerArt profile={profile} sex={sex} className={styles.previewArt} />
        <p className={styles.previewLabel}>
          {PROFILES[profile].label} · {SEX_LABELS[sex]}
        </p>
      </div>

      <form
        className={styles.nameForm}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          const clean = cleanAthleteName(name)
          if (!clean) {
            setShowError(true)
            return
          }
          startCareer(profile, { name: clean, sex })
          // A new career always opens on the Dashboard, whichever route showed this flow.
          navigate('/')
        }}
      >
        <label htmlFor={inputId} className={styles.fieldLabel}>
          Runner name
        </label>
        <input
          id={inputId}
          className={styles.input}
          value={name}
          maxLength={ATHLETE_NAME_MAX_LENGTH}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="done"
          aria-invalid={showError || undefined}
          aria-describedby={showError ? `${hintId} ${errorId}` : hintId}
          onChange={(event) => {
            setName(event.target.value)
            setShowError(false)
          }}
        />
        <p id={hintId} className={styles.hint}>
          1–{ATHLETE_NAME_MAX_LENGTH} characters.
        </p>
        {showError && (
          <p id={errorId} role="alert" className={styles.error}>
            Enter a name for your runner.
          </p>
        )}
        {replacing && (
          <p className={styles.caution}>Starting a new career will replace your previous saved career.</p>
        )}
        <div className={styles.actions}>
          <button type="button" className={`${button.button} ${button.secondary}`} onClick={onBack}>
            Back
          </button>
          <button type="submit" className={`${button.button} ${button.primary} ${styles.grow}`}>
            Start career
          </button>
        </div>
      </form>
    </section>
  )
}
