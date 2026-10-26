import type { IconName } from '../components/Icon'

export interface NavItem {
  /** Stable identifier; do not depend on the label. */
  id: 'dashboard' | 'training' | 'equipment' | 'races' | 'career'
  label: string
  path: string
  icon: IconName
}

/** Main navigation (DEVELOPMENT.md §5). Order matters. */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: 'dashboard' },
  { id: 'training', label: 'Training', path: '/training', icon: 'training' },
  { id: 'equipment', label: 'Equipment', path: '/equipment', icon: 'equipment' },
  { id: 'races', label: 'Races', path: '/races', icon: 'races' },
  { id: 'career', label: 'Career', path: '/career', icon: 'career' },
]
