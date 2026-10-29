import { Avatar } from '../../components/avatar/Avatar'
import type { Appearance } from '../../domain/athlete/appearance'
import { SEX_LABELS, type Sex } from '../../domain/athlete/athlete'
import { getEquipmentItem } from '../../domain/equipment/items'
import styles from './DashboardRunner.module.css'

interface DashboardRunnerProps {
  name: string
  sex: Sex
  appearance: Appearance
  /** Equipped item ids. */
  equipment: readonly string[]
}

/** Dashboard runner: the athlete's avatar with what is equipped. Never the creation illustrations. */
export function DashboardRunner({ name, sex, appearance, equipment }: DashboardRunnerProps) {
  const worn = equipment.map((id) => getEquipmentItem(id)?.label.toLowerCase()).filter(Boolean)
  const description = `${name}, ${SEX_LABELS[sex].toLowerCase()} runner, ${worn.length ? `wearing ${worn.join(', ')}` : 'no equipment'}`

  return (
    <figure className={styles.runner} role="img" aria-label={description}>
      <Avatar sex={sex} appearance={appearance} equipment={equipment} className={styles.layer} />
    </figure>
  )
}
