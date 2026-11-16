import { useI18n } from '../i18n/i18n'
import styles from './Coins.module.css'

/** Gold coin symbol. Decorative: pair it with the amount in text. */
export function CoinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${styles.icon} ${className ?? ''}`} aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10.5" fill="#b8860b" />
      <circle cx="12" cy="12" r="9" fill="#f2c531" />
      <circle cx="12" cy="12" r="6.2" fill="none" stroke="#c99a12" strokeWidth="1.4" />
      <path d="M8.2 7.6a6.5 6.5 0 0 1 4.6-2" fill="none" stroke="#fff3c0" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/** An amount of coins: the gold coin symbol and the number; screen readers hear "N coins". */
export function Coins({ amount, className }: { amount: number; className?: string }) {
  const { t, locale } = useI18n()
  return (
    <span className={`${styles.coins} ${className ?? ''}`}>
      <CoinIcon />
      <span>{amount.toLocaleString(locale)}</span>
      <span className={styles.srOnly}> {t('common.coinWord', { count: amount })}</span>
    </span>
  )
}

/** Premium Coin symbol (owner decision, 16 November 2026): a violet gem. Decorative. */
export function PremiumIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${styles.icon} ${className ?? ''}`} aria-hidden="true" focusable="false">
      <path d="M12 2.5 21 9l-9 12.5L3 9z" fill="#7c4dff" />
      <path d="M12 2.5 21 9h-9z" fill="#b39dff" />
      <path d="M3 9h9v12.5z" fill="#5a2fd6" />
      <path d="M7.5 5.6 12 2.5" stroke="#efe7ff" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

/** An amount of Premium Coins: the gem and the number; screen readers hear "N Premium Coins". */
export function Premium({ amount, className }: { amount: number; className?: string }) {
  const { t, locale } = useI18n()
  return (
    <span className={`${styles.coins} ${className ?? ''}`}>
      <PremiumIcon />
      <span>{amount.toLocaleString(locale)}</span>
      <span className={styles.srOnly}> {t('common.premiumWord', { count: amount })}</span>
    </span>
  )
}
