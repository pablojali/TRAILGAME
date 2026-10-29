import { Avatar } from '../../components/avatar/Avatar'
import type { Appearance } from '../../domain/athlete/appearance'
import { SEX_LABELS, type Sex } from '../../domain/athlete/athlete'
import { resolveEquipmentLayers } from './dashboardArt'
import styles from './DashboardRunner.module.css'

interface DashboardRunnerProps {
  name: string
  sex: Sex
  appearance: Appearance
  /** Equipped item ids, bottom to top. Empty until an equipment system exists. */
  equipment?: readonly string[]
}

/**
 * Dashboard runner: the athlete's avatar plus one layer per equipped item, on the same canvas.
 * Never uses the creation illustrations, whose equipment is baked in.
 */
export function DashboardRunner({ name, sex, appearance, equipment = [] }: DashboardRunnerProps) {
  const layers = resolveEquipmentLayers(sex, equipment)
  const worn = layers.map((layer) => layer.id).join(', ')
  const description = `${name}, ${SEX_LABELS[sex].toLowerCase()} runner, ${worn ? `wearing ${worn}` : 'no equipment'}`

  return (
    <figure className={styles.runner} role="img" aria-label={description}>
      <Avatar sex={sex} appearance={appearance} className={styles.layer} />
      {layers.map((layer) => (
        <img key={layer.id} src={layer.url} alt="" className={styles.layer} data-layer={layer.id} />
      ))}
    </figure>
  )
}
