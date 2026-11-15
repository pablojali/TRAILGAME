import { useState } from 'react'
import { EQUIPMENT_ITEMS, isLookAccessory } from '../../domain/equipment/items'
import { useI18n } from '../../i18n/i18n'
import { ItemCard, ItemDetail } from '../equipment/EquipmentScreen'
import styles from './AppearanceScreen.module.css'

/**
 * Appearance › Accessories (owner request, 15 November 2026): glasses and caps, bought with coins
 * and worn here, never in the Equipment screen and never when creating a career. They are items of
 * the equipment table (types `glasses` and `cap`): the server buys and puts them on like any item,
 * one of each at a time. Cosmetic only.
 */
export function LookAccessories() {
  const { t } = useI18n()
  const [open, setOpen] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const items = EQUIPMENT_ITEMS.filter(isLookAccessory).sort((a, b) => (a.slot === b.slot ? 0 : a.slot === 'glasses' ? -1 : 1))
  const item = open ? items.find((i) => i.id === open) : undefined

  if (item) {
    return (
      <div className={styles.accessories}>
        <ItemDetail item={item} backLabel={t('look.accessories.title')} onBack={() => setOpen(null)} onMessage={setMessage} />
        {message && (
          <p role="status" className={styles.accessoryMessage}>
            {message}
          </p>
        )}
      </div>
    )
  }
  return (
    <div className={styles.accessories}>
      <p className={styles.accessoryIntro}>{t('look.accessories.intro')}</p>
      {message && (
        <p role="status" className={styles.accessoryMessage}>
          {message}
        </p>
      )}
      {items.length === 0 ? (
        <p className={styles.accessoryIntro}>{t('look.accessories.none')}</p>
      ) : (
        <ul className={styles.accessoryGrid} aria-label={t('look.accessories.title')}>
          {items.map((i) => (
            <li key={i.id}>
              <ItemCard
                item={i}
                onOpen={(id) => {
                  setMessage('')
                  setOpen(id)
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
