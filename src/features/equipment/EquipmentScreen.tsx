import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import { Avatar } from '../../components/avatar/Avatar'
import { Coins } from '../../components/Coins'
import { RadarChart, radarScale } from '../../components/RadarChart'
import { ATTRIBUTE_IDS, ATTRIBUTE_LABELS } from '../../domain/athlete/athlete'
import button from '../../components/Button.module.css'
import { Screen, ScrollPanel } from '../../components/Screen'
import { Chips, Tabs } from '../../components/Tabs'
import { formatCoins } from '../../domain/economy/coins'
import { EQUIPMENT_ITEMS, getRaceEffect, itemName, type EquipmentItem, type EquipmentSlot } from '../../domain/equipment/items'
import { isEquipped, type BuyError } from '../../game-engine/equipment'
import styles from './EquipmentScreen.module.css'

const BUY_ERRORS: Record<BuyError, string> = {
  'unknown-item': 'That item does not exist.',
  'already-owned': 'You already own this item.',
  'insufficient-coins': 'You do not have enough coins for this item.',
  'price-changed': 'The price changed. Check it and try again.',
}

/** Shoes are shown on the avatar's feet; other items show an icon until they have their own art. */
const ICON_PATHS: Record<EquipmentSlot, string> = {
  shoes: 'M3 16h6l3-3 2 2 7 1v3H3z',
  pack: 'M8 6a4 4 0 0 1 8 0M6 7h12v13H6zM9 12h6',
  poles: 'M7 3l3 18M17 3l-3 18M6 8h3M15 8h3',
}

