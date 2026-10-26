import type { ReactNode } from 'react'
import styles from './Screen.module.css'

interface ScreenProps {
  title: string
  eyebrow?: string
  description: string
  children?: ReactNode
}

/** Standard layout for a top-level route screen. */
export function Screen({ title, eyebrow, description, children }: ScreenProps) {
  return (
    <section className={styles.screen} aria-labelledby="screen-title">
      <title>{`${title} · Trail Manager`}</title>
      <header className={styles.header}>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h1 id="screen-title" className={styles.title}>
          {title}
        </h1>
        <p className={styles.description}>{description}</p>
      </header>
      {children}
    </section>
  )
}
