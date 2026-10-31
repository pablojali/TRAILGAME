import { racePhoto } from '../../components/backdrop/backdrops'
import type { RaceCategory } from '../../domain/races/categories'
import type { Race } from '../../domain/races/races'
import styles from './Races.module.css'

/** Sky and ridge colours of the drawn picture, by category, until the race has the owner's photo. */
const DRAWN: Record<RaceCategory, { sky: [string, string]; far: string; near: string }> = {
  open: { sky: ['#7fb7d6', '#d7ecd8'], far: '#5f8f6a', near: '#2f5a3c' },
  trail: { sky: ['#5f9fb8', '#cfe3d2'], far: '#4f7b78', near: '#294a46' },
  mountain: { sky: ['#4f6f9a', '#c9d6e6'], far: '#6c7c93', near: '#36435a' },
  elite: { sky: ['#3a3f6e', '#e0a16a'], far: '#5b5578', near: '#2a2840' },
}

/** The race's picture: the owner's photo (assets/ui/races/{race id}) or a drawn landscape. */
export function RacePhoto({ race }: { race: Race }) {
  const photo = racePhoto(race.id)
  if (photo) return <img className={styles.photo} src={photo} alt="" />
  const colors = DRAWN[race.category]
  const id = `race-sky-${race.id}`
  // Steeper, taller ridges for harder races; peaks placed by the race number so each race differs.
  const peak = 14 + race.technicality * 6
  const n = Number(race.id.replace(/\D/g, '')) || 0
  const a = 12 + ((n * 7) % 14)
  const b = 44 + ((n * 11) % 16)
  return (
    <svg viewBox="0 0 80 80" className={styles.photo} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={colors.sky[0]} />
          <stop offset="1" stopColor={colors.sky[1]} />
        </linearGradient>
      </defs>
      <rect width="80" height="80" fill={`url(#${id})`} />
      <path d={`M0 50 L${a} ${44 - peak} L${a + 14} 46 L${b} ${40 - peak} L${b + 14} 47 L80 ${42 - peak / 2} V80 H0 Z`} fill={colors.far} />
      <path d="M0 62 L20 52 L38 60 L58 50 L80 58 V80 H0 Z" fill={colors.near} />
    </svg>
  )
}
