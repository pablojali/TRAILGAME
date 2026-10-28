import { SEX_LABELS, type ProfileId, type Sex } from '../../domain/athlete/athlete'
import { PROFILES } from '../../domain/athlete/profiles'
import { getCreationArtUrl } from './creationArt'
import styles from './RunnerArt.module.css'

interface Pose {
  head: [number, number]
  torso: string
  arms: string[]
  legs: string[]
  ground: string
}

/** Placeholder poses, one per profile (viewBox 0 0 120 170, facing right). */
const POSES: Record<ProfileId, Pose> = {
  // Power hiking: leaning into the slope, hands on thighs.
  climber: {
    head: [80, 40],
    torso: '72,52 54,92',
    arms: ['68,58 72,80 76,96', '64,60 60,82 66,98'],
    legs: ['54,92 78,110 86,136', '54,92 42,122 32,146'],
    ground: '8,158 112,118',
  },
  // Explosive stride.
  sprinter: {
    head: [74, 30],
    torso: '70,42 58,88',
    arms: ['68,50 86,62 94,48', '66,50 46,66 38,56'],
    legs: ['58,88 84,102 80,128', '58,88 44,120 22,138'],
    ground: '8,152 112,152',
  },
  // Steady running stride.
  'all-rounder': {
    head: [68, 30],
    torso: '66,42 60,90',
    arms: ['64,50 78,66 88,60', '64,50 52,68 46,82'],
    legs: ['60,90 78,114 76,144', '60,90 50,120 34,140'],
    ground: '8,152 112,152',
  },
  // Upright, relaxed long-distance jog.
  endurance: {
    head: [64, 28],
    torso: '64,40 62,92',
    arms: ['64,50 74,70 82,66', '64,50 56,70 50,80'],
    legs: ['62,92 72,122 72,150', '62,92 56,124 46,148'],
    ground: '8,152 112,152',
  },
}

interface RunnerArtProps {
  profile: ProfileId
  sex: Sex
  className?: string
}

/**
 * Creation illustration for a profile and sex (equipment baked in; creation flow only).
 * Shows a clearly labelled placeholder until the final image exists.
 */
export function RunnerArt({ profile, sex, className = '' }: RunnerArtProps) {
  const label = `${PROFILES[profile].label}, ${SEX_LABELS[sex].toLowerCase()} runner`
  const url = getCreationArtUrl(profile, sex)

  if (url) {
    return (
      <div className={`${styles.art} ${className}`}>
        <img src={url} alt={label} className={styles.image} />
      </div>
    )
  }

  const pose = POSES[profile]
  const [hx, hy] = pose.head
  return (
    <div className={`${styles.art} ${styles.placeholder} ${className}`} data-placeholder="true">
      <svg viewBox="0 0 120 170" className={styles.figure} role="img" aria-label={`${label} (placeholder art)`}>
        <polyline points={pose.ground} className={styles.ground} />
        {sex === 'female' && <path d={`M${hx - 8} ${hy - 4} q -12 4 -10 18`} className={styles.hair} />}
        <circle cx={hx} cy={hy} r={9} className={styles.head} />
        <polyline points={pose.torso} className={styles.limb} />
        {[...pose.arms, ...pose.legs].map((points) => (
          <polyline key={points} points={points} className={styles.limb} />
        ))}
      </svg>
      <span className={styles.tag} aria-hidden="true">
        Placeholder · {SEX_LABELS[sex]}
      </span>
    </div>
  )
}
