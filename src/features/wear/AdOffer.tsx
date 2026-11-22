import { useRef, useState } from 'react'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { adRewardsLeft, AD_RULES, isStuckWithoutShoes } from '../../game-engine/adReward'
import { useI18n } from '../../i18n/i18n'
import styles from './Wear.module.css'

/**
 * The rewarded-ad offer (B-6d, A-5): shown only while the runner is stuck, with no pair that can
 * race and fewer coins than the cheapest pair. It says how many coin ads are left today and, when
 * none are, that the ad will give no coins, before it starts. The server decides the reward.
 */
export function AdOffer({ compact = false }: { compact?: boolean }) {
  const { state, watchRewardedAd } = useCareer()
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const pending = useRef(false)
  if (!isStuckWithoutShoes(state) && !message) return null
  const left = adRewardsLeft(state, Date.now())
  const coins = t('common.coins', { count: AD_RULES.coins })

  async function watch() {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setMessage('')
    const result = await watchRewardedAd()
    pending.current = false
    setBusy(false)
    if (result.ok) {
      const { outcome } = result
      setMessage(
        outcome.granted
          ? t('wear.ad.granted', { coins: t('common.coins', { count: outcome.coins }) })
          : outcome.reason === 'daily-limit'
            ? t('wear.ad.dailyLimit')
            : t('wear.ad.notEligible'),
      )
      return
    }
    setMessage(result.error === 'offline' ? t('wear.ad.offline') : result.error === 'ad-unavailable' ? t('wear.ad.unavailable') : t('wear.ad.error'))
  }

  if (compact) {
    return (
      <section className={styles.offerRow} aria-label={t('wear.ad.title')}>
        <p role={message ? 'status' : undefined}>
          {message || (isStuckWithoutShoes(state) ? (left > 0 ? t('wear.ad.left', { count: left }) : t('wear.ad.noCoins')) : '')}
        </p>
        {isStuckWithoutShoes(state) && (
          <button
            type="button"
            className={`${button.button} ${button.primary}`}
            aria-label={t('wear.ad.watch', { coins })}
            aria-disabled={busy || undefined}
            onClick={() => void watch()}
          >
            {busy ? t('wear.ad.playing') : t('wear.ad.watchShort', { coins })}
          </button>
        )}
      </section>
    )
  }

  return (
    <section className={styles.offer} aria-label={t('wear.ad.title')}>
      <p>
        <strong>{t('wear.ad.title')}</strong>
      </p>
      {isStuckWithoutShoes(state) && (
        <>
          <p className={styles.small}>{left > 0 ? t('wear.ad.left', { count: left }) : t('wear.ad.noCoins')}</p>
          <button type="button" className={`${button.button} ${button.primary}`} aria-disabled={busy || undefined} onClick={() => void watch()}>
            {busy ? t('wear.ad.playing') : t('wear.ad.watch', { coins })}
          </button>
        </>
      )}
      {message && (
        <p role="status" className={styles.small}>
          {message}
        </p>
      )}
    </section>
  )
}
