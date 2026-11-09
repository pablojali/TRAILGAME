import { MAX_TECHNICALITY } from '../../domain/races/races'
import { useI18n } from '../../i18n/i18n'
import styles from './Races.module.css'

/**
 * A race's technical difficulty, 0–5, always in view (owner request, 9 November 2026): "Technical"
 * and five pips, filled up to the race's value.
 */
export function Technicality({ value }: { value: number }) {
  const { t } = useI18n()
  return (
    <span className={styles.technicality} role="img" aria-label={t('races.technicalityLabel', { value, max: MAX_TECHNICALITY })}>
      <span aria-hidden="true">{t('races.technical')}</span>
      <span className={styles.pips} aria-hidden="true">
        {Array.from({ length: MAX_TECHNICALITY }, (_, index) => (
          <span key={index} className={index < value ? styles.pipOn : styles.pip} />
        ))}
      </span>
    </span>
  )
}
