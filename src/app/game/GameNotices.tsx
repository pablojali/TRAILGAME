import { useGame } from './gameContext'
import styles from './GameNotices.module.css'

/** Shell-level messages about saving and Fitness decay. */
export function GameNotices() {
  const { saveFailed, decayNotice, dismissDecayNotice, cloudNotice, dismissCloudNotice } = useGame()

  return (
    <div role="status" className={styles.notices}>
      {saveFailed && (
        <p className={styles.notice}>
          Progress could not be saved on this device. It will be lost if you close or reload the
          page.
        </p>
      )}
      {cloudNotice && (
        <div className={styles.notice}>
          <p>
            {cloudNotice === 'restored'
              ? 'Your career was restored from your cloud save.'
              : 'Your career was updated with the progress saved from another device.'}
          </p>
          <button type="button" className={styles.dismiss} onClick={dismissCloudNotice}>
            Dismiss
          </button>
        </div>
      )}
      {decayNotice && decayNotice.fitnessLost > 0 && (
        <div className={styles.notice}>
          <p>
            Fitness −{decayNotice.fitnessLost}: {decayNotice.periods}{' '}
            {decayNotice.periods === 1 ? 'day' : 'days'} without playing, after the first free day.
          </p>
          <button type="button" className={styles.dismiss} onClick={dismissDecayNotice}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
