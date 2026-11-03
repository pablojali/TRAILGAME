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
import {
  EQUIPMENT_ITEMS,
  getEquipmentItem,
  consumableKinds,
  isConsumable,
  itemName,
  type EquipmentItem,
  type EquipmentSlot,
} from '../../domain/equipment/items'
import { isEquipped, type BuyError, type EquipError } from '../../game-engine/equipment'
import type { GameState } from '../../game-engine/gameState'
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
  consumable: 'Gels and cereal bars are not worn: choose them before a race.',
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
  // Gels and bars together (owner decision, 3 November 2026): a gel beside a bar.
  nutrition: 'M5 3h4l-1 3v10a2 2 0 0 1-4 0V6zM12 11h9v5h-9zM15 11v5M18 11v5',
}

/**
 * In the owner's order (1 November 2026): gels and bars (one box since 3 November 2026), shoes,
 * backpack, poles.
 */
const SLOTS: readonly { id: EquipmentSlot; label: string }[] = [
  { id: 'nutrition', label: 'Gels & bars' },
  { id: 'shoes', label: 'Shoes' },
  { id: 'pack', label: 'Backpack' },
  { id: 'poles', label: 'Poles' },
]

const SLOT_LABELS: Record<EquipmentSlot, string> = {
  ...(Object.fromEntries(SLOTS.map((s) => [s.id, s.label])) as Record<EquipmentSlot, string>),
  gel: 'Gels',
  bar: 'Cereal bars',
}

/** The box or shop filter an item is under: gel, bar and gels-and-bars packs are all under Gels & bars. */
function boxOf(item: EquipmentItem): EquipmentSlot {
  return isConsumable(item) ? 'nutrition' : item.slot
}

function inSlot(item: EquipmentItem, slot: EquipmentSlot): boolean {
  return boxOf(item) === slot
}

/** Where an item sorts: gels and bars first. */
function slotOrder(item: EquipmentItem): number {
  return SLOTS.findIndex((s) => s.id === boxOf(item))
}

type ShopFilter = EquipmentSlot | 'all'

const SHOP_FILTERS: readonly { id: ShopFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'nutrition', label: 'Gels & bars' },
  { id: 'shoes', label: 'Shoes' },
  { id: 'pack', label: 'Backpack' },
  { id: 'poles', label: 'Poles' },
]

/** Items in the slot order above, then in catalog order. */
const ITEMS_IN_ORDER: readonly EquipmentItem[] = [...EQUIPMENT_ITEMS].sort(
  (a, b) => slotOrder(a) - slotOrder(b),
)

type EquipmentTab = 'equipped' | 'shop'

function isSlot(value: unknown): value is EquipmentSlot {
  return SLOTS.some((slot) => slot.id === value)
}

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

