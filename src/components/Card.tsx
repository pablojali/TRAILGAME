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
}

export function StatTile({ label, value, tone = 'brand' }: StatTileProps) {
  return (
    <div className={`${styles.statTile} ${styles[tone]}`}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
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
