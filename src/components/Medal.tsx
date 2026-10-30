import type { Medal } from '../game-engine/career'
import styles from './Coins.module.css'

const COLORS: Record<Medal, { face: string; rim: string; ribbon: string }> = {
  gold: { face: '#f2c531', rim: '#b8860b', ribbon: '#d6453a' },
  silver: { face: '#d3d8dd', rim: '#8a939b', ribbon: '#2f5fd0' },
  bronze: { face: '#d08a4c', rim: '#8a4f22', ribbon: '#2f9e5b' },
}

/** A medal with its ribbon. Decorative unless `label` is given. */
export function MedalIcon({ medal, label, className }: { medal: Medal; label?: string; className?: string }) {
  const color = COLORS[medal]
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }
  return (
    <svg viewBox="0 0 24 24" className={`${styles.icon} ${className ?? ''}`} focusable="false" {...a11y}>
      <path d="M7 1h4l2 7H9zM13 1h4l-2 7h-4z" fill={color.ribbon} />
      <circle cx="12" cy="15" r="8" fill={color.rim} />
      <circle cx="12" cy="15" r="6.5" fill={color.face} />
      <path d="M12 11.2l1.1 2.3 2.5.3-1.8 1.7.5 2.5-2.3-1.2-2.3 1.2.5-2.5-1.8-1.7 2.5-.3z" fill={color.rim} opacity="0.55" />
    </svg>
  )
}
