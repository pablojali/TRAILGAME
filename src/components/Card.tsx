import type { ReactNode } from 'react'
import styles from './Card.module.css'

interface CardProps {
  title: string
  children: ReactNode
}

export function Card({ title, children }: CardProps) {
  return (
    <article className={styles.card}>
      <h2 className={styles.cardTitle}>{title}</h2>
      {children}
    </article>
  )
}

interface StatTileProps {
  label: string
  /** Display value; placeholders use an em dash until data exists. */
  value: string
  tone?: 'brand' | 'accent' | 'ochre'
  /** Shows an accessible bar for values on a fixed scale. */
  meter?: { value: number; min?: number; max: number }
}

export function StatTile({ label, value, tone = 'brand', meter }: StatTileProps) {
  return (
    <div className={`${styles.statTile} ${styles[tone]}`}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      {meter && <Meter label={label} {...meter} />}
    </div>
  )
}

interface MeterProps {
  label: string
  value: number
  min?: number
  max: number
  /** Spoken value; defaults to "value of max". */
  valueText?: string
  /** Extra class, e.g. to set the bar colour through `color`. */
  className?: string
}

export function Meter({ label, value, min = 0, max, valueText, className = '' }: MeterProps) {
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 100
  return (
    <div
      className={`${styles.meter} ${className}`}
      role="meter"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText ?? `${value} of ${max}`}
    >
      <div className={styles.meterFill} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  )
}

interface ComingSoonProps {
  milestone: string
  items: readonly string[]
}

/** Lists what a placeholder screen will contain once its milestone ships. */
export function ComingSoon({ milestone, items }: ComingSoonProps) {
  return (
    <Card title={`Planned for ${milestone}`}>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Card>
  )
}
