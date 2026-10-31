import { useEffect, useRef } from 'react'
import { NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router'
import { Backdrop } from '../components/backdrop/Backdrop'
import { sceneForPath } from '../components/backdrop/backdrops'
import { Icon } from '../components/Icon'
import { CareerCreationScreen } from '../features/career-setup/CareerCreationScreen'
import { IncompatibleSaveScreen } from '../features/career-setup/IncompatibleSaveScreen'
import button from '../components/Button.module.css'
import { Screen } from '../components/Screen'
import { ConflictDialog } from './cloud/ConflictDialog'
import { SyncIndicator } from './cloud/SyncIndicator'
import { useGame } from './game/gameContext'
import { GameNotices } from './game/GameNotices'
import { NAV_ITEMS } from './navigation'
import styles from './AppShell.module.css'

export function AppShell() {
  const { phase, retryLoad } = useGame()
  const { pathname } = useLocation()
  const main = useRef<HTMLElement>(null)
  const previousPhase = useRef(phase.kind)

  // When the setup flow changes (career started, restart, reset), move focus to the new content.
  // Finishing the initial load is not a change the player made, so focus stays where it was.
  useEffect(() => {
    if (previousPhase.current !== phase.kind && previousPhase.current !== 'loading') main.current?.focus()
    previousPhase.current = phase.kind
  }, [phase.kind])

  // Until a career exists the player is in a setup flow: no navigation, fixed-height layout.
  const inSetup = phase.kind !== 'playing'

  return (
    <div className={`${styles.shell} ${inSetup ? styles.setup : styles.scenic}`}>
      {!inSetup && <Backdrop scene={sceneForPath(pathname)} />}
      <a href="#main-content" className={styles.skipLink}>
        Skip to content
      </a>

      <header className={styles.brandBar}>
        <svg className={styles.brandMark} viewBox="0 0 32 24" aria-hidden="true">
          <path d="M1 22 L11 7 L16 14 L21 6 L31 22 Z" fill="#f07c2a" />
          <path d="M11 7 L14 11.5 L12 11 L10 13 L8.5 11 Z M21 6 L24.5 11.5 L22.5 10.5 L20.5 12.5 L18.6 9.8 Z" fill="#f2efe6" />
          <path d="M1 22 L11 7 L16 14 L21 6 L31 22" fill="none" stroke="#7a3510" strokeWidth="1" />
        </svg>
        <span className={styles.brandName}>Trail Manager</span>
        {!inSetup && <SyncIndicator />}
        {!inSetup && (
          <NavLink
            to="/settings"
            aria-label="Settings"
            className={({ isActive }) => `${styles.settingsLink} ${isActive ? styles.settingsLinkActive : ''}`}
          >
            <Icon name="settings" />
          </NavLink>
        )}
      </header>

      {!inSetup && (
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
      )}

      <main ref={main} id="main-content" className={styles.main} tabIndex={-1}>
        <div className={styles.content}>
          <GameNotices />
          {/* Until a career exists, every route shows the setup flow instead of its screen. */}
          {phase.kind === 'playing' && <Outlet />}
          {phase.kind === 'incompatible' && <IncompatibleSaveScreen reason={phase.reason} />}
          {phase.kind === 'new-career' && <CareerCreationScreen replacing={phase.replacing} />}
          {phase.kind === 'loading' && (
            <p role="status" className={styles.loading}>
              Loading your career…
            </p>
          )}
          {phase.kind === 'load-failed' && (
            <Screen title="Could not load your career" description="Your saved career could not be read." showDescription>
              <button type="button" className={`${button.button} ${button.primary}`} onClick={retryLoad}>
                Try again
              </button>
            </Screen>
          )}
        </div>
      </main>

      <ConflictDialog />
      <ScrollRestoration />
    </div>
  )
}
