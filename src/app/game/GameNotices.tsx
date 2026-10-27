import { useState } from 'react'
import { useGame } from './gameContext'
import styles from './GameNotices.module.css'

/** Shell-level messages about loading and saving the game. */
export function GameNotices() {
  const { loadStatus, saveFailed } = useGame()
  const [recoveryDismissed, setRecoveryDismissed] = useState(false)

  return (
    <div role="status" className={styles.notices}>
      {saveFailed && (
        <p className={styles.notice}>
          Progress could not be saved on this device. It will be lost if you close or reload the
          page.
        </p>
      )}
      {loadStatus === 'recovered' && !recoveryDismissed && (
        <div className={styles.notice}>
          <p>Your saved game could not be loaded, so a new demo game was started.</p>
          <button type="button" className={styles.dismiss} onClick={() => setRecoveryDismissed(true)}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
