import { useState } from 'react'
import { useCareer } from '../../app/game/gameContext'
import { Avatar } from '../../components/avatar/Avatar'
import button from '../../components/Button.module.css'
import { Screen } from '../../components/Screen'
import { formatCoins } from '../../domain/economy/coins'
import { EQUIPMENT_ITEMS, type EquipmentItem, type EquipmentSlot } from '../../domain/equipment/items'
import { isEquipped, type BuyError } from '../../game-engine/equipment'
import styles from './EquipmentScreen.module.css'

const BUY_ERRORS: Record<BuyError, string> = {
  'unknown-item': 'That item does not exist.',
  'already-owned': 'You already own this item.',
  'insufficient-coins': 'You do not have enough coins for this item.',
  'price-changed': 'The price changed. Check it and try again.',
}

/** Item artwork exists only for the starter shoes; other items show an icon until art is added. */
const HAS_ART = new Set(['starter-shoes'])

const ICON_PATHS: Record<EquipmentSlot, string> = {
  shoes: 'M3 16h6l3-3 2 2 7 1v3H3z',
  pack: 'M8 6a4 4 0 0 1 8 0M6 7h12v13H6zM9 12h6',
  poles: 'M7 3l3 18M17 3l-3 18M6 8h3M15 8h3',
}

function ItemArt({ item }: { item: EquipmentItem }) {
  const { state } = useCareer()
  const { athlete } = state
  if (HAS_ART.has(item.id)) {
    return (
      <Avatar sex={athlete.sex} appearance={{ ...athlete.appearance, outfit: 'none' }} equipment={[item.id]} crop="feet" />
    )
  }
  return (
    <svg viewBox="0 0 24 24" className={styles.icon} aria-hidden="true">
      <path d={ICON_PATHS[item.slot]} />
    </svg>
  )
}

/** Owned equipment (put on or take off) and the shop. Equipment has no effect on races yet. */
export function EquipmentScreen() {
  const { state, setItemEquipped } = useCareer()
  const { athlete } = state
  const [message, setMessage] = useState('')
  const owned = EQUIPMENT_ITEMS.filter((item) => state.ownedEquipment.includes(item.id))
  const forSale = EQUIPMENT_ITEMS.filter((item) => !state.ownedEquipment.includes(item.id))

  return (
    <Screen
      title="Equipment"
      description="Buy gear and choose what your runner wears. Equipped items help in races; they never change training."
    >
      <p className={styles.balance}>{formatCoins(state.coins)}</p>

      <div className={styles.layout}>
        <figure className={styles.preview} role="img" aria-label={`${athlete.name} with the equipment worn`}>
          <Avatar
            sex={athlete.sex}
            appearance={athlete.appearance}
            equipment={state.equipment}
            className={styles.previewArt}
          />
        </figure>

        <div className={styles.columns}>
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
                      <ItemArt item={item} />
                    </span>
                    <span className={styles.itemText}>
                      <strong>{item.label}</strong>
                      <span className={styles.muted}>{item.description}</span>
                      {item.effectText && <span className={styles.effect}>{item.effectText}</span>}
                      <span className={styles.muted}>{equipped ? 'Equipped' : 'Not equipped'}</span>
                    </span>
                    <button
                      type="button"
                      className={`${button.button} ${equipped ? button.secondary : button.primary}`}
                      onClick={() => {
                        const error = setItemEquipped(item.id, !equipped)
                        setMessage(
                          error ? 'That item cannot be changed.' : `${item.label} ${equipped ? 'taken off' : 'equipped'}.`,
                        )
                      }}
                    >
                      {equipped ? 'Take off' : 'Equip'}
                      <span className={styles.srOnly}> {item.label.toLowerCase()}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          {forSale.length > 0 && (
            <section aria-labelledby="shop-title" className={styles.owned}>
              <h2 id="shop-title" className={styles.sectionTitle}>
                Shop
              </h2>
              <ul className={styles.items}>
                {forSale.map((item) => (
                  <ShopItem key={item.id} item={item} onBought={(text) => setMessage(text)} />
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <p role="status" className={styles.muted}>
        {message}
      </p>
    </Screen>
  )
}

/** A shop item: buying needs an explicit confirmation and charges the price once. */
function ShopItem({ item, onBought }: { item: EquipmentItem; onBought(text: string): void }) {
  const { state, buyItem } = useCareer()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const shortfall = Math.max(0, item.price - state.coins)
  const shortfallId = `${item.id}-shortfall`

  return (
    <li className={`${styles.item} ${confirming ? styles.confirming : ''}`}>
      <span className={styles.itemArt}>
        <ItemArt item={item} />
      </span>
      <span className={styles.itemText}>
        <strong>{item.label}</strong>
        <span className={styles.muted}>{item.description}</span>
        {item.effectText && <span className={styles.effect}>{item.effectText}</span>}
        <span className={styles.price}>{formatCoins(item.price)}</span>
        {shortfall > 0 && (
          <span id={shortfallId} className={styles.warning}>
            You need {formatCoins(shortfall)} more.
          </span>
        )}
        {confirming && (
          <span className={styles.muted}>
            Balance {formatCoins(state.coins)} → {formatCoins(state.coins - item.price)}.
          </span>
        )}
        {error && (
          <span role="alert" className={styles.warning}>
            {error}
          </span>
        )}
      </span>
      {confirming ? (
        <span className={styles.confirmActions}>
          <button type="button" className={`${button.button} ${button.secondary}`} onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <button
            type="button"
            className={`${button.button} ${button.primary}`}
            onClick={() => {
              const failure = buyItem(item.id, item.price)
              if (failure) {
                setError(BUY_ERRORS[failure])
                return
              }
              onBought(`${item.label} bought for ${formatCoins(item.price)}.`)
            }}
          >
            Pay {formatCoins(item.price)}
          </button>
        </span>
      ) : (
        <button
          type="button"
          className={`${button.button} ${button.primary}`}
          aria-disabled={shortfall > 0 || undefined}
          aria-describedby={shortfall > 0 ? shortfallId : undefined}
          onClick={() => {
            if (shortfall > 0) return
            setError('')
            setConfirming(true)
          }}
        >
          Buy<span className={styles.srOnly}> {item.label.toLowerCase()}</span>
        </button>
      )}
    </li>
  )
}
