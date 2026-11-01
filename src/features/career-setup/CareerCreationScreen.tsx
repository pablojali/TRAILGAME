import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { useNavigate } from 'react-router'
import { useGame, type StartCareerError } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { Avatar } from '../../components/avatar/Avatar'
import { appearanceForSex, defaultAppearance, type Appearance } from '../../domain/athlete/appearance'
import {
  ATHLETE_NAME_MAX_LENGTH,
  cleanAthleteName,
  SEX_LABELS,
  SEXES,
  type Sex,
} from '../../domain/athlete/athlete'
import { PROFILES, STARTING_PROFILE } from '../../domain/athlete/profiles'
import type { IncompatibleReason } from '../../repositories/gameRepository'
import { AppearanceEditor } from '../appearance/AppearanceEditor'
import styles from './CareerCreation.module.css'
import { SignInLink } from './SignInLink'

/** Preselected sex in the selector (spec: one option must be preselected). */
const DEFAULT_SEX: Sex = 'female'

interface CareerCreationScreenProps {
  /** Set when confirming will overwrite an existing (incompatible) save. */
  replacing: IncompatibleReason | null
}

type Step = 'appearance' | 'name'

const STEP_COUNT = 2

/**
 * New-career flow: choose sex and appearance, then name the runner. Every new runner starts as an
 * All-rounder with every attribute at 16 (owner decision, 1 November 2026: no starting profiles to
 * choose from). Writes only on the last step.
 */
export function CareerCreationScreen({ replacing }: CareerCreationScreenProps) {
  const [step, setStep] = useState<Step>('appearance')
  const [sex, setSex] = useState<Sex>(DEFAULT_SEX)
  const [appearance, setAppearance] = useState<Appearance>(() => defaultAppearance())
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

  function changeSex(next: Sex) {
    setSex(next)
    setAppearance((current) => appearanceForSex(current, next))
  }

  if (step === 'appearance') {
    return (
      <AppearanceStep
        headingRef={heading}
        sex={sex}
        onSexChange={changeSex}
        appearance={appearance}
        onAppearanceChange={setAppearance}
        onContinue={() => setStep('name')}
      />
    )
  }
  return (
    <NameStep
      headingRef={heading}
      sex={sex}
      appearance={appearance}
      replacing={replacing}
      onBack={() => setStep('appearance')}
    />
  )
}

interface SexToggleProps {
  sex: Sex
  onChange(sex: Sex): void
}

/** Female / Male segmented control, on the appearance step. */
function SexToggle({ sex, onChange }: SexToggleProps) {
  const legendId = useId()
  return (
    <fieldset className={styles.sexToggle} aria-labelledby={legendId}>
      <legend id={legendId} className={styles.srOnly}>
        Runner sex
      </legend>
      {SEXES.map((option) => (
        <label key={option} className={`${styles.segment} ${sex === option ? styles.segmentOn : ''}`}>
          <input
            type="radio"
            name="sex"
            value={option}
            checked={sex === option}
            onChange={() => onChange(option)}
            className={styles.srOnlyInput}
          />
          {SEX_LABELS[option]}
        </label>
      ))}
    </fieldset>
  )
}

interface AppearanceStepProps {
  headingRef: RefObject<HTMLHeadingElement | null>
  sex: Sex
  onSexChange(sex: Sex): void
  appearance: Appearance
  onAppearanceChange(appearance: Appearance): void
  onContinue(): void
}

function AppearanceStep({ headingRef, sex, onSexChange, appearance, onAppearanceChange, onContinue }: AppearanceStepProps) {
  return (
    <section className={styles.step} aria-labelledby="creation-title">
      <title>Create your runner · Trail Manager</title>
      <header className={styles.header}>
        <p className={styles.eyebrow}>New career · Step 1 of {STEP_COUNT}</p>
        <h1 id="creation-title" ref={headingRef} tabIndex={-1} className={styles.title}>
          Create your runner
        </h1>
        <p className={styles.help}>
          Every runner starts as an All-rounder, with every attribute at {PROFILES[STARTING_PROFILE].attributes.endurance}.
          Appearance is cosmetic.
        </p>
        <SignInLink />
      </header>

      <SexToggle sex={sex} onChange={onSexChange} />

      <AppearanceEditor sex={sex} appearance={appearance} onChange={onAppearanceChange} level={1} />

      <div className={styles.actions}>
        <button type="button" className={`${button.button} ${button.primary} ${styles.grow}`} onClick={onContinue}>
          Continue
        </button>
      </div>
    </section>
  )
}

interface NameStepProps {
  headingRef: RefObject<HTMLHeadingElement | null>
  sex: Sex
  appearance: Appearance
  replacing: IncompatibleReason | null
  onBack(): void
}

const START_ERRORS: Record<StartCareerError, string> = {
  offline: 'Could not reach the server to create your career. Check your connection and try again.',
  'server-error': 'The server could not create your career. Try again.',
  'cloud-career-exists': 'Your account already has a career. It is being loaded on this device.',
}

function NameStep({ headingRef, sex, appearance, replacing, onBack }: NameStepProps) {
  const { startCareer } = useGame()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [showError, setShowError] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const inputId = useId()
  const hintId = useId()
  const errorId = useId()

  return (
    <section className={styles.step} aria-labelledby="creation-title">
      <title>Name your runner · Trail Manager</title>
      <header className={styles.header}>
        <p className={styles.eyebrow}>New career · Step 2 of {STEP_COUNT}</p>
        <h1 id="creation-title" ref={headingRef} tabIndex={-1} className={styles.title}>
          Name your runner
        </h1>
        <p className={styles.help}>Your runner's name appears on the Dashboard.</p>
      </header>

      <div className={styles.preview}>
        <div className={styles.previewStage}>
          <Avatar
            sex={sex}
            appearance={appearance}
            label={`Your runner: ${PROFILES[STARTING_PROFILE].label}, ${SEX_LABELS[sex].toLowerCase()}`}
          />
        </div>
        <p className={styles.previewLabel}>
          {PROFILES[STARTING_PROFILE].label} · {SEX_LABELS[sex]}
        </p>
      </div>

      <form
        className={styles.nameForm}
        noValidate
        onSubmit={async (event) => {
          event.preventDefault()
          if (starting) return
          const clean = cleanAthleteName(name)
          if (!clean) {
            setShowError(true)
            return
          }
          setStarting(true)
          setStartError('')
          // With cloud saves the server creates the career; nothing starts until it confirms.
          const failure = await startCareer({ name: clean, sex, appearance })
          setStarting(false)
          if (failure) {
            setStartError(START_ERRORS[failure])
            return
          }
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
        {startError && (
          <p role="alert" className={styles.error}>
            {startError}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={`${button.button} ${button.secondary}`} onClick={onBack}>
            Back
          </button>
          <button
            type="submit"
            className={`${button.button} ${button.primary} ${styles.grow}`}
            aria-disabled={starting || undefined}
          >
            {starting ? 'Starting…' : 'Start career'}
          </button>
        </div>
      </form>
    </section>
  )
}
