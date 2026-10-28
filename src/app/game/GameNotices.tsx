import { useGame } from './gameContext'
import styles from './GameNotices.module.css'

/** Shell-level messages about saving and Fitness decay. */
export function GameNotices() {
  const { saveFailed, decayNotice, dismissDecayNotice } = useGame()

  return (
    <div role="status" className={styles.notices}>
      {saveFailed && (
        <p className={styles.notice}>
          Progress could not be saved on this device. It will be lost if you close or reload the
          page.
        </p>
      )}
      {decayNotice && decayNotice.fitnessLost > 0 && (
        <div className={styles.notice}>
          <p>
            Fitness −{decayNotice.fitnessLost}: {decayNotice.periods} full{' '}
            {decayNotice.periods === 1 ? 'day' : 'days'} without a training session.
          </p>
          <button type="button" className={styles.dismiss} onClick={dismissDecayNotice}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
