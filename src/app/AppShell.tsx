import { useEffect, useRef } from 'react'
import { NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router'
import logoUrl from '../../assets/ui/brand/logo-128.png'
import { getLevel } from '../domain/athlete/levels'
import { Backdrop } from '../components/backdrop/Backdrop'
import { sceneForPath } from '../components/backdrop/backdrops'
import { useSceneOverride } from '../components/backdrop/sceneOverride'
import { Icon } from '../components/Icon'
import { CareerCreationScreen } from '../features/career-setup/CareerCreationScreen'
import { WelcomeScreen } from '../features/coach/WelcomeScreen'
import { CoachGuide } from '../features/coach/CoachGuide'
import { IncompatibleSaveScreen } from '../features/career-setup/IncompatibleSaveScreen'
import button from '../components/Button.module.css'
import { Screen } from '../components/Screen'
import { ConflictDialog } from './cloud/ConflictDialog'
import { InboxButton } from './inbox/Inbox'
import { WalletButton } from './wallet/Wallet'
import { useGame } from './game/gameContext'
import { GameNotices } from './game/GameNotices'
import { LevelUpDialog } from './game/LevelUpDialog'
import { ChallengeDialog } from './game/ChallengeDialog'
import { NAV_ITEMS } from './navigation'
import { useImmersiveMode } from './immersive'
import { useI18n } from '../i18n/i18n'
import { usePresencePing } from '../features/basecamp/visits'
import styles from './AppShell.module.css'

export function AppShell() {
  const { phase, retryLoad } = useGame()
  const { t } = useI18n()
  const { pathname } = useLocation()
  const main = useRef<HTMLElement>(null)
  const sceneOverride = useSceneOverride()
  // A live Sunday Major takes the whole screen: no bars (owner request, 15 November 2026).
  const immersive = useImmersiveMode()
  const previousPhase = useRef(phase.kind)
  // Visitors see the player at home while the game is open (owner design, 18 November 2026).
  usePresencePing(phase.kind === 'playing')

  // When the setup flow changes (career started, restart, reset), move focus to the new content.
  // Finishing the initial load is not a change the player made, so focus stays where it was.
  useEffect(() => {
    if (previousPhase.current !== phase.kind && previousPhase.current !== 'loading') main.current?.focus()
    previousPhase.current = phase.kind
  }, [phase.kind])

  // Until a career exists the player is in a setup flow: no navigation, fixed-height layout.
  const inSetup = phase.kind !== 'playing'

  // A new career meets its coach first (Trail Coach M1): full screen, no bars, until done or skipped.
  if (phase.kind === 'playing' && phase.state.coach?.welcomeDone === false) {
    return (
      <>
        <WelcomeScreen />
        <ConflictDialog />
      </>
    )
  }

  return (
    <div className={`${styles.shell} ${inSetup ? styles.setup : styles.scenic} ${immersive && !inSetup ? styles.immersive : ''}`}>
      {!inSetup && <Backdrop scene={sceneOverride ?? sceneForPath(pathname, phase.kind === 'playing' && phase.state.activeRace !== null)} />}
      <a href="#main-content" className={styles.skipLink}>
        {t('shell.skip')}
      </a>

      {!immersive && (
      <header className={styles.brandBar}>
        <img className={styles.brandMark} src={logoUrl} alt="" width="40" height="40" />
        <span className={styles.brandName}>Trail Manager</span>
        {/* Level and coins side by side, small, then the Inbox bell and settings (owner requests, 4 and 6 November 2026). */}
        {phase.kind === 'playing' && (
          <div className={styles.status}>
            <p className={styles.level}>{t('common.lvl', { level: getLevel(phase.state.athlete.xp) })}</p>
            <WalletButton />
          </div>
        )}
        {phase.kind === 'playing' && <InboxButton />}
        {!inSetup && (
          <NavLink
            to="/settings"
            aria-label={t('shell.settings')}
            className={({ isActive }) => `${styles.settingsLink} ${isActive ? styles.settingsLinkActive : ''}`}
          >
            <Icon name="settings" size={20} />
          </NavLink>
        )}
      </header>
      )}

      {!inSetup && !immersive && (
        <nav className={styles.nav} aria-label={t('nav.main')}>
          <ul className={styles.navList}>
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  data-coach={`nav-${item.id}`}
                  className={({ isActive }) =>
                    isActive || item.also?.some((path) => pathname === path || pathname.startsWith(`${path}/`))
                      ? `${styles.navLink} ${styles.navLinkActive}`
                      : styles.navLink
                  }
                >
                  <Icon name={item.icon} />
                  <span className={styles.navLabel}>{t(`nav.${item.id}`)}</span>
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
              {t('shell.loading')}
            </p>
          )}
          {phase.kind === 'load-failed' && (
            <Screen title={t('shell.loadFailed')} description={t('shell.loadFailedDescription')} showDescription>
              <button type="button" className={`${button.button} ${button.primary}`} onClick={retryLoad}>
                {t('shell.tryAgain')}
              </button>
            </Screen>
          )}
        </div>
      </main>

      <CoachGuide />
      <ConflictDialog />
      <LevelUpDialog />
      <ChallengeDialog />
      <ScrollRestoration />
    </div>
  )
}
