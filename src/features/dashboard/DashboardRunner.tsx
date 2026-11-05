import { useI18n } from '../../i18n/i18n'
import { Avatar } from '../../components/avatar/Avatar'
import type { Appearance } from '../../domain/athlete/appearance'
import type { Sex } from '../../domain/athlete/athlete'
import { getEquipmentItem, itemName } from '../../domain/equipment/items'
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
  const { t, locale } = useI18n()
  const worn = equipment.map((id) => getEquipmentItem(id)).filter((item) => item !== undefined).map((item) => itemName(item).toLowerCase())
  const description = t('dashboard.runner', {
    name,
    sex: t(`sex.${sex}`).toLocaleLowerCase(locale),
    gear: worn.length ? t('dashboard.wearing', { items: worn.join(', ') }) : t('dashboard.noEquipment'),
  })

  return (
    <figure className={styles.runner} role="img" aria-label={description}>
      <Avatar sex={sex} appearance={appearance} equipment={equipment} className={styles.layer} />
    </figure>
  )
}
