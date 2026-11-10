import { Link } from 'react-router'
import { useI18n, type MessageKey } from '../../i18n/i18n'
import { whenText } from './majorText'
import { majorPhase, nextMajor, useMajors } from './useMajors'
import styles from './Majors.module.css'

/** The next Sunday Major, one line above the races (owner specification §3.1). */
export function MajorStrip() {
  const { majors } = useMajors()
  const { t, locale } = useI18n()
  const major = majors && nextMajor(majors)
  if (!major) return null
  const phase = majorPhase(major, Date.now())
  const mine = major.registration?.status
  return (
    <Link to={`/majors/${major.id}`} className={styles.strip}>
      <span className={styles.stripText}>
        <small>
          {t('major.eyebrow')} · {whenText(major.scheduledStartAt, locale)}
        </small>
        <b>{major.name}</b>
      </span>
      <span className={styles.stripStatus}>
        {mine && mine !== 'WITHDRAWN' ? t(`major.you.${mine}` as MessageKey) : phase === 'SCHEDULED' ? '' : t(`major.status.${phase}` as MessageKey)}
      </span>
      <span aria-hidden="true">›</span>
    </Link>
  )
}