function ItemArt({ item }: { item: EquipmentItem }) {
  const { state } = useCareer()
  const { athlete } = state
  if (item.slot === 'shoes') {
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

function SlotIcon({ slot }: { slot: EquipmentSlot }) {
  return (
    <svg viewBox="0 0 24 24" className={`${styles.icon} ${styles.iconEmpty}`} aria-hidden="true">
      <path d={ICON_PATHS[slot]} />
    </svg>
  )
}

const SLOTS: readonly { id: EquipmentSlot; label: string }[] = [
  { id: 'shoes', label: 'Shoes' },
  { id: 'poles', label: 'Poles' },
  { id: 'pack', label: 'Backpack' },
]

type EquipmentTab = 'equipped' | 'shop'

function isSlot(value: unknown): value is EquipmentSlot {
  return SLOTS.some((slot) => slot.id === value)
}

/**
 * Equipment in two tabs so it fits one screen (owner request, 30 October 2026): Equipped (the
 * runner, then one row per slot to put an owned item on or take it off) and Shop (filtered by
 * slot). The tab and slot are kept in the URL (`?tab=shop&slot=poles`).
 */
export function EquipmentScreen() {
  const { state } = useCareer()
  const [params, setParams] = useSearchParams()
  const [message, setMessage] = useState('')
  const tab: EquipmentTab = params.get('tab') === 'shop' ? 'shop' : 'equipped'
  const askedSlot = params.get('slot')
  const slot: EquipmentSlot = isSlot(askedSlot) ? askedSlot : 'shoes'

  function show(nextTab: EquipmentTab, nextSlot: EquipmentSlot = slot) {
    setParams(nextTab === 'shop' ? { tab: 'shop', slot: nextSlot } : {}, { replace: true })
  }

  return (
    <Screen
      title="Equipment"
      description="Buy gear and choose what your runner wears. Equipped items help in races; they never change training."
      aside={
        <p className={styles.balance}>
          <span className={styles.balanceLabel}>Balance</span> <Coins amount={state.coins} />
        </p>
      }
    >
      <Tabs
        label="Equipment"
        tabs={[
          { id: 'equipped', label: 'Equipped' },
          { id: 'shop', label: 'Shop' },
        ]}
        value={tab}
        onChange={(next) => show(next)}
      >
        {tab === 'equipped' ? (
          <EquippedTab onMessage={setMessage} onShop={(nextSlot) => show('shop', nextSlot)} />
        ) : (
          <ShopTab slot={slot} onSlot={(nextSlot) => show('shop', nextSlot)} onMessage={setMessage} />
        )}
      </Tabs>

      <p role="status" className={styles.status}>
        {message}
      </p>
    </Screen>
  )
}

/** The runner wearing the equipment, then one row per slot. */
function EquippedTab({ onMessage, onShop }: { onMessage(text: string): void; onShop(slot: EquipmentSlot): void }) {
  const { state, setItemEquipped } = useCareer()
  const { athlete } = state
  const [open, setOpen] = useState<EquipmentSlot | null>(null)
  // Race attributes with the worn equipment's bonuses, drawn as a chart beside the runner.
  const bonus = getRaceEffect(state.equipment).attributes
  const raceAttributes = ATTRIBUTE_IDS.map((id) => ({ id, label: ATTRIBUTE_LABELS[id], value: athlete.attributes[id] + bonus[id] }))
  const radarMax = radarScale(raceAttributes.map((a) => a.value))

  return (
    <>
      <div className={styles.previewArea}>
        <figure className={styles.preview} role="img" aria-label={`${athlete.name} with the equipment worn`}>
          <Avatar sex={athlete.sex} appearance={athlete.appearance} equipment={state.equipment} className={styles.previewArt} />
        </figure>
        <div className={styles.previewSide}>
          <Link to="/appearance" className={`${button.button} ${button.secondary} ${styles.lookButton}`}>
            Change look
          </Link>
          <div className={styles.raceChart}>
            <RadarChart values={raceAttributes} max={radarMax} />
            <p className={styles.chartCaption}>
              Race attributes
              <span className={styles.srOnly}>
                {' '}
                with this equipment: {raceAttributes.map((a) => `${a.label} ${Math.round(a.value * 10) / 10}`).join(', ')}
              </span>
            </p>
          </div>
        </div>
      </div>

      <ul className={styles.slots}>
        {SLOTS.map(({ id, label }) => {
          const worn = EQUIPMENT_ITEMS.find((item) => item.slot === id && isEquipped(state, item.id))
          const owned = EQUIPMENT_ITEMS.filter((item) => item.slot === id && state.ownedEquipment.includes(item.id))
          const expanded = open === id
          return (
            <li key={id} className={`${styles.slot} ${worn ? styles.slotWorn : ''}`}>
              <div className={styles.slotRow}>
                <span className={styles.thumb}>{worn ? <ItemArt item={worn} /> : <SlotIcon slot={id} />}</span>
                <span className={styles.slotItem}>
                  <span className={styles.slotLabel}>{label}</span>
                  <strong>{worn ? itemName(worn) : 'Empty'}</strong>
                  <span className={worn ? styles.effect : styles.muted}>
                    {worn ? worn.effectText?.replace(/^Races: /, '') ?? 'No race effect' : owned.length ? 'Put on an item you own' : 'Buy one in the Shop'}
                  </span>
                </span>
                {owned.length > 0 ? (
                  <button
                    type="button"
                    className={styles.slotAction}
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : id)}
                  >
                    {expanded ? 'Done' : 'Change'}
                    <span className={styles.srOnly}> {label.toLowerCase()}</span>
                  </button>
                ) : (
                  <button type="button" className={styles.slotAction} onClick={() => onShop(id)}>
                    Shop<span className={styles.srOnly}> {label.toLowerCase()}</span>
                  </button>
                )}
              </div>
              {expanded && (
                <ul className={styles.choices}>
                  {owned.map((item) => {
                    const equipped = isEquipped(state, item.id)
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={`${styles.choice} ${equipped ? styles.choiceOn : ''}`}
                          onClick={() => {
                            const error = setItemEquipped(item.id, !equipped)
                            onMessage(error ? 'That item cannot be changed.' : `${itemName(item)} ${equipped ? 'taken off' : 'equipped'}.`)
                          }}
                        >
                          {equipped ? 'Take off' : 'Equip'} {itemName(item).toLowerCase()}
                        </button>
                      </li>
                    )
                  })}
                  <li>
                    <button type="button" className={styles.choice} onClick={() => onShop(id)}>
                      Shop for {label.toLowerCase()}
                    </button>
                  </li>
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

/** Items not owned yet, one slot at a time. */
function ShopTab({
  slot,
  onSlot,
  onMessage,
}: {
  slot: EquipmentSlot
  onSlot(slot: EquipmentSlot): void
  onMessage(text: string): void
}) {
  const { state } = useCareer()
  const forSale = EQUIPMENT_ITEMS.filter((item) => item.slot === slot && !state.ownedEquipment.includes(item.id))
  return (
    <>
      <Chips label="Item type" options={SLOTS} value={slot} onChange={onSlot} />
      {forSale.length === 0 ? (
        <p className={styles.muted}>You own every item of this type. Put them on in Equipped.</p>
      ) : (
        <ScrollPanel label="Items for sale">
          <ul className={styles.items}>
            {forSale.map((item) => (
              <ShopItem key={item.id} item={item} onBought={onMessage} />
            ))}
          </ul>
        </ScrollPanel>
      )}
    </>
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
        <span className={styles.nameRow}>
          <strong>{itemName(item)}</strong>{' '}
          <Coins amount={item.price} className={styles.price} />
        </span>
        <span className={styles.muted}>{item.description}</span>
        {item.effectText && <span className={styles.effect}>{item.effectText}</span>}
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
              onBought(`${itemName(item)} bought for ${formatCoins(item.price)}.`)
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
          Buy<span className={styles.srOnly}> {itemName(item).toLowerCase()}</span>
        </button>
      )}
    </li>
  )
}
