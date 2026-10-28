import { SEX_LABELS, type Sex } from '../../domain/athlete/athlete'
import { resolveDashboardArt } from './dashboardArt'
import styles from './DashboardRunner.module.css'

interface DashboardRunnerProps {
  name: string
  sex: Sex
  /** Equipped item ids, bottom to top. Empty until an equipment system exists. */
  equipment?: readonly string[]
}

/**
 * Layered Dashboard runner: a base body for the runner's sex plus one layer per equipped item.
 * Never uses the creation illustrations, whose equipment is baked in.
 */
export function DashboardRunner({ name, sex, equipment = [] }: DashboardRunnerProps) {
  const art = resolveDashboardArt(sex, equipment)
  const worn = art.layers.map((layer) => layer.id).join(', ')
  const description = `${name}, ${SEX_LABELS[sex].toLowerCase()} runner, ${
    worn ? `wearing ${worn}` : 'no equipment'
  }${art.body ? '' : ' (placeholder art)'}`

  return (
    <figure className={styles.runner} role="img" aria-label={description}>
      {art.body ? (
        <img src={art.body} alt="" className={styles.layer} data-layer="body" />
      ) : (
        <PlaceholderBody sex={sex} />
      )}
      {art.layers.map((layer) => (
        <img key={layer.id} src={layer.url} alt="" className={styles.layer} data-layer={layer.id} />
      ))}
      {!art.body && (
        <span className={styles.tag} aria-hidden="true">
          Placeholder · {SEX_LABELS[sex]}
        </span>
      )}
    </figure>
  )
}

/** Neutral standing pose with minimal base clothing (top and shorts), facing right. */
function PlaceholderBody({ sex }: { sex: Sex }) {
  return (
    <svg viewBox="0 0 100 200" className={styles.layer} aria-hidden="true" data-layer="body-placeholder">
      <ellipse cx="50" cy="192" rx="30" ry="4" className={styles.shadow} />
      {sex === 'female' && <path d="M44 22 q -10 6 -8 22" className={styles.hair} />}
      <circle cx="52" cy="24" r="11" className={styles.skin} />
      <path d="M44 36 h14 l5 36 h-24 z" className={styles.top} />
      <path d="M41 70 h22 l2 22 h-11 l-2 -10 l-2 10 h-11 z" className={styles.shorts} />
      <path d="M45 92 l-2 44 l2 46" className={styles.limb} />
      <path d="M59 92 l2 44 l-2 46" className={styles.limb} />
      <path d="M45 40 l-6 28 l2 22" className={styles.limb} />
      <path d="M58 40 l6 28 l-2 22" className={styles.limb} />
    </svg>
  )
}