/** Pictures named in the equipment table's thumbnail column (assets/ui/equipment). */
const THUMBNAILS = import.meta.glob<string>('/assets/ui/equipment/*.{webp,png,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

function ItemArt({ item }: { item: EquipmentItem }) {
  const { state } = useCareer()
  const { athlete } = state
  const thumbnail = item.thumbnail && THUMBNAILS[`/assets/ui/equipment/${item.thumbnail}`]
  if (thumbnail) return <img className={styles.thumbnail} src={thumbnail} alt="" />
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

/** Units in stock of a consumable, e.g. "2 in stock". */
function stockText(count: number): string {
  return `${count} in stock`
}

/** The stock a consumable pack refills: "2 in stock", or "2 gels, 1 bar in stock" for gels and bars. */
function itemStockText(item: EquipmentItem, consumables: GameState['consumables']): string {
  const kinds = consumableKinds(item)
  if (kinds.length === 1) return stockText(consumables[kinds[0]!])
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
  return `${plural(consumables.gel, 'gel')}, ${plural(consumables.bar, 'bar')} in stock`
}

/** What the item does in races, in words; "To be defined" for items without defined effects. */
function effectText(item: EquipmentItem): string {
  if (item.effectText) return item.effectText.replace(/^Races: /, '')
  return item.price === null ? TO_BE_DEFINED : 'No race effect'
}

/**
 * Equipment in two tabs (owner requests, 30 October and 1 November 2026): Equipped (the runner large
 * on the left, one box per slot on the right; a box opens the cards of that slot) and Shop
 * (collectible-style cards). Any card opens a large card with its details and actions. The tab,
 * slot and open card are kept in the URL (`?slot=poles&item=poles-2`, `?tab=shop&slot=poles`).
 */
export function EquipmentScreen() {
  const [params, setParams] = useSearchParams()
  const [message, setMessage] = useState('')
  const tab: EquipmentTab = params.get('tab') === 'shop' ? 'shop' : 'equipped'
  const askedFilter = params.get('slot')
  const filter: ShopFilter = isShopFilter(askedFilter) ? askedFilter : 'all'
  const openItem = getEquipmentItem(params.get('item') ?? '')
  const equippedSlot = tab === 'equipped' && isSlot(askedFilter) ? askedFilter : null

  function show(nextTab: EquipmentTab, nextFilter: ShopFilter = filter, item?: string) {
    if (nextTab === 'equipped') return setParams({}, { replace: true })
    const next: Record<string, string> = { tab: 'shop' }
    if (nextFilter !== 'all') next.slot = nextFilter
    if (item) next.item = item
    setParams(next, { replace: true })
  }

  /** Equipped tab: the runner and slot boxes, a slot's cards, or one card of it. */
  function showEquipped(slot: EquipmentSlot | null, item?: string) {
    setParams(slot ? { slot, ...(item ? { item } : {}) } : {}, { replace: true })
  }

  return (
    <Screen
      title="Equipment"
      description="Buy gear and choose what your runner wears. Equipped items help in races; they never change training."
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
          equippedSlot && openItem ? (
            <ItemDetail
              item={openItem}
              backLabel={SLOT_LABELS[equippedSlot]}
              onBack={() => showEquipped(equippedSlot)}
              onMessage={setMessage}
            />
          ) : equippedSlot ? (
            <SlotCards slot={equippedSlot} onBack={() => showEquipped(null)} onOpen={(id) => showEquipped(equippedSlot, id)} />
          ) : (
            <EquippedTab onOpen={(slot) => showEquipped(slot)} />
          )
        ) : openItem ? (
          <ItemDetail item={openItem} backLabel="Back to shop" onBack={() => show('shop', filter)} onMessage={setMessage} />
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

/**
 * The runner large on the left, one box per slot in a column on the right (owner request,
 * 1 November 2026). A box shows what is worn in that slot and opens the slot's cards.
 */
function EquippedTab({ onOpen }: { onOpen(slot: EquipmentSlot): void }) {
  const { state } = useCareer()
  const { athlete } = state

  return (
    <div className={styles.equippedLayout}>
      <div className={styles.previewArea}>
        <figure className={styles.preview} role="img" aria-label={`${athlete.name} with the equipment worn`}>
          <Avatar sex={athlete.sex} appearance={athlete.appearance} equipment={state.equipment} className={styles.previewArt} />
        </figure>
        <Link to="/appearance" className={`${button.button} ${button.secondary} ${styles.lookButton}`}>
          Change look
        </Link>
      </div>

      <ul className={styles.slotBoxes} aria-label="Equipped items">
        {SLOTS.map(({ id, label }) => {
          if (id === 'nutrition') {
            // Gels and cereal bars are counted, not worn: the box shows the stock of each.
            const { gel, bar } = state.consumables
            const pack = EQUIPMENT_ITEMS.find((item) => inSlot(item, 'nutrition') && item.thumbnail)
            const stocked = gel + bar > 0
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`${styles.slotBox} ${stocked ? styles.slotWorn : ''}`}
                  aria-label={`${label}: ${gel} ${gel === 1 ? 'gel' : 'gels'}, ${bar} ${bar === 1 ? 'bar' : 'bars'} in stock. Show gels and bars cards`}
                  onClick={() => onOpen(id)}
                >
                  <span className={`${styles.boxArt} ${stocked ? '' : styles.iconEmpty}`}>
                    {pack ? <ItemArt item={pack} /> : <SlotIcon slot={id} />}
                  </span>
                  <span className={styles.slotLabel}>{label}</span>
                  <span className={styles.boxName}>
                    <span>Gels ×{gel}</span>
                    <span>Bars ×{bar}</span>
                  </span>
                </button>
              </li>
            )
          }
          const worn = EQUIPMENT_ITEMS.find((item) => item.slot === id && isEquipped(state, item.id))
          return (
            <li key={id}>
              <button
                type="button"
                className={`${styles.slotBox} ${worn ? styles.slotWorn : ''}`}
                aria-label={`${label}: ${worn ? itemName(worn) : 'empty'}. Show ${label.toLowerCase()} cards`}
                onClick={() => onOpen(id)}
              >
                <span className={styles.boxArt}>
                  {worn ? <ItemArt item={worn} /> : <SlotIcon slot={id} className={styles.iconEmpty} />}
                </span>
                <span className={styles.slotLabel}>{label}</span>
                <span className={styles.boxName}>
                  {worn ? worn.label : 'Empty'}
                  {worn?.level !== undefined && <span className={styles.levelBadge}>Lvl {worn.level}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The cards of one slot (every item of that type, owned or not); a card opens its large card. */
function SlotCards({ slot, onBack, onOpen }: { slot: EquipmentSlot; onBack(): void; onOpen(itemId: string): void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  return (
    <>
      <div className={styles.sheetHeader}>
        <button type="button" className={styles.back} onClick={onBack}>
          ← Equipped
        </button>
        <h2 ref={heading} tabIndex={-1} className={styles.sheetTitle}>
          {SLOT_LABELS[slot]}
        </h2>
      </div>
      <ScrollPanel label={`${SLOT_LABELS[slot]} cards`}>
        <ul className={styles.cardGrid}>
          {EQUIPMENT_ITEMS.filter((item) => inSlot(item, slot)).map((item) => (
            <li key={item.id}>
              <ItemCard item={item} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      </ScrollPanel>
    </>
  )
}

/** The status at the bottom of a shop card: owned, worn, price or what is missing. */
function shopStatus(item: EquipmentItem, coins: number, owned: boolean, worn: boolean): { text: string; tone: string } {
  if (isConsumable(item)) {
    const short = item.price === null ? 0 : item.price - coins
    if (short > 0) return { text: `Need ${formatCoins(short)} more`, tone: styles.statusShort! }
    return { text: `Buy pack of ${item.packSize}`, tone: styles.statusBuy! }
  }
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
  const items = ITEMS_IN_ORDER.filter((item) => filter === 'all' || inSlot(item, filter))
  return (
    <>
      {/* One row of filters that scrolls sideways on narrow phones. */}
      <div className={styles.filters}>
        <Chips label="Item type" options={SHOP_FILTERS} value={filter} onChange={onFilter} />
      </div>
      <ScrollPanel label="Shop items">
        <ul className={styles.cardGrid}>
          {items.map((item) => (
            <li key={item.id}>
              <ItemCard item={item} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      </ScrollPanel>
    </>
  )
}

/** A collectible-style card: level, type, name, picture, bonuses, price and a status bar. */
function ItemCard({ item, onOpen }: { item: EquipmentItem; onOpen(itemId: string): void }) {
  const { state } = useCareer()
  const owned = state.ownedEquipment.includes(item.id)
  const worn = isEquipped(state, item.id)
  const status = shopStatus(item, state.coins, owned, worn)
  return (
    <button
      type="button"
      className={styles.card}
      aria-label={`${itemName(item)}, ${item.price === null ? `price ${TO_BE_DEFINED.toLowerCase()}` : item.price === 0 ? 'free' : formatCoins(item.price)}${isConsumable(item) ? `, ${itemStockText(item, state.consumables)}` : ''}, ${status.text}`}
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
        {isConsumable(item)
          ? `${effectText(item).replace(/ Used up by the race\.$/, '')} · ${itemStockText(item, state.consumables)}`
          : bonuses(item).length
            ? bonuses(item).join(' · ')
            : item.price === null
              ? `Effects: ${TO_BE_DEFINED.toLowerCase()}`
              : 'No attribute bonus'}
      </span>
      <span className={styles.cardPrice}>
        {item.price === null ? TO_BE_DEFINED : item.price === 0 ? 'Free' : <Coins amount={item.price} />}
      </span>
      <span className={`${styles.cardStatus} ${status.tone}`}>{status.text}</span>
    </button>
  )
}

/** The large card of an item: picture, name, type, level, bonuses, price and its actions. */
function ItemDetail({
  item,
  backLabel,
  onBack,
  onMessage,
}: {
  item: EquipmentItem
  /** Where Back goes: the shop, or the slot's cards in Equipped. */
  backLabel: string
  onBack(): void
  onMessage(text: string): void
}) {
  const { state, buyItem, setItemEquipped } = useCareer()
  const heading = useRef<HTMLHeadingElement>(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  // Purchases and equipment changes wait for the server; a second tap meanwhile does nothing.
  const [busy, setBusy] = useState<'paying' | 'equipping' | null>(null)
  const pending = useRef(false)
  const consumable = isConsumable(item)
  const stock = consumable ? itemStockText(item, state.consumables).replace(/ in stock$/, '') : ''
  const owned = !consumable && state.ownedEquipment.includes(item.id)
  const worn = isEquipped(state, item.id)
  const price = item.price
  const what = consumable ? `${item.label} pack of ${item.packSize}` : itemName(item)
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
        ← {backLabel}
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
          {consumable && (
            <>
              <div>
                <dt>Pack</dt>
                <dd>{item.slot === 'nutrition' ? `${item.packSize} gels + ${item.packSize} bars` : `${item.packSize} units`}</dd>
              </div>
              <div>
                <dt>In stock</dt>
                <dd>{stock}</dd>
              </div>
            </>
          )}
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
                  onMessage(`${what} bought for ${formatCoins(price)}.`)
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
            {consumable ? `Buy pack of ${item.packSize}` : 'Buy'}
            <span className={styles.srOnly}> {(consumable ? item.label : itemName(item)).toLowerCase()}</span>
          </button>
        )}
      </div>
    </article>
  )
}
