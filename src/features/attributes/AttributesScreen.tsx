import { useState } from 'react'
import { Link } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { Card, Meter } from '../../components/Card'
import { Screen } from '../../components/Screen'
import {
  ATTRIBUTE_IDS,
  ATTRIBUTE_LABELS,
  ATTRIBUTE_SCALE,
  type AttributeId,
} from '../../domain/athlete/athlete'
import { ATTRIBUTE_POINTS_PER_LEVEL } from '../../domain/athlete/levels'
import { PROFILES } from '../../domain/athlete/profiles'
import { getRestFatigueDelta, RECOVERY_BONUS_FATIGUE, RECOVERY_BONUS_STEP } from '../../domain/training/recovery'
import { formatDelta, formatStat } from '../../components/format'
import { getUnspentAttributePoints, type AllocationError } from '../../game-engine/attributes'
import styles from './AttributesScreen.module.css'

const ERRORS: Record<AllocationError, string> = {
  'no-points': 'No attribute points left to spend.',
  'unknown-attribute': 'That attribute does not exist.',
  'stale-request': 'The attributes changed. Check the values and try again.',
}

function pointsText(points: number) {
  return `${points} ${points === 1 ? 'point' : 'points'}`
}

export function AttributesScreen() {
  const { state, allocateAttributePoint } = useCareer()
  const { athlete } = state
  const unspent = getUnspentAttributePoints(athlete)
  const [message, setMessage] = useState('')
  const startRecovery = PROFILES[athlete.profile].attributes.recovery

  function add(attribute: AttributeId) {
    const label = ATTRIBUTE_LABELS[attribute]
    const error = allocateAttributePoint(attribute, athlete.spentAttributePoints)
    if (error) {
      setMessage(ERRORS[error])
      return
    }
    const left = unspent - 1
    setMessage(
      `${label} increased to ${formatStat(athlete.attributes[attribute] + 1)}. ${pointsText(left)} left.`,
    )
  }

  return (
    <Screen
      eyebrow="Athlete"
      title="Attributes"
      description={`Spend attribute points one at a time. You earn ${ATTRIBUTE_POINTS_PER_LEVEL} points each time you level up. Spent points cannot be refunded.`}
    >
      <div className={styles.summary}>
        <span className={styles.points}>{unspent}</span>
        <span>{unspent === 1 ? 'attribute point' : 'attribute points'} to spend</span>
      </div>
      <Card title="Current attributes">
        <ul className={styles.list}>
          {ATTRIBUTE_IDS.map((id) => {
            const label = ATTRIBUTE_LABELS[id]
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
                  aria-label={`Add 1 point to ${label}`}
                  aria-disabled={disabled}
                  onClick={() => {
                    if (unspent <= 0) setMessage(ERRORS['no-points'])
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
          Recovery: every {RECOVERY_BONUS_STEP} points above your starting {startRecovery} make Rest recover{' '}
          {RECOVERY_BONUS_FATIGUE} more Fatigue. Rest now: Fatigue {formatDelta(getRestFatigueDelta(athlete))}.
        </p>
      </Card>

      <Link to="/" className={`${button.button} ${button.secondary} ${styles.back}`}>
        Back to Dashboard
      </Link>
    </Screen>
  )
}
