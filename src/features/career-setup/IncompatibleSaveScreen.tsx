import { useEffect, useId, useRef, useState } from 'react'
import { useGame } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { Screen } from '../../components/Screen'
import type { IncompatibleReason } from '../../repositories/gameRepository'
import styles from './CareerSetup.module.css'

const REASONS: Record<IncompatibleReason, string> = {
  'legacy-v1':
    'Your saved career was created with an earlier version of Trail Game. It cannot continue under the new athlete progression model, which uses starting profiles and a new set of attributes.',
  'unsupported-version':
    'Your saved career was created by a different version of Trail Game and cannot be opened by this version.',
  malformed: 'Your saved career data is damaged or incomplete and cannot be loaded.',
}

type Step = 'warning' | 'confirm' | 'exited'

/**
 * Blocking screen for a save that cannot be loaded. Nothing is written here: the old save is
 * replaced only when the player later confirms a new profile.
 */
export function IncompatibleSaveScreen({ reason }: { reason: IncompatibleReason }) {
  const { beginRestart } = useGame()
  const [step, setStep] = useState<Step>('warning')
  const [acknowledged, setAcknowledged] = useState(false)
  const [showError, setShowError] = useState(false)
  const stepHeading = useRef<HTMLHeadingElement>(null)
  const isFirstRender = useRef(true)
  const checkboxId = useId()

  // Move focus to the new step's heading when the step changes (not on first render).
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    stepHeading.current?.focus()
  }, [step])

  function go(next: Step) {
    setAcknowledged(false)
    setShowError(false)
    setStep(next)
  }

  return (
    <Screen
      eyebrow="Saved career"
      title="Your saved career can't continue"
      description="Choose how to continue. Your saved data has not been changed."
    >
      <div className={styles.panel}>
        {step === 'warning' && (
          <>
            <h2 ref={stepHeading} tabIndex={-1} className={styles.panelTitle}>
              What happened
            </h2>
            <p role="alert">{REASONS[reason]}</p>
            <p className={styles.muted}>
              You can start a new career, which will replace the old save, or exit and keep the old
              save untouched.
            </p>
            <div className={styles.actions}>
              <button type="button" className={`${button.button} ${button.primary}`} onClick={() => go('confirm')}>
                Restart Career
              </button>
              <button type="button" className={`${button.button} ${button.secondary}`} onClick={() => go('exited')}>
                Exit
              </button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault()
              if (acknowledged) beginRestart()
              else setShowError(true)
            }}
          >
            <h2 ref={stepHeading} tabIndex={-1} className={styles.panelTitle}>
              Confirm restart
            </h2>
            <p>
              Your previous career cannot be recovered after a new one is started. Nothing is deleted
              until you choose a profile and start the new career.
            </p>
            <div className={styles.checkboxRow}>
              <input
                id={checkboxId}
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => {
                  setAcknowledged(event.target.checked)
                  setShowError(false)
                }}
                className={styles.checkbox}
              />
              <label htmlFor={checkboxId}>
                I understand that my previous saved career will be permanently replaced.
              </label>
            </div>
            <div className={styles.actions}>
              <button
                type="submit"
                className={`${button.button} ${button.danger}`}
                aria-disabled={!acknowledged}
              >
                Continue to profile selection
              </button>
              <button type="button" className={`${button.button} ${button.secondary}`} onClick={() => go('warning')}>
                Cancel
              </button>
            </div>
            {showError && (
              <p role="alert" className={styles.error}>
                Tick the box to confirm that you understand.
              </p>
            )}
          </form>
        )}

        {step === 'exited' && (
          <>
            <h2 ref={stepHeading} tabIndex={-1} className={styles.panelTitle}>
              Save left untouched
            </h2>
            <p>
              Your previous saved career has not been changed. You can close this page. The next time
              you open Trail Game, you will be asked again.
            </p>
            <div className={styles.actions}>
              <button type="button" className={`${button.button} ${button.secondary}`} onClick={() => go('warning')}>
                Back to options
              </button>
            </div>
          </>
        )}
      </div>
    </Screen>
  )
}
