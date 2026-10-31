import { generateCourse } from '../../game-engine/raceSimulation'
import type { Race } from '../../domain/races/races'
import styles from './Races.module.css'

const WIDTH = 120
const HEIGHT = 36

/**
 * Small elevation profile of a race (owner request, 31 October 2026), drawn from the course the
 * race simulation uses: every climb and descent in order, to scale along the distance. Heights
 * are scaled to the race's own highest point. Decorative: the distance and gain are given as text.
 */
export function ElevationProfile({ race, className }: { race: Race; className?: string }) {
  const course = generateCourse(race)
  const total = course.reduce((sum, s) => sum + s.lengthM, 0)
  let distance = 0
  let elevation = 0
  const points: [number, number][] = [[0, 0]]
  for (const segment of course) {
    distance += segment.lengthM
    elevation += segment.gainM - segment.lossM
    points.push([distance, elevation])
  }
  const top = Math.max(1, ...points.map(([, e]) => e))
  const xy = points.map(([d, e]) => [(d / total) * WIDTH, HEIGHT - 2 - (e / top) * (HEIGHT - 6)] as const)
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={`${styles.profile} ${className ?? ''}`} preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,${HEIGHT} ${line} ${WIDTH},${HEIGHT}`} className={styles.profileArea} />
      <polyline points={line} className={styles.profileLine} />
    </svg>
  )
}
