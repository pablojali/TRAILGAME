import { useState } from 'react'
import { useCareer } from '../../app/game/gameContext'
import { Coins, Premium } from '../../components/Coins'
import { getLevel } from '../../domain/athlete/levels'
import { CAMP_KINDS, campItemName, campItems, getCampItem, tiedBackground, type CampItem, type CampScene } from '../../domain/basecamp/catalog'
import { campScene, isCampItemUsed, missingRequired, ownsCampItem, premiumOf, type CampBuyError, type CampUseError, type ExchangeError } from '../../game-engine/camp'
import { useI18n, type MessageKey } from '../../i18n/i18n'
import type { ServerError } from '../../repositories/supabase/careerOpsClient'
import styles from './BaseCamp.module.css'
import { artRatio, campArt, focusPosition } from './campArt'

type CampError = CampBuyError | CampUseError | ExchangeError | ServerError
const errorKey = (error: CampError) => `basecamp.error.${error}` as MessageKey

const KIND_TITLES = {
  background: 'basecamp.kind.background',
  upgrade: 'basecamp.kind.upgrade',
  cabin: 'basecamp.kind.cabin',
  decor: 'basecamp.kind.decor',
} as const

/**
 * Customize (owner design, 16 November 2026): the scene's pieces, unlocked by the player's level
 * and bought with coins or Premium Coins, then put in the scene or taken out, in one tab per kind.
 * Using or buying a piece closes the sheet on the scene. (Coins are exchanged for Premium Coins in
 * the wallet, from the top bar.) Everything goes through the server like the equipment shop.
 */
