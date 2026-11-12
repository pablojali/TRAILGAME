import { Link } from 'react-router'
import { useI18n, type MessageKey } from '../../i18n/i18n'
import { clockText, whenText } from './majorText'
import { useSecond } from './useSecond'
import { majorPhase, useMajors } from './useMajors'
import styles from './Majors.module.css'

/**
 * The next Sunday Major on the Dashboard, beside Today (owner request, 12 November 2026): its own
 * colours so it stands out, the time left, the player's status and the one thing to do now.
 * Nothing when no Major is coming or running.
 */
export function MajorDashboardCard() {
  const { majors } = useMajors()
  const { t, locale } = useI18n()
  const now = useSecond()
  const major = majors?.find((m) => m.status !== 'FINISHED' && m.status !== 'CANCELLED' && m.status !== 'DRAFT')
  if (!major) return null
  const phase = majorPhase(major, now)
  const mine = major.registration && major.registration.status !== 'WITHDRAWN' ? major.registration.status : null
  const live = major.status === 'RUNNING' || major.status === 'STARTING'
  const action: MessageKey = live
    ? mine === 'RACING'
      ? 'major.cta.live'
      : 'major.cta.watch'
    : !mine
      ? phase === 'SCHEDULED'
        ? 'major.cta.see'
        : 'major.cta.register'
      : mine === 'REGISTERED' && phase === 'READY'
        ? 'major.cta.ready'
        : 'major.cta.see'
  const status = live
    ? t('major.status.RUNNING')
    : mine
      ? t(`major.you.${mine}` as MessageKey)
      : t(`major.status.${phase}` as MessageKey, { when: major.registrationOpenAt ? whenText(major.registrationOpenAt, locale) : '' })
  return (
    <Link to={`/majors/${major.id}`} className={`${styles.dashCard} ${live ? styles.dashLive : ''}`} aria-label={`${t('major.eyebrow')}: ${major.name}`}>
      <span className={styles.dashEyebrow}>{t('major.eyebrow')}</span>
      <b className={styles.dashName}>{major.name}</b>
      <span className={styles.dashWhen}>
        {live ? t('major.dash.now') : <span className={styles.dashClock}>{clockText((Date.parse(major.scheduledStartAt) - now) / 1000)}</span>}
      </span>
      <span className={styles.dashStatus}>{status}</span>
      <span className={styles.dashAction}>{t(action)} ›</span>
    </Link>
  )
}
