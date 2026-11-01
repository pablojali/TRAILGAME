import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import { Avatar } from '../../components/avatar/Avatar'
import { Coins } from '../../components/Coins'
import button from '../../components/Button.module.css'
import { Screen, ScrollPanel } from '../../components/Screen'
import { Chips, Tabs } from '../../components/Tabs'
import { ATTRIBUTE_LABELS, type AttributeId } from '../../domain/athlete/athlete'
import { formatCoins } from '../../domain/economy/coins'
import { EQUIPMENT_ITEMS, getEquipmentItem, itemName, type EquipmentItem, type EquipmentSlot } from '../../domain/equipment/items'
import { isEquipped, type BuyError, type EquipError } from '../../game-engine/equipment'
import type { ServerError } from '../../repositories/supabase/careerOpsClient'
import styles from './EquipmentScreen.module.css'

const BUY_ERRORS: Record<BuyError | ServerError, string> = {
  'unknown-item': 'That item does not exist.',
  'already-owned': 'You already own this item.',
  'insufficient-coins': 'You do not have enough coins for this item.',
  'price-changed': 'The price changed. Check it and try again.',
  'not-for-sale': 'This item is not for sale yet.',
  offline: 'Could not reach the server, so nothing was bought or charged. Check your connection and try again.',
  'server-error': 'The server could not complete the purchase, so nothing was bought or charged. Try again.',
}

const EQUIP_ERRORS: Record<EquipError | ServerError, string> = {
  'unknown-item': 'That item does not exist.',
  'not-owned': 'You do not own that item.',
  offline: 'Could not reach the server, so your equipment did not change. Check your connection and try again.',
  'server-error': 'The server could not change your equipment. Try again.',
}

/** Shown wherever a value of an item is not defined yet (gels and cereal bars). */
const TO_BE_DEFINED = 'To be defined'

/** Item pictures: shoes are shown on the avatar's feet; the others use an icon until they have art. */
const ICON_PATHS: Record<EquipmentSlot, string> = {
  shoes: 'M3 16h6l3-3 2 2 7 1v3H3z',
  pack: 'M8 6a4 4 0 0 1 8 0M6 7h12v13H6zM9 12h6',
  poles: 'M7 3l3 18M17 3l-3 18M6 8h3M15 8h3',
  // Placeholders until there is art (owner request, 1 November 2026).
  gel: 'M9 2h6l-1 4v13a2 2 0 0 1-2 2 2 2 0 0 1-2-2V6zM10 10h4',
  bar: 'M3 9h18v6H3zM7 9v6M11 9v6M15 9v6',
}

const SLOTS: readonly { id: EquipmentSlot; label: string }[] = [
  { id: 'shoes', label: 'Shoes' },
  { id: 'poles', label: 'Poles' },
  { id: 'pack', label: 'Backpack' },
  { id: 'gel', label: 'Gels' },
  { id: 'bar', label: 'Cereal bars' },
]

const SLOT_LABELS = Object.fromEntries(SLOTS.map((s) => [s.id, s.label])) as Record<EquipmentSlot, string>

type ShopFilter = EquipmentSlot | 'all'

const SHOP_FILTERS: readonly { id: ShopFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'shoes', label: 'Shoes' },
  { id: 'poles', label: 'Poles' },
  { id: 'pack', label: 'Backpack' },
  { id: 'gel', label: 'Gels' },
  { id: 'bar', label: 'Bars' },
]

type EquipmentTab = 'equipped' | 'shop'

function isShopFilter(value: unknown): value is ShopFilter {
  return SHOP_FILTERS.some((filter) => filter.id === value)
}

