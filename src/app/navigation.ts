import type { IconName } from '../components/Icon'

export interface NavItem {
  /** Stable identifier; do not depend on the label. */
  id: 'dashboard' | 'training' | 'basecamp' | 'races' | 'career'
  label: string
  path: string
  icon: IconName
  /** Other sections shown as this item (Base Camp holds Equipment and Appearance). */
  also?: readonly string[]
}

/** Main navigation (DEVELOPMENT.md §5). Order matters. */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: 'dashboard' },
  { id: 'training', label: 'Training', path: '/training', icon: 'training' },
  // Base Camp replaces Equipment (owner design, 15 November 2026): Equipment is a zone inside it.
  { id: 'basecamp', label: 'Base Camp', path: '/base-camp', icon: 'basecamp', also: ['/equipment', '/appearance'] },
  { id: 'races', label: 'Races', path: '/races', icon: 'races' },
  { id: 'career', label: 'Career', path: '/career', icon: 'career' },
]
