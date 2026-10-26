import { NavLink, Outlet, ScrollRestoration } from 'react-router'
import { Icon } from '../components/Icon'
import { NAV_ITEMS } from './navigation'
import styles from './AppShell.module.css'

export function AppShell() {
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

      <main id="main-content" className={styles.main} tabIndex={-1}>
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>

      <ScrollRestoration />
    </div>
  )
}
