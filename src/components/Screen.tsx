import type { ReactNode } from 'react'
import styles from './Screen.module.css'

interface ScreenProps {
  title: string
  eyebrow?: string
  /** Read by screen readers; shown as a short line only when `showDescription` is set. */
  description: string
  showDescription?: boolean
  /** Shown at the right of the title, e.g. the coin balance. */
  aside?: ReactNode
  children?: ReactNode
}

/**
 * Standard layout for a top-level route screen. App-style (owner request, 30 October 2026): the
 * screen fills the space between the top bar and the tab bar without scrolling the page; a long
 * list scrolls inside its own panel (`ScrollPanel`).
 */
export function Screen({ title, eyebrow, description, showDescription = false, aside, children }: ScreenProps) {
  return (
    <section className={styles.screen} aria-labelledby="screen-title">
      <title>{`${title} · Trail Manager`}</title>
      <header className={styles.header}>
        <div className={styles.heading}>
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          <h1 id="screen-title" className={styles.title}>
            {title}
          </h1>
          <p className={showDescription ? styles.description : styles.srOnly}>{description}</p>
        </div>
        {aside && <div className={styles.aside}>{aside}</div>}
      </header>
      {children}
    </section>
  )
}

/** A list that scrolls inside the screen when it is longer than the space left (e.g. 50 runners). */
export function ScrollPanel({ children, label }: { children: ReactNode; label: string }) {
  return (
    // A focusable scroll region, so keyboard users can scroll it too.
    <div className={styles.scrollPanel} role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  )
}