export function CampShop({ scene, initialKind, onClose }: { scene: CampScene; initialKind?: CampItem['kind']; onClose(): void }) {
  const { t } = useI18n()
  const { state } = useCareer()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  // One tab per kind with something to show (owner request, 17 November 2026). An exclusive piece
  // (the admin's refuge) is only listed for whoever has it.
  // Objects tied to another background (its house, its fireplace) are listed with that background.
  const shownBackground = campScene(state, scene).background
  const listed = (item: CampItem) => (!item.exclusive || ownsCampItem(state, item)) && (!tiedBackground(item) || tiedBackground(item)!.id === shownBackground.id)
  const tabs = CAMP_KINDS.map((kind) => ({ kind, items: campItems(scene, kind).filter(listed) })).filter(
    ({ kind, items }) => (kind === 'cabin' || kind === 'upgrade' ? items.length > 0 : kind === 'background' ? items.length > 1 : true),
  )
  const [tab, setTab] = useState(initialKind && tabs.some((x) => x.kind === initialKind) ? initialKind : (tabs[0]?.kind ?? 'decor'))
  const shown = tabs.find((x) => x.kind === tab) ?? tabs[0]

  /** Runs an action; with `close`, a success takes the player straight to the scene. */
  async function run(key: string, action: () => Promise<string | CampError | null>, done: string, close = false) {
    if (busy) return
    setBusy(key)
    setMessage(null)
    const failure = await action()
    setBusy(null)
    if (!failure && close) return onClose()
    setMessage(failure ? { text: t(errorKey(failure as CampError)), error: true } : done ? { text: done, error: false } : null)
  }

  return (
    <div className={styles.shopBack} role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className={styles.shop} role="dialog" aria-modal="true" aria-labelledby="camp-shop-title">
        <header className={styles.shopHead}>
          <h2 id="camp-shop-title">{t('basecamp.shop.title')}</h2>
          <button type="button" className={styles.close} onClick={onClose}>
            {t('basecamp.shop.close')}
          </button>
        </header>
        {tabs.length > 1 && (
          <div className={styles.shopTabs} role="tablist" aria-label={t('basecamp.shop.title')}>
            {tabs.map(({ kind }) => (
              <button key={kind} type="button" role="tab" aria-selected={kind === shown?.kind} onClick={() => setTab(kind)}>
                {t(KIND_TITLES[kind])}
              </button>
            ))}
          </div>
        )}

        <div className={styles.shopBody} role="tabpanel">
          {message && (
            <p role={message.error ? 'alert' : 'status'} className={message.error ? styles.shopError : styles.shopNote}>
              {message.text}
            </p>
          )}
          {!shown || shown.items.length === 0 ? (
            <p className={styles.muted}>{t('basecamp.shop.empty')}</p>
          ) : (
            <ul className={styles.pieces}>
              {shown.items.map((item) => (
                <Piece key={item.id} item={item} busy={busy} run={run} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}

function Piece({
  item,
  busy,
  run,
}: {
  item: CampItem
  busy: string | null
  run(key: string, action: () => Promise<string | CampError | null>, done: string, close?: boolean): Promise<void>
}) {
  const { t, locale } = useI18n()
  const { state, buyCampItem, setCampItemUsed } = useCareer()
  const name = campItemName(item, locale)
  const owned = ownsCampItem(state, item)
  const used = isCampItemUsed(state, item)
  const locked = getLevel(state.athlete.xp) < item.level
  const balance = item.currency === 'coins' ? state.coins : premiumOf(state)
  const src = campArt(item)
  // A background in use stays until another is chosen; a cabin, upgrade or decor is taken out.
  const canToggle = !(used && item.kind === 'background')
  // An upgrade needs its background: without it, the shop says which.
  const base = item.kind === 'upgrade' ? getCampItem(item.base ?? '') : undefined
  const needsBase = !!base && !ownsCampItem(state, base)
  // An evolution needs the pieces it requires first (owner design, 20 November 2026): the shop names them.
  const missing = owned ? [] : missingRequired(state, item)
  // Its thumbnail is drawn over a background: its own (an upgrade) or the one shown (decor).
  const under = base ?? (item.kind === 'decor' ? campScene(state, item.scene).picture : undefined)

  return (
    <li className={styles.piece}>
      {!src ? (
        <span className={styles.noArt}>{t('basecamp.shop.noArt')}</span>
      ) : item.focus ? (
        // An upgrade or an object shows its part of the picture (its focus): 1/zoom of the
        // picture each way, on the picture's own shape.
        <span
          className={styles.focusThumb}
          role="presentation"
          style={{
            aspectRatio: String(artRatio(item)),
            // Over its background: what the picture leaves transparent shows the background.
            backgroundImage: under && campArt(under) ? `url(${src}), url(${campArt(under)})` : `url(${src})`,
            backgroundSize: `${item.focus.zoom * 100}% auto`,
            backgroundPosition: `${focusPosition(item.focus.x, item.focus.zoom)}% ${focusPosition(item.focus.y, item.focus.zoom)}%`,
          }}
        />
      ) : (
        <img src={src} alt="" loading="lazy" className={item.kind === 'decor' ? styles.objectThumb : undefined} />
      )}
      <strong>{name}</strong>
      {needsBase && !owned ? (
        <span className={styles.locked}>{t('basecamp.shop.needsBase', { name: campItemName(base!, locale) })}</span>
      ) : missing.length > 0 ? (
        <span className={styles.locked}>{t('basecamp.shop.needsBase', { name: missing.map((other) => campItemName(other, locale)).join(', ') })}</span>
      ) : owned ? (
        <button
          type="button"
          className={styles.action}
          // The coach points at the gear stand's button (owner design: placed first, with the coach).
          data-coach={item.action === 'gear' ? 'camp-gear-put' : undefined}
          aria-pressed={used}
          aria-disabled={!canToggle || busy !== null || undefined}
          // Using a piece shows it at once: the sheet closes on the scene.
          onClick={() => canToggle && void run(item.id, () => setCampItemUsed(item.id, !used), '', !used)}
        >
          {busy === item.id
            ? t('basecamp.shop.saving')
            : item.kind === 'decor'
              ? t(used ? 'basecamp.shop.remove' : 'basecamp.shop.place')
              : t(used ? 'basecamp.shop.inUse' : 'basecamp.shop.use')}
          <span className={styles.srOnly}> {name}</span>
        </button>
      ) : locked ? (
        <span className={styles.locked}>{t('basecamp.shop.locked', { level: item.level })}</span>
      ) : (
        <>
          {item.currency === 'coins' ? <Coins amount={item.price} /> : <Premium amount={item.price} />}
          <button
            type="button"
            className={styles.action}
            aria-disabled={balance < item.price || busy !== null || undefined}
            onClick={() =>
              balance >= item.price &&
              void run(
                item.id,
                async () => {
                  // Bought and put in the scene at once, then the sheet closes on it.
                  const bought = await buyCampItem(item.id, { price: item.price, currency: item.currency })
                  if (bought) return bought
                  return setCampItemUsed(item.id, true)
                },
                t('basecamp.shop.bought', { name }),
                true,
              )
            }
          >
            {busy === item.id ? t('basecamp.shop.saving') : t('basecamp.shop.buy')}
            <span className={styles.srOnly}> {name}</span>
          </button>
        </>
      )}
    </li>
  )
}
