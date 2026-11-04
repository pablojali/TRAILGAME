import { useEffect, useRef } from 'react'
import { NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router'
import logoUrl from '../../assets/ui/brand/logo-128.png'
import { Coins } from '../components/Coins'
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
import { LevelUpDialog } from './game/LevelUpDialog'
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
      {!inSetup && <Backdrop scene={sceneForPath(pathname, phase.kind === 'playing' && phase.state.activeRace !== null)} />}
      <a href="#main-content" className={styles.skipLink}>
        Skip to content
      </a>

      <header className={styles.brandBar}>
        <img className={styles.brandMark} src={logoUrl} alt="" width="40" height="40" />
        <span className={styles.brandName}>Trail Manager</span>
        {/* The coin balance beside the cloud, on every screen (owner request, 3 November 2026). */}
        {phase.kind === 'playing' && (
          <p className={styles.balance}>
            <Coins amount={phase.state.coins} />
          </p>
        )}
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
      <LevelUpDialog />
      <ScrollRestoration />
    </div>
  )
}
