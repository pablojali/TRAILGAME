import { useI18n } from '../../i18n/i18n'
import { useGame } from './gameContext'
import styles from './GameNotices.module.css'

/** Shell-level messages about saving and Fitness decay. */
export function GameNotices() {
  const { saveFailed, decayNotice, dismissDecayNotice, cloudNotice, dismissCloudNotice } = useGame()
  const { t } = useI18n()

  return (
    <div role="status" className={styles.notices}>
      {saveFailed && (
        <p className={styles.notice}>{t('notice.saveFailed')}</p>
      )}
      {cloudNotice && (
        <div className={styles.notice}>
          <p>
            {cloudNotice === 'restored' ? t('notice.restored') : t('notice.updated')}
          </p>
          <button type="button" className={styles.dismiss} onClick={dismissCloudNotice}>
            {t('common.dismiss')}
          </button>
        </div>
      )}
      {decayNotice && decayNotice.fitnessLost > 0 && (
        <div className={styles.notice}>
          <p>
            {t('notice.decay', { lost: decayNotice.fitnessLost, count: decayNotice.periods })}
          </p>
          <button type="button" className={styles.dismiss} onClick={dismissDecayNotice}>
            {t('common.dismiss')}
          </button>
        </div>
      )}
    </div>
  )
}
