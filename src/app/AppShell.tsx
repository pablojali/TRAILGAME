import { useEffect, useRef } from 'react'
import { NavLink, Outlet, ScrollRestoration } from 'react-router'
import { Icon } from '../components/Icon'
import { IncompatibleSaveScreen } from '../features/career-setup/IncompatibleSaveScreen'
import { ProfileSelectionScreen } from '../features/career-setup/ProfileSelectionScreen'
import { useGame } from './game/gameContext'
import { GameNotices } from './game/GameNotices'
import { NAV_ITEMS } from './navigation'
import styles from './AppShell.module.css'

export function AppShell() {
  const { phase } = useGame()
  const main = useRef<HTMLElement>(null)
  const previousPhase = useRef(phase.kind)

  // When the setup flow changes (career started, restart, reset), move focus to the new content.
  useEffect(() => {
    if (previousPhase.current !== phase.kind) main.current?.focus()
    previousPhase.current = phase.kind
  }, [phase.kind])

  return (
    <div className={styles.shell}>
      <a href="#main-content" className={styles.skipLink}>
        Skip to content
      </a>

      <header className={styles.brandBar}>
        <span className={styles.brandMark} aria-hidden="true" />
        <span className={styles.brandName}>Trail Manager</span>
      </header>

      <nav className={styles.nav} aria-label="Main">
        <ul className={styles.navList}>
          {NAV_ITEMS.map((item) => (
            <li key={item.id}>
              <NavLink
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
                }
              >
                <Icon name={item.icon} />
                <span className={styles.navLabel}>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <main ref={main} id="main-content" className={styles.main} tabIndex={-1}>
        <div className={styles.content}>
          <GameNotices />
          {/* Until a career exists, every route shows the setup flow instead of its screen. */}
          {phase.kind === 'playing' && <Outlet />}
          {phase.kind === 'incompatible' && <IncompatibleSaveScreen reason={phase.reason} />}
          {phase.kind === 'new-career' && <ProfileSelectionScreen replacing={phase.replacing} />}
        </div>
      </main>

      <ScrollRestoration />
    </div>
  )
}
