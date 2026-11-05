import { useI18n } from '../../i18n/i18n'
import { Link } from 'react-router'
import { Screen } from '../../components/Screen'
import styles from './NotFoundScreen.module.css'

export function NotFoundScreen() {
  const { t } = useI18n()
  return (
    <Screen title={t('notFound.title')} description={t('notFound.description')}>
      <Link to="/" className={styles.link}>
        {t('notFound.back')}
      </Link>
    </Screen>
  )
}
