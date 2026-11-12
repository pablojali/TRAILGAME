import { useI18n, type MessageKey } from '../../i18n/i18n'
import { useState } from 'react'
import { Link } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { Meter } from '../../components/Card'
import { Screen } from '../../components/Screen'
import { ATTRIBUTE_IDS, ATTRIBUTE_SCALE, type AttributeId } from '../../domain/athlete/athlete'
import { ATTRIBUTE_POINTS_PER_LEVEL } from '../../domain/athlete/levels'
import { PROFILES } from '../../domain/athlete/profiles'
import { getRestFatigueDelta, RECOVERY_BONUS_FATIGUE, RECOVERY_BONUS_STEP } from '../../domain/training/recovery'
import { formatStat, formatFatigueDelta } from '../../components/format'
import { getUnspentAttributePoints, type AllocationError } from '../../game-engine/attributes'
import type { ServerError } from '../../repositories/supabase/careerOpsClient'
import styles from './AttributesScreen.module.css'

const ERRORS: Record<AllocationError | ServerError, MessageKey> = {
  offline: 'attributes.error.offline',
  'server-error': 'attributes.error.server-error',
  'no-points': 'attributes.error.no-points',
  'unknown-attribute': 'attributes.error.unknown-attribute',
  'stale-request': 'attributes.error.stale-request',
}

export function AttributesScreen() {
  const { state, allocateAttributePoint } = useCareer()
  const { athlete } = state
  const unspent = getUnspentAttributePoints(athlete)
  const [message, setMessage] = useState('')
  const startRecovery = PROFILES[athlete.profile].attributes.recovery
  const { t } = useI18n()

  async function add(attribute: AttributeId) {
    const label = t(`attr.${attribute}`)
    const error = await allocateAttributePoint(attribute, athlete.spentAttributePoints)
    if (error) {
      setMessage(t(ERRORS[error]))
      return
    }
    const left = unspent - 1
    setMessage(
      t('attributes.increased', {
        attribute: label,
        value: formatStat(athlete.attributes[attribute] + 1),
        points: t('common.points', { count: left }),
      }),
    )
  }

  return (
    <Screen
      eyebrow={t('attributes.eyebrow')}
      title={t('attributes.title')}
      description={t('attributes.description', { count: ATTRIBUTE_POINTS_PER_LEVEL })}
      aside={
        <p className={styles.summary}>
          <span className={styles.points}>{unspent}</span>
          <span>{t('attributes.toSpend', { count: unspent })}</span>
        </p>
      }
    >
      <section className={styles.panel} aria-label={t('attributes.current')}>
        <ul className={styles.list}>
          {ATTRIBUTE_IDS.map((id) => {
            const label = t(`attr.${id}`)
            const value = athlete.attributes[id]
            const disabled = unspent <= 0
            return (
              <li key={id} className={styles.row}>
                <div className={styles.rowText}>
                  <span className={styles.label}>{label}</span>
                  <span className={styles.value}>{formatStat(value)}</span>
                </div>
                <Meter
                  label={label}
                  // The bar is full at 100; attributes have no upper limit (owner decision).
                  value={Math.min(value, ATTRIBUTE_SCALE)}
                  min={0}
                  max={ATTRIBUTE_SCALE}
                  valueText={formatStat(value)}
                />
                <button
                  type="button"
                  className={`${button.button} ${button.secondary} ${styles.add}`}
                  aria-label={t('attributes.add', { attribute: label })}
                  aria-disabled={disabled}
                  onClick={() => {
                    if (unspent <= 0) setMessage(t(ERRORS['no-points']))
                    else add(id)
                  }}
                >
                  +1
                </button>
              </li>
            )
          })}
        </ul>
        <p role="status" className={styles.muted}>
          {message}
        </p>
        <p className={styles.muted}>
          {t('attributes.recovery', {
            step: RECOVERY_BONUS_STEP,
            start: startRecovery,
            bonus: RECOVERY_BONUS_FATIGUE,
            delta: formatFatigueDelta(getRestFatigueDelta(athlete)),
          })}
        </p>
      </section>

      <Link to="/" className={`${button.button} ${button.secondary} ${styles.back}`}>
        {t('attributes.back')}
      </Link>
    </Screen>
  )
}
