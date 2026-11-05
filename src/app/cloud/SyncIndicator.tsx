import { useI18n } from '../../i18n/i18n'
import { NavLink } from 'react-router'
import { Icon } from '../../components/Icon'
import { useGame } from '../game/gameContext'
import { CLOUD_STATUS_TEXT } from './cloudText'
import styles from './Cloud.module.css'

/**
 * A small cloud in the top bar showing the cloud save: no dot when saved, a dot while saving or
 * pending, a warning colour for a conflict or error. It opens Settings, where the account and the
 * cloud save are described. Hidden without Supabase.
 */
export function SyncIndicator() {
  const { cloudStatus } = useGame()
  const { t } = useI18n()
  if (cloudStatus === 'off') return null
  const text = t(CLOUD_STATUS_TEXT[cloudStatus])
  return (
    <NavLink to="/settings" className={styles.indicator} data-status={cloudStatus} aria-label={t('cloud.indicator', { status: text })} title={text}>
      <Icon name="cloud" size={20} />
      <span className={styles.dot} aria-hidden="true" />
    </NavLink>
  )
}
