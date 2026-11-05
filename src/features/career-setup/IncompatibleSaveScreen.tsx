import { useI18n, type MessageKey } from '../../i18n/i18n'
import { useEffect, useId, useRef, useState } from 'react'
import { useGame } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { Screen } from '../../components/Screen'
import type { IncompatibleReason } from '../../repositories/gameRepository'
import styles from './CareerSetup.module.css'

const REASONS: Record<IncompatibleReason, MessageKey> = {
  'legacy-v1': 'incompatible.reason.legacy-v1',
  'unsupported-version': 'incompatible.reason.unsupported-version',
  malformed: 'incompatible.reason.malformed',
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
  const { t } = useI18n()

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
      eyebrow={t('incompatible.eyebrow')}
      title={t('incompatible.title')}
      description={t('incompatible.description')}
    >
      <div className={styles.panel}>
        {step === 'warning' && (
          <>
            <h2 ref={stepHeading} tabIndex={-1} className={styles.panelTitle}>
              {t('incompatible.what')}
            </h2>
            <p role="alert">{t(REASONS[reason])}</p>
            <p className={styles.muted}>{t('incompatible.options')}</p>
            <div className={styles.actions}>
              <button type="button" className={`${button.button} ${button.primary}`} onClick={() => go('confirm')}>
                {t('incompatible.restart')}
              </button>
              <button type="button" className={`${button.button} ${button.secondary}`} onClick={() => go('exited')}>
                {t('incompatible.exit')}
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
              {t('incompatible.confirmTitle')}
            </h2>
            <p>{t('incompatible.confirmText')}</p>
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
                {t('incompatible.understand')}
              </label>
            </div>
            <div className={styles.actions}>
              <button
                type="submit"
                className={`${button.button} ${button.danger}`}
                aria-disabled={!acknowledged}
              >
                {t('incompatible.continue')}
              </button>
              <button type="button" className={`${button.button} ${button.secondary}`} onClick={() => go('warning')}>
                {t('common.cancel')}
              </button>
            </div>
            {showError && (
              <p role="alert" className={styles.error}>
                {t('incompatible.tick')}
              </p>
            )}
          </form>
        )}

        {step === 'exited' && (
          <>
            <h2 ref={stepHeading} tabIndex={-1} className={styles.panelTitle}>
              {t('incompatible.untouched')}
            </h2>
            <p>{t('incompatible.untouchedText')}</p>
            <div className={styles.actions}>
              <button type="button" className={`${button.button} ${button.secondary}`} onClick={() => go('warning')}>
                {t('incompatible.back')}
              </button>
            </div>
          </>
        )}
      </div>
    </Screen>
  )
}
