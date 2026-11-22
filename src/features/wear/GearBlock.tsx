import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import type { RaceGearError } from '../../game-engine/wear'
import { useI18n } from '../../i18n/i18n'
import { AdOffer } from './AdOffer'
import styles from './Wear.module.css'

/**
 * Why the runner cannot enter or start a race (A-5): no shoes equipped, or shoes at 0 %. It links to
 * Equipment; on race day it also offers to withdraw (the day becomes a Rest day, B-6b) and, when the
 * runner is stuck with no coins, the rewarded ad (B-6d).
 */
export function GearBlock({ error, raceDay = false, raceName }: { error: RaceGearError; raceDay?: boolean; raceName?: string }) {
  const { state, withdrawRace } = useCareer()
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const pending = useRef(false)

  async function withdraw() {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setMessage('')
    const failure = await withdrawRace({ week: state.week.number, dayIndex: state.week.currentDayIndex })
    pending.current = false
    setBusy(false)
    setMessage(failure ? t('wear.withdrawError') : t('wear.withdrawn', { race: raceName ?? '' }))
  }

  return (
    <div className={styles.notice} role="group" aria-label={t(error === 'no-shoes-equipped' ? 'wear.error.noShoes' : 'wear.error.shoesWornOut')}>
      <p id="gear-block">
        {t(error === 'no-shoes-equipped' ? 'wear.error.noShoes' : 'wear.error.shoesWornOut')}
        {raceDay && <span className={styles.small}> {t('wear.withdrawHint')}</span>}
      </p>
      <div className={styles.actions}>
        <Link to="/equipment?slot=shoes" className={`${button.button} ${button.secondary}`}>
          {t('wear.goToEquipment')}
        </Link>
        {raceDay && (
          <button type="button" className={`${button.button} ${button.secondary}`} aria-disabled={busy || undefined} onClick={() => void withdraw()}>
            {busy ? t('wear.withdrawing') : t('wear.withdraw')}
          </button>
        )}
      </div>
      {message && (
        <p role="status" className={styles.small}>
          {message}
        </p>
      )}
      <AdOffer compact />
    </div>
  )
}
