import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Coins, Premium } from '../../components/Coins'
import { COINS_PER_PREMIUM, MAX_EXCHANGE } from '../../domain/economy/premium'
import { premiumOf, type ExchangeError } from '../../game-engine/camp'
import { useI18n, type MessageKey } from '../../i18n/i18n'
import type { ServerError } from '../../repositories/supabase/careerOpsClient'
import { useCareer } from '../game/gameContext'
import styles from './Wallet.module.css'

/**
 * The balances in the top bar (owner request, 17 November 2026): coins with the Premium Coins
 * below. A tap opens the wallet, where coins are exchanged for Premium Coins (one way, at the rate
 * of src/data/economy.csv; server-decided).
 */
export function WalletButton() {
  const { t } = useI18n()
  const { state } = useCareer()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={styles.balances} onClick={() => setOpen(true)} aria-label={t('wallet.open')}>
        <Coins amount={state.coins} />
        <Premium amount={premiumOf(state)} className={styles.premium} />
      </button>
      {/* Out of the top bar (its blur would hold a fixed layer inside it). */}
      {open && createPortal(<WalletDialog onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}

function WalletDialog({ onClose }: { onClose(): void }) {
  const { t } = useI18n()
  const { state, exchangePremium } = useCareer()
  const [amountText, setAmountText] = useState('1')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const amount = Math.max(0, Math.min(MAX_EXCHANGE, Math.floor(Number(amountText) || 0)))
  const cost = amount * COINS_PER_PREMIUM

  async function exchange() {
    if (busy || amount < 1 || cost > state.coins) return
    setBusy(true)
    setMessage(null)
    const failure = await exchangePremium(amount, COINS_PER_PREMIUM)
    setBusy(false)
    setMessage(
      failure
        ? { text: t(`basecamp.error.${failure as ExchangeError | ServerError}` as MessageKey), error: true }
        : { text: t('basecamp.exchange.done', { count: amount }), error: false },
    )
  }

  return (
    <div className={styles.back} role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="wallet-title">
        <header className={styles.head}>
          <h2 id="wallet-title">{t('wallet.title')}</h2>
          <button type="button" className={styles.close} onClick={onClose}>
            {t('basecamp.shop.close')}
          </button>
        </header>
        <p className={styles.totals}>
          <Coins amount={state.coins} />
          <Premium amount={premiumOf(state)} />
        </p>
        <h3>{t('basecamp.exchange.title')}</h3>
        <p className={styles.muted}>{t('basecamp.exchange.rate', { coins: COINS_PER_PREMIUM })}</p>
        <div className={styles.row}>
          <label>
            {t('basecamp.exchange.amount')}
            <input type="number" inputMode="numeric" min={1} max={MAX_EXCHANGE} value={amountText} onChange={(e) => setAmountText(e.target.value)} />
          </label>
          <button type="button" className={styles.action} aria-disabled={amount < 1 || cost > state.coins || busy || undefined} onClick={() => void exchange()}>
            {busy ? t('basecamp.shop.saving') : t('basecamp.exchange.go')}
          </button>
        </div>
        <p className={styles.muted}>{t('basecamp.exchange.cost', { coins: cost })}</p>
        {message && (
          <p role={message.error ? 'alert' : 'status'} className={message.error ? styles.error : styles.note}>
            {message.text}
          </p>
        )}
      </section>
    </div>
  )
}