function SlotIcon({ slot, className }: { slot: EquipmentSlot; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${styles.icon} ${className ?? ''}`} aria-hidden="true">
      <path d={ICON_PATHS[slot]} />
    </svg>
  )
}

function ItemArt({ item }: { item: EquipmentItem }) {
  const { state } = useCareer()
  const { athlete } = state
  if (item.slot === 'shoes') {
    return (
      <Avatar sex={athlete.sex} appearance={{ ...athlete.appearance, outfit: 'none' }} equipment={[item.id]} crop="feet" />
    )
  }
  return <SlotIcon slot={item.slot} />
}

/** The attribute bonuses of an item, from its race effect (e.g. "Climbing +2"). */
function bonuses(item: EquipmentItem): string[] {
  return Object.entries(item.raceEffect?.attributes ?? {}).map(
    ([id, value]) => `${ATTRIBUTE_LABELS[id as AttributeId]} +${value}`,
  )
}

/** What the item does in races, in words; "To be defined" for items without defined effects. */
function effectText(item: EquipmentItem): string {
  if (item.effectText) return item.effectText.replace(/^Races: /, '')
  return item.price === null ? TO_BE_DEFINED : 'No race effect'
}

/**
 * Equipment in two tabs (owner requests, 30 October and 1 November 2026): Equipped (the runner and
 * one card per slot, gels and cereal bars included) and Shop (collectible-style cards, each opening
 * a large card with its details). The tab, filter and open card are kept in the URL
 * (`?tab=shop&slot=poles&item=poles-2`).
 */
export function EquipmentScreen() {
  const { state } = useCareer()
  const [params, setParams] = useSearchParams()
  const [message, setMessage] = useState('')
  const tab: EquipmentTab = params.get('tab') === 'shop' ? 'shop' : 'equipped'
  const askedFilter = params.get('slot')
  const filter: ShopFilter = isShopFilter(askedFilter) ? askedFilter : 'all'
  const openItem = getEquipmentItem(params.get('item') ?? '')

  function show(nextTab: EquipmentTab, nextFilter: ShopFilter = filter, item?: string) {
    if (nextTab === 'equipped') return setParams({}, { replace: true })
    const next: Record<string, string> = { tab: 'shop' }
    if (nextFilter !== 'all') next.slot = nextFilter
    if (item) next.item = item
    setParams(next, { replace: true })
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
          <EquippedTab onMessage={setMessage} onShop={(slot) => show('shop', slot)} />
        ) : openItem ? (
          <ItemDetail item={openItem} onBack={() => show('shop', filter)} onMessage={setMessage} />
        ) : (
          <ShopTab filter={filter} onFilter={(next) => show('shop', next)} onOpen={(id) => show('shop', filter, id)} />
        )}
      </Tabs>

      <p role="status" className={styles.status}>
        {message}
      </p>
    </Screen>
  )
}

/** The runner wearing the equipment, then one card per slot, one under the other. */
function EquippedTab({ onMessage, onShop }: { onMessage(text: string): void; onShop(slot: EquipmentSlot): void }) {
  const { state } = useCareer()
  const { athlete } = state

  return (
    <>
      <div className={styles.previewArea}>
        <figure className={styles.preview} role="img" aria-label={`${athlete.name} with the equipment worn`}>
          <Avatar sex={athlete.sex} appearance={athlete.appearance} equipment={state.equipment} className={styles.previewArt} />
        </figure>
        <Link to="/appearance" className={`${button.button} ${button.secondary} ${styles.lookButton}`}>
          Change look
        </Link>
      </div>

      <ScrollPanel label="Equipped items">
        <ul className={styles.slots}>
          {SLOTS.map(({ id, label }) => (
            <SlotCard key={id} slot={id} label={label} onMessage={onMessage} onShop={onShop} />
          ))}
        </ul>
      </ScrollPanel>
    </>
  )
}

/** One slot as a card: the worn item (picture, name, level, effect) or Empty, with Change or Shop. */
function SlotCard({
  slot,
  label,
  onMessage,
  onShop,
}: {
  slot: EquipmentSlot
  label: string
  onMessage(text: string): void
  onShop(slot: EquipmentSlot): void
}) {
  const { state, setItemEquipped } = useCareer()
  const [open, setOpen] = useState(false)
  // One equipment change at a time: the server confirms each before the next.
  const [changing, setChanging] = useState<string | null>(null)
  const pending = useRef(false)
  const worn = EQUIPMENT_ITEMS.find((item) => item.slot === slot && isEquipped(state, item.id))
  const owned = EQUIPMENT_ITEMS.filter((item) => item.slot === slot && state.ownedEquipment.includes(item.id))
  const forSale = EQUIPMENT_ITEMS.some((item) => item.slot === slot && item.price !== null)

  return (
    <li className={`${styles.slot} ${worn ? styles.slotWorn : ''}`}>
      <div className={styles.slotRow}>
        <span className={styles.thumb}>{worn ? <ItemArt item={worn} /> : <SlotIcon slot={slot} className={styles.iconEmpty} />}</span>
        <span className={styles.slotItem}>
          <span className={styles.slotLabel}>{label}</span>
          <span className={styles.slotName}>
            <strong>{worn ? worn.label : 'Empty'}</strong>
            {worn?.level !== undefined && <span className={styles.levelBadge}>Lvl {worn.level}</span>}
          </span>
          <span className={worn ? styles.effect : styles.muted}>
            {worn
              ? effectText(worn)
              : owned.length
                ? 'Put on an item you own'
                : forSale
                  ? 'Buy one in the Shop'
                  : 'Not in the Shop yet'}
          </span>
        </span>
        {owned.length > 0 ? (
          <button type="button" className={styles.slotAction} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Done' : 'Change'}
            <span className={styles.srOnly}> {label.toLowerCase()}</span>
          </button>
        ) : (
          <button type="button" className={styles.slotAction} onClick={() => onShop(slot)}>
            Shop<span className={styles.srOnly}> {label.toLowerCase()}</span>
          </button>
        )}
      </div>
      {open && (
        <ul className={styles.choices}>
          {owned.map((item) => {
            const equipped = isEquipped(state, item.id)
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`${styles.choice} ${equipped ? styles.choiceOn : ''}`}
                  aria-disabled={changing !== null || undefined}
                  onClick={async () => {
                    if (pending.current) return
                    pending.current = true
                    setChanging(item.id)
                    const error = await setItemEquipped(item.id, !equipped)
                    pending.current = false
                    setChanging(null)
                    onMessage(error ? EQUIP_ERRORS[error] : `${itemName(item)} ${equipped ? 'taken off' : 'equipped'}.`)
                  }}
                >
                  {changing === item.id ? 'Saving…' : `${equipped ? 'Take off' : 'Equip'} ${itemName(item).toLowerCase()}`}
                </button>
              </li>
            )
          })}
          <li>
            <button type="button" className={styles.choice} onClick={() => onShop(slot)}>
              Shop for {label.toLowerCase()}
            </button>
          </li>
        </ul>
      )}
    </li>
  )
}

/** The status at the bottom of a shop card: owned, worn, price or what is missing. */
function shopStatus(item: EquipmentItem, coins: number, owned: boolean, worn: boolean): { text: string; tone: string } {
  if (worn) return { text: 'Equipped', tone: styles.statusWorn! }
  if (owned) return { text: 'Owned', tone: styles.statusOwned! }
  if (item.price === null) return { text: 'Not for sale yet', tone: styles.statusPending! }
  if (item.price > coins) return { text: `Need ${formatCoins(item.price - coins)} more`, tone: styles.statusShort! }
  return { text: 'Buy', tone: styles.statusBuy! }
}

/** Every item as a collectible card, filtered by type; a card opens its large view. */
function ShopTab({
  filter,
  onFilter,
  onOpen,
}: {
  filter: ShopFilter
  onFilter(filter: ShopFilter): void
  onOpen(itemId: string): void
}) {
  const { state } = useCareer()
  const items = EQUIPMENT_ITEMS.filter((item) => filter === 'all' || item.slot === filter)
  return (
    <>
      {/* One row of filters that scrolls sideways on narrow phones. */}
      <div className={styles.filters}>
        <Chips label="Item type" options={SHOP_FILTERS} value={filter} onChange={onFilter} />
      </div>
      <ScrollPanel label="Shop items">
        <ul className={styles.cardGrid}>
          {items.map((item) => {
            const owned = state.ownedEquipment.includes(item.id)
            const worn = isEquipped(state, item.id)
            const status = shopStatus(item, state.coins, owned, worn)
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.card}
                  aria-label={`${itemName(item)}, ${item.price === null ? `price ${TO_BE_DEFINED.toLowerCase()}` : item.price === 0 ? 'free' : formatCoins(item.price)}, ${status.text}`}
                  onClick={() => onOpen(item.id)}
                >
                  <span className={styles.cardTop}>
                    {item.level !== undefined ? <span className={styles.cardLevel}>Lvl {item.level}</span> : <span />}
                    <span className={styles.cardType}>{SLOT_LABELS[item.slot]}</span>
                  </span>
                  <span className={styles.cardName}>{item.label}</span>
                  <span className={styles.cardArt}>
                    <ItemArt item={item} />
                  </span>
                  <span className={styles.cardValues}>
                    {bonuses(item).length ? bonuses(item).join(' · ') : item.price === null ? `Effects: ${TO_BE_DEFINED.toLowerCase()}` : 'No attribute bonus'}
                  </span>
                  <span className={styles.cardPrice}>
                    {item.price === null ? TO_BE_DEFINED : item.price === 0 ? 'Free' : <Coins amount={item.price} />}
                  </span>
                  <span className={`${styles.cardStatus} ${status.tone}`}>{status.text}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </ScrollPanel>
    </>
  )
}

/** The large card of an item: picture, name, type, level, bonuses, price and its actions. */
function ItemDetail({ item, onBack, onMessage }: { item: EquipmentItem; onBack(): void; onMessage(text: string): void }) {
  const { state, buyItem, setItemEquipped } = useCareer()
  const heading = useRef<HTMLHeadingElement>(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  // Purchases and equipment changes wait for the server; a second tap meanwhile does nothing.
  const [busy, setBusy] = useState<'paying' | 'equipping' | null>(null)
  const pending = useRef(false)
  const owned = state.ownedEquipment.includes(item.id)
  const worn = isEquipped(state, item.id)
  const price = item.price
  const shortfall = price === null ? 0 : Math.max(0, price - state.coins)
  const shortfallId = `${item.id}-shortfall`

  useEffect(() => heading.current?.focus(), [])

  async function run(kind: 'paying' | 'equipping', action: () => Promise<string | null>) {
    if (pending.current) return
    pending.current = true
    setBusy(kind)
    setError('')
    const failure = await action()
    pending.current = false
    setBusy(null)
    if (failure) setError(failure)
  }

  return (
    <article className={styles.detail} aria-labelledby="item-detail-title">
      <button type="button" className={styles.back} onClick={onBack}>
        ← Back to shop
      </button>
      <div className={styles.bigCard}>
        <span className={styles.cardTop}>
          {item.level !== undefined ? <span className={styles.cardLevel}>Lvl {item.level}</span> : <span />}
          <span className={styles.cardType}>{SLOT_LABELS[item.slot]}</span>
        </span>
        <h2 id="item-detail-title" ref={heading} tabIndex={-1} className={styles.bigName}>
          {item.label}
        </h2>
        <span className={styles.bigArt}>
          <ItemArt item={item} />
        </span>
        <dl className={styles.facts}>
          <div>
            <dt>Type</dt>
            <dd>{SLOT_LABELS[item.slot]}</dd>
          </div>
          <div>
            <dt>Level</dt>
            <dd>{item.level ?? (item.price === null ? TO_BE_DEFINED : '—')}</dd>
          </div>
          <div>
            <dt>Race effect</dt>
            <dd className={item.effectText ? styles.effect : undefined}>{effectText(item)}</dd>
          </div>
          <div>
            <dt>Price</dt>
            <dd>{price === null ? TO_BE_DEFINED : price === 0 ? 'Free' : <Coins amount={price} />}</dd>
          </div>
        </dl>
        <p className={styles.muted}>{item.description}</p>
      </div>

      {shortfall > 0 && !owned && (
        <p id={shortfallId} className={styles.warning}>
          You need {formatCoins(shortfall)} more.
        </p>
      )}
      {confirming && price !== null && (
        <p className={styles.muted}>
          Balance {formatCoins(state.coins)} → {formatCoins(state.coins - price)}.
        </p>
      )}
      {error && (
        <p role="alert" className={styles.warning}>
          {error}
        </p>
      )}

      <div className={styles.detailActions}>
        {owned ? (
          <button
            type="button"
            className={`${button.button} ${button.primary}`}
            aria-disabled={busy !== null || undefined}
            onClick={() =>
              run('equipping', async () => {
                const failure = await setItemEquipped(item.id, !worn)
                if (failure) return EQUIP_ERRORS[failure]
                onMessage(`${itemName(item)} ${worn ? 'taken off' : 'equipped'}.`)
                return null
              })
            }
          >
            {busy === 'equipping' ? 'Saving…' : worn ? 'Take off' : 'Equip'}
            <span className={styles.srOnly}> {itemName(item).toLowerCase()}</span>
          </button>
        ) : price === null ? (
          <p className={styles.muted}>Not for sale yet.</p>
        ) : confirming ? (
          <>
            <button
              type="button"
              className={`${button.button} ${button.secondary}`}
              aria-disabled={busy !== null || undefined}
              onClick={() => busy === null && setConfirming(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${button.button} ${button.primary}`}
              aria-disabled={busy !== null || undefined}
              onClick={() =>
                run('paying', async () => {
                  const failure = await buyItem(item.id, price)
                  if (failure) return BUY_ERRORS[failure]
                  setConfirming(false)
                  onMessage(`${itemName(item)} bought for ${formatCoins(price)}.`)
                  return null
                })
              }
            >
              {busy === 'paying' ? 'Paying…' : `Pay ${formatCoins(price)}`}
            </button>
          </>
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
      </div>
    </article>
  )
}
