import { useState } from 'react'
import { useCareer } from '../../app/game/gameContext'
import { Avatar } from '../../components/avatar/Avatar'
import button from '../../components/Button.module.css'
import { ComingSoon } from '../../components/Card'
import { Screen } from '../../components/Screen'
import { EQUIPMENT_ITEMS, OWNED_FROM_START } from '../../domain/equipment/items'
import { isEquipped } from '../../game-engine/equipment'
import styles from './EquipmentScreen.module.css'

/** Owned equipment, put on or taken off. Cosmetic for now: it changes only the avatar. */
export function EquipmentScreen() {
  const { state, setItemEquipped } = useCareer()
  const { athlete } = state
  const [message, setMessage] = useState('')
  const owned = EQUIPMENT_ITEMS.filter((item) => OWNED_FROM_START.includes(item.id))

  return (
    <Screen
      title="Equipment"
      description="Choose what your runner wears. Equipment has no effect on training or races yet."
    >
      <div className={styles.layout}>
        <figure className={styles.preview} role="img" aria-label={`${athlete.name} with the equipment worn`}>
          <Avatar sex={athlete.sex} appearance={athlete.appearance} equipment={state.equipment} className={styles.previewArt} />
        </figure>

        <section aria-labelledby="owned-title" className={styles.owned}>
          <h2 id="owned-title" className={styles.sectionTitle}>
            Your equipment
          </h2>
          <ul className={styles.items}>
            {owned.map((item) => {
              const equipped = isEquipped(state, item.id)
              return (
                <li key={item.id} className={`${styles.item} ${equipped ? styles.equipped : ''}`}>
                  <span className={styles.itemArt}>
                    <Avatar
                      sex={athlete.sex}
                      appearance={{ ...athlete.appearance, outfit: 'none' }}
                      equipment={[item.id]}
                      crop="feet"
                    />
                  </span>
                  <span className={styles.itemText}>
                    <strong>{item.label}</strong>
                    <span className={styles.muted}>{item.description}</span>
                    <span className={styles.muted}>{equipped ? 'Equipped' : 'Not equipped'}</span>
                  </span>
                  <button
                    type="button"
                    className={`${button.button} ${equipped ? button.secondary : button.primary}`}
                    onClick={() => {
                      const error = setItemEquipped(item.id, !equipped)
                      setMessage(error ? 'That item cannot be changed.' : `${item.label} ${equipped ? 'taken off' : 'equipped'}.`)
                    }}
                  >
                    {equipped ? 'Take off' : 'Equip'}
                    <span className={styles.srOnly}> {item.label.toLowerCase()}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p role="status" className={styles.muted}>
            {message}
          </p>
        </section>
      </div>

      <ComingSoon
        milestone="a later milestone"
        items={['Hydration vests, poles and better shoes', 'Shop with prices', 'Equipment stats and terrain bonuses']}
      />
    </Screen>
  )
}
