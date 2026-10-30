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
  return (
    <span className={`${styles.coins} ${className ?? ''}`}>
      <CoinIcon />
      <span>{amount.toLocaleString('en-US')}</span>
      <span className={styles.srOnly}> {amount === 1 ? 'coin' : 'coins'}</span>
    </span>
  )
}
