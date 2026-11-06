import { useI18n } from '../../i18n/i18n'
import { useGame } from './gameContext'
import styles from './GameNotices.module.css'

/**
 * Shell-level message when the career could not be saved. Fitness decay and cloud-save messages are
 * in the Inbox (owner request, 6 November 2026).
 */
export function GameNotices() {
  const { saveFailed } = useGame()
  const { t } = useI18n()

  return (
    <div role="status" className={styles.notices}>
      {saveFailed && (
        <p className={styles.notice}>{t('notice.saveFailed')}</p>
      )}
    </div>
  )
}
