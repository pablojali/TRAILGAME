import { itemDescription, itemDisplayName, itemEffect, itemLabel } from '../../i18n/equipmentText'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import { Avatar } from '../../components/avatar/Avatar'
import { Coins } from '../../components/Coins'
import button from '../../components/Button.module.css'
import { Screen, ScrollPanel } from '../../components/Screen'
import { Chips, Tabs } from '../../components/Tabs'
import type { AttributeId } from '../../domain/athlete/athlete'
import { useI18n, type Locale, type MessageKey, type Translate } from '../../i18n/i18n'
import {
  EQUIPMENT_ITEMS,
  getEquipmentItem,
  consumableKinds,
  isConsumable,
  type EquipmentItem,
  type EquipmentSlot,
} from '../../domain/equipment/items'
import { isEquipped, type BuyError, type EquipError } from '../../game-engine/equipment'
import type { GameState } from '../../game-engine/gameState'
import type { ServerError } from '../../repositories/supabase/careerOpsClient'
import styles from './EquipmentScreen.module.css'

const BUY_ERRORS: Record<BuyError | ServerError, MessageKey> = {
  'unknown-item': 'equipment.buyError.unknown-item',
  'already-owned': 'equipment.buyError.already-owned',
  'insufficient-coins': 'equipment.buyError.insufficient-coins',
  'price-changed': 'equipment.buyError.price-changed',
  'not-for-sale': 'equipment.buyError.not-for-sale',
  offline: 'equipment.buyError.offline',
  'server-error': 'equipment.buyError.server-error',
}

const EQUIP_ERRORS: Record<EquipError | ServerError, MessageKey> = {
  'unknown-item': 'equipment.equipError.unknown-item',
  'not-owned': 'equipment.equipError.not-owned',
  consumable: 'equipment.equipError.consumable',
  offline: 'equipment.equipError.offline',
  'server-error': 'equipment.equipError.server-error',
}

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
const SLOTS: readonly EquipmentSlot[] = ['nutrition', 'shoes', 'pack', 'poles']

const SLOT_LABELS: Record<EquipmentSlot, MessageKey> = {
  nutrition: 'slot.nutrition',
  shoes: 'slot.shoes',
  pack: 'slot.pack',
  poles: 'slot.poles',
  gel: 'slot.gel',
  bar: 'slot.bar',
}

/** The box or shop filter an item is under: gel, bar and gels-and-bars packs are all under Gels & bars. */
function boxOf(item: EquipmentItem): EquipmentSlot {
  return isConsumable(item) ? 'nutrition' : item.slot
}

function inSlot(item: EquipmentItem, slot: EquipmentSlot): boolean {
  return boxOf(item) === slot
}

/** Shop order (owner request, 4 November 2026): shoes, backpack, poles, then gels and bars. */
const SHOP_ORDER: readonly EquipmentSlot[] = ['shoes', 'pack', 'poles', 'nutrition']

function slotOrder(item: EquipmentItem): number {
  return SHOP_ORDER.indexOf(boxOf(item))
}

type ShopFilter = EquipmentSlot | 'all'

const SHOP_FILTERS: readonly ShopFilter[] = ['all', 'shoes', 'pack', 'poles', 'nutrition']

/** Items in the shop order, then in catalog order. */
const ITEMS_IN_ORDER: readonly EquipmentItem[] = [...EQUIPMENT_ITEMS].sort(
  (a, b) => slotOrder(a) - slotOrder(b),
)

type EquipmentTab = 'equipped' | 'shop'

function isSlot(value: unknown): value is EquipmentSlot {
  return SLOTS.includes(value as EquipmentSlot)
}

function isShopFilter(value: unknown): value is ShopFilter {
  return SHOP_FILTERS.includes(value as ShopFilter)
}

