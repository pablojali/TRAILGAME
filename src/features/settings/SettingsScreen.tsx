import { useEffect, useRef, useState } from 'react'
import { useGame } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { Card } from '../../components/Card'
import { Screen } from '../../components/Screen'
import styles from './SettingsScreen.module.css'

/** Settings, behind the top bar's icon. For now only the demo reset (moved from the Dashboard). */
export function SettingsScreen() {
  return (
    <Screen title="Settings" description="Game options.">
      <ResetDemo />
    </Screen>
  )
}

function ResetDemo() {
  const { resetCareer } = useGame()
  const [confirming, setConfirming] = useState(false)
  const resetButton = useRef<HTMLButtonElement>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)
  // Keeps keyboard focus on the visible control when the buttons swap.
  const focusTarget = useRef<'reset' | 'confirm' | null>(null)

  useEffect(() => {
    if (focusTarget.current === 'reset') resetButton.current?.focus()
    if (focusTarget.current === 'confirm') confirmButton.current?.focus()
    focusTarget.current = null
  }, [confirming])

  function toggle(next: boolean) {
    focusTarget.current = next ? 'confirm' : 'reset'
    setConfirming(next)
  }

  return (
    <Card title="Demo">
      {confirming ? (
        <>
          <p className={styles.muted}>This erases all saved progress. You will then choose a new starting profile.</p>
          <div className={styles.actions}>
            <button ref={confirmButton} type="button" className={`${button.button} ${button.danger}`} onClick={resetCareer}>
              Confirm reset
            </button>
            <button type="button" className={`${button.button} ${button.secondary}`} onClick={() => toggle(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.muted}>Start over with a new career and starting profile.</p>
          <div className={styles.actions}>
            <button ref={resetButton} type="button" className={`${button.button} ${button.secondary}`} onClick={() => toggle(true)}>
              Reset demo
            </button>
          </div>
        </>
      )}
    </Card>
  )
}