function SlotIcon({ slot, className }: { slot: EquipmentSlot; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${styles.icon} ${className ?? ''}`} aria-hidden="true">
      <path d={ICON_PATHS[slot]} />
    </svg>
  )
}

/**
 * Pictures named in the equipment table's thumbnail column: the owner's shop pictures in
 * assets/ui/thumbnails (`thumb_*.png`, 512 × 512; owner request, 4 November 2026), else the ones
 * cut from the avatar art in assets/ui/equipment.
 */
const THUMBNAILS = import.meta.glob<string>('/assets/ui/{thumbnails,equipment}/*.{webp,png,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

function thumbnailUrl(file: string): string | undefined {
  return THUMBNAILS[`/assets/ui/thumbnails/${file}`] ?? THUMBNAILS[`/assets/ui/equipment/${file}`]
}

/** An item's picture: its thumbnail, the shoes on the feet, or the slot icon (also used on race day). */
export function ItemArt({ item }: { item: EquipmentItem }) {
  const { state } = useCareer()
  const { athlete } = state
  const thumbnail = item.thumbnail && thumbnailUrl(item.thumbnail)
  if (thumbnail) return <img className={styles.thumbnail} src={thumbnail} alt="" />
  if (item.slot === 'shoes') {
    return (
      <Avatar sex={athlete.sex} appearance={{ ...athlete.appearance, outfit: 'none' }} equipment={[item.id]} crop="feet" />
    )
  }
  return <SlotIcon slot={item.slot} />
}

/** The attribute bonuses of an item, from its race effect (e.g. "Climbing +2"). */
function bonuses(item: EquipmentItem, t: Translate): string[] {
  return Object.entries(item.raceEffect?.attributes ?? {}).map(([id, value]) => `${t(`attr.${id as AttributeId}`)} +${value}`)
}

/** The stock a consumable pack refills: "2", or "2 gels, 1 bar" for gels and bars. */
function itemStock(item: EquipmentItem, consumables: GameState['consumables'], t: Translate): string {
  const kinds = consumableKinds(item)
  if (kinds.length === 1) return String(consumables[kinds[0]!])
  return t('equipment.gelsBars', { gels: t('equipment.gels', { count: consumables.gel }), bars: t('equipment.bars', { count: consumables.bar }) })
}

/** "2 in stock", or "2 gels, 1 bar in stock" for gels and bars. */
function itemStockText(item: EquipmentItem, consumables: GameState['consumables'], t: Translate): string {
  const kinds = consumableKinds(item)
  if (kinds.length === 1) return t('equipment.inStock', { count: consumables[kinds[0]!] })
  return t('equipment.gelsBarsInStock', { gels: t('equipment.gels', { count: consumables.gel }), bars: t('equipment.bars', { count: consumables.bar }) })
}

/** What the item does in races, in words; "To be defined" for items without defined effects. */
function effectText(item: EquipmentItem, t: Translate, locale: Locale): string {
  const effect = itemEffect(item, locale, t)
  if (effect) return effect
  return item.price === null ? t('equipment.toBeDefined') : t('equipment.noRaceEffect')
}

/** A slot name in lower case inside a sentence (German nouns keep their capital). */
function lowerSlot(label: string, locale: Locale): string {
  return locale === 'de' ? label : label.toLocaleLowerCase(locale)
}

/**
 * Equipment in two tabs (owner requests, 30 October and 1 November 2026): Equipped (the runner large
 * on the left, one box per slot on the right; a box opens the cards of that slot) and Shop
 * (collectible-style cards). Any card opens a large card with its details and actions. The tab,
 * slot and open card are kept in the URL (`?slot=poles&item=poles-2`, `?tab=shop&slot=poles`).
 */
export function EquipmentScreen() {
  const { t } = useI18n()
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
    <Screen title={t('equipment.title')} description={t('equipment.description')}>
      <Tabs
        label={t('equipment.tabs')}
        tabs={[
          { id: 'equipped', label: t('equipment.tab.equipped') },
          { id: 'shop', label: t('equipment.tab.shop') },
        ]}
        value={tab}
        onChange={(next) => show(next)}
      >
        {tab === 'equipped' ? (
          equippedSlot && openItem ? (
            <ItemDetail
              item={openItem}
              backLabel={t(SLOT_LABELS[equippedSlot])}
              onBack={() => showEquipped(equippedSlot)}
              onMessage={setMessage}
            />
          ) : equippedSlot ? (
            <SlotCards slot={equippedSlot} onBack={() => showEquipped(null)} onOpen={(id) => showEquipped(equippedSlot, id)} />
          ) : (
            <EquippedTab onOpen={(slot) => showEquipped(slot)} />
          )
        ) : openItem ? (
          <ItemDetail item={openItem} backLabel={t('equipment.backToShop')} onBack={() => show('shop', filter)} onMessage={setMessage} />
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
  const { t, locale } = useI18n()
  const { athlete } = state

  return (
    <div className={styles.equippedLayout}>
      <div className={styles.previewArea}>
        <figure className={styles.preview} role="img" aria-label={t('equipment.wornBy', { name: athlete.name })}>
          <Avatar sex={athlete.sex} appearance={athlete.appearance} equipment={state.equipment} className={styles.previewArt} />
        </figure>
        <Link to="/appearance" className={`${button.button} ${button.secondary} ${styles.lookButton}`}>
          {t('equipment.changeLook')}
        </Link>
      </div>

      <ul className={styles.slotBoxes} aria-label={t('equipment.equippedItems')}>
        {SLOTS.map((id) => {
          const label = t(SLOT_LABELS[id])
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
                  aria-label={t('equipment.nutritionBox', {
                    slot: label,
                    gels: t('equipment.gels', { count: gel }),
                    bars: t('equipment.bars', { count: bar }),
                  })}
                  onClick={() => onOpen(id)}
                >
                  <span className={`${styles.boxArt} ${stocked ? '' : styles.iconEmpty}`}>
                    {pack ? <ItemArt item={pack} /> : <SlotIcon slot={id} />}
                  </span>
                  <span className={styles.slotLabel}>{label}</span>
                  {/* Stock in the corner, like a level (one number when gels and bars match). */}
                  <span className={styles.cornerBadge} aria-hidden="true">
                    {gel === bar ? `×${gel}` : `×${gel} / ×${bar}`}
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
                aria-label={t('equipment.slotBox', {
                  slot: label,
                  item: worn ? itemDisplayName(worn, locale, t) : t('equipment.empty'),
                  slotLower: lowerSlot(label, locale),
                })}
                onClick={() => onOpen(id)}
              >
                <span className={styles.boxArt}>
                  {worn ? <ItemArt item={worn} /> : <SlotIcon slot={id} className={styles.iconEmpty} />}
                </span>
                <span className={styles.slotLabel}>{label}</span>
                {/* Only the slot name and the level (owner request, 4 November 2026): bigger pictures. */}
                {worn?.level !== undefined && (
                  <span className={styles.cornerBadge} aria-hidden="true">
                    {t('common.lvl', { level: worn.level })}
                  </span>
                )}
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
  const { t } = useI18n()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  return (
    <>
      <div className={styles.sheetHeader}>
        <button type="button" className={styles.back} onClick={onBack}>
          ← {t('equipment.tab.equipped')}
        </button>
        <h2 ref={heading} tabIndex={-1} className={styles.sheetTitle}>
          {t(SLOT_LABELS[slot])}
        </h2>
      </div>
      <ScrollPanel label={t('equipment.slotCards', { slot: t(SLOT_LABELS[slot]) })}>
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
function shopStatus(item: EquipmentItem, coins: number, owned: boolean, worn: boolean, t: Translate): { text: string; tone: string } {
  const need = (short: number) => t('equipment.status.need', { coins: t('common.coins', { count: short }) })
  if (isConsumable(item)) {
    const short = item.price === null ? 0 : item.price - coins
    if (short > 0) return { text: need(short), tone: styles.statusShort! }
    return { text: t('equipment.status.buyPack', { count: item.packSize! }), tone: styles.statusBuy! }
  }
  if (worn) return { text: t('equipment.status.equipped'), tone: styles.statusWorn! }
  if (owned) return { text: t('equipment.status.owned'), tone: styles.statusOwned! }
  if (item.price === null) return { text: t('equipment.status.notForSale'), tone: styles.statusPending! }
  if (item.price > coins) return { text: need(item.price - coins), tone: styles.statusShort! }
  return { text: t('equipment.status.buy'), tone: styles.statusBuy! }
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
  const { t } = useI18n()
  const items = ITEMS_IN_ORDER.filter((item) => filter === 'all' || inSlot(item, filter))
  const options = SHOP_FILTERS.map((id) => ({ id, label: id === 'all' ? t('equipment.filter.all') : t(SLOT_LABELS[id]) }))
  return (
    <>
      {/* One row of filters that scrolls sideways on narrow phones. */}
      <div className={styles.filters}>
        <Chips label={t('equipment.filter.label')} options={options} value={filter} onChange={onFilter} />
      </div>
      <ScrollPanel label={t('equipment.shopItems')}>
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
  const { t, locale } = useI18n()
  const status = shopStatus(item, state.coins, owned, worn, t)
  const priceText =
    item.price === null ? t('equipment.priceToBeDefined') : item.price === 0 ? t('equipment.freeLower') : t('common.coins', { count: item.price })
  const itemBonuses = bonuses(item, t)
  return (
    <button
      type="button"
      className={styles.card}
      aria-label={`${itemDisplayName(item, locale, t)}, ${priceText}${isConsumable(item) ? `, ${itemStockText(item, state.consumables, t)}` : ''}, ${status.text}`}
      onClick={() => onOpen(item.id)}
    >
      <span className={styles.cardTop}>
        {item.level !== undefined ? <span className={styles.cardLevel}>{t('common.lvl', { level: item.level })}</span> : <span />}
        <span className={styles.cardType}>{t(SLOT_LABELS[item.slot])}</span>
      </span>
      <span className={styles.cardName}>{itemLabel(item, locale)}</span>
      <span className={styles.cardArt}>
        <ItemArt item={item} />
      </span>
      <span className={styles.cardValues}>
        {isConsumable(item)
          ? `${effectText(item, t, locale).replace(/ Used up by the race\.$/, '')} · ${itemStockText(item, state.consumables, t)}`
          : itemBonuses.length
            ? itemBonuses.join(' · ')
            : item.price === null
              ? t('equipment.effectsToBeDefined')
              : t('equipment.noAttributeBonus')}
      </span>
      <span className={styles.cardPrice}>
        {item.price === null ? t('equipment.toBeDefined') : item.price === 0 ? t('equipment.free') : <Coins amount={item.price} />}
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
  const { t, locale } = useI18n()
  const coins = (count: number) => t('common.coins', { count })
  const heading = useRef<HTMLHeadingElement>(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  // Purchases and equipment changes wait for the server; a second tap meanwhile does nothing.
  const [busy, setBusy] = useState<'paying' | 'equipping' | null>(null)
  const pending = useRef(false)
  const consumable = isConsumable(item)
  const stock = consumable ? itemStock(item, state.consumables, t) : ''
  const owned = !consumable && state.ownedEquipment.includes(item.id)
  const worn = isEquipped(state, item.id)
  const price = item.price
  const what = consumable ? t('equipment.packOf', { name: itemLabel(item, locale), count: item.packSize! }) : itemDisplayName(item, locale, t)
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
          {item.level !== undefined ? <span className={styles.cardLevel}>{t('common.lvl', { level: item.level })}</span> : <span />}
          <span className={styles.cardType}>{t(SLOT_LABELS[item.slot])}</span>
        </span>
        <h2 id="item-detail-title" ref={heading} tabIndex={-1} className={styles.bigName}>
          {itemLabel(item, locale)}
        </h2>
        <span className={styles.bigArt}>
          <ItemArt item={item} />
        </span>
        <dl className={styles.facts}>
          <div>
            <dt>{t('equipment.fact.type')}</dt>
            <dd>{t(SLOT_LABELS[item.slot])}</dd>
          </div>
          <div>
            <dt>{t('equipment.fact.level')}</dt>
            <dd>{item.level ?? (item.price === null ? t('equipment.toBeDefined') : '—')}</dd>
          </div>
          {consumable && (
            <>
              <div>
                <dt>{t('equipment.fact.pack')}</dt>
                <dd>
                  {item.slot === 'nutrition'
                    ? t('equipment.packNutrition', { count: item.packSize! })
                    : t('equipment.packUnits', { count: item.packSize! })}
                </dd>
              </div>
              <div>
                <dt>{t('equipment.fact.inStock')}</dt>
                <dd>{stock}</dd>
              </div>
            </>
          )}
          <div>
            <dt>{t('equipment.fact.raceEffect')}</dt>
            <dd className={item.effectText ? styles.effect : undefined}>{effectText(item, t, locale)}</dd>
          </div>
          <div>
            <dt>{t('equipment.fact.price')}</dt>
            <dd>{price === null ? t('equipment.toBeDefined') : price === 0 ? t('equipment.free') : <Coins amount={price} />}</dd>
          </div>
        </dl>
        <p className={styles.muted}>{itemDescription(item, locale)}</p>
      </div>

      {shortfall > 0 && !owned && (
        <p id={shortfallId} className={styles.warning}>
          {t('equipment.youNeed', { coins: coins(shortfall) })}
        </p>
      )}
      {confirming && price !== null && (
        <p className={styles.muted}>
          {t('equipment.balanceChange', { from: coins(state.coins), to: coins(state.coins - price) })}
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
                if (failure) return t(EQUIP_ERRORS[failure])
                onMessage(t(worn ? 'equipment.takenOffMessage' : 'equipment.equippedMessage', { name: itemDisplayName(item, locale, t) }))
                return null
              })
            }
          >
            {busy === 'equipping' ? t('equipment.saving') : worn ? t('equipment.takeOff') : t('equipment.equip')}
            <span className={styles.srOnly}> {itemDisplayName(item, locale, t).toLowerCase()}</span>
          </button>
        ) : price === null ? (
          <p className={styles.muted}>{t('equipment.notForSale')}</p>
        ) : confirming ? (
          <>
            <button
              type="button"
              className={`${button.button} ${button.secondary}`}
              aria-disabled={busy !== null || undefined}
              onClick={() => busy === null && setConfirming(false)}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className={`${button.button} ${button.primary}`}
              aria-disabled={busy !== null || undefined}
              onClick={() =>
                run('paying', async () => {
                  const failure = await buyItem(item.id, price)
                  if (failure) return t(BUY_ERRORS[failure])
                  setConfirming(false)
                  onMessage(t('equipment.boughtMessage', { what, coins: coins(price) }))
                  return null
                })
              }
            >
              {busy === 'paying' ? t('equipment.paying') : t('equipment.pay', { coins: coins(price) })}
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
            {consumable ? t('equipment.buyPack', { count: item.packSize! }) : t('equipment.buy')}
            <span className={styles.srOnly}> {(consumable ? itemLabel(item, locale) : itemDisplayName(item, locale, t)).toLowerCase()}</span>
          </button>
        )}
      </div>
    </article>
  )
}
