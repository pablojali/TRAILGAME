import { useState } from 'react'
import { useCareer } from '../../app/game/gameContext'
import { Coins, Premium } from '../../components/Coins'
import { getLevel } from '../../domain/athlete/levels'
import { CAMP_KINDS, campItemName, campItems, type CampItem, type CampScene } from '../../domain/basecamp/catalog'
import { COINS_PER_PREMIUM, MAX_EXCHANGE } from '../../domain/economy/premium'
import { isCampItemUsed, ownsCampItem, premiumOf, type CampBuyError, type CampUseError, type ExchangeError } from '../../game-engine/camp'
import { useI18n, type MessageKey } from '../../i18n/i18n'
import type { ServerError } from '../../repositories/supabase/careerOpsClient'
import styles from './BaseCamp.module.css'
import { campArt } from './campArt'

type CampError = CampBuyError | CampUseError | ExchangeError | ServerError
const errorKey = (error: CampError) => `basecamp.error.${error}` as MessageKey

const KIND_TITLES = {
  background: 'basecamp.kind.background',
  cabin: 'basecamp.kind.cabin',
  decor: 'basecamp.kind.decor',
} as const

/**
 * Customize (owner design, 16 November 2026): the scene's pieces, unlocked by the player's level
 * and bought with coins or Premium Coins, then put in the scene or taken out. Coins are exchanged
 * for Premium Coins here, one way. Everything goes through the server like the equipment shop.
 */
export function CampShop({ scene, onClose }: { scene: CampScene; onClose(): void }) {
  const { t } = useI18n()
  const { state, exchangePremium } = useCareer()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [amountText, setAmountText] = useState('1')
  const amount = Math.max(0, Math.min(MAX_EXCHANGE, Math.floor(Number(amountText) || 0)))
  const premium = premiumOf(state)
  const cost = amount * COINS_PER_PREMIUM

  async function run(key: string, action: () => Promise<string | CampError | null>, done: string) {
    if (busy) return
    setBusy(key)
    setMessage(null)
    const failure = await action()
    setBusy(null)
    setMessage(failure ? { text: t(errorKey(failure as CampError)), error: true } : done ? { text: done, error: false } : null)
  }

  return (
    <div className={styles.shopBack} role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className={styles.shop} role="dialog" aria-modal="true" aria-labelledby="camp-shop-title">
        <header className={styles.shopHead}>
          <h2 id="camp-shop-title">{t('basecamp.shop.title')}</h2>
          <span className={styles.balances}>
            <Coins amount={state.coins} />
            <Premium amount={premium} />
          </span>
          <button type="button" className={styles.close} onClick={onClose}>
            {t('basecamp.shop.close')}
          </button>
        </header>

        <div className={styles.shopBody}>
          <section className={styles.exchange} aria-labelledby="camp-exchange">
            <h3 id="camp-exchange">{t('basecamp.exchange.title')}</h3>
            <p className={styles.muted}>{t('basecamp.exchange.rate', { coins: COINS_PER_PREMIUM })}</p>
            <div className={styles.exchangeRow}>
              <label>
                {t('basecamp.exchange.amount')}
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_EXCHANGE}
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                />
              </label>
              <button
                type="button"
                className={styles.action}
                aria-disabled={amount < 1 || cost > state.coins || busy !== null || undefined}
                onClick={() =>
                  amount >= 1 &&
                  cost <= state.coins &&
                  void run('exchange', () => exchangePremium(amount, COINS_PER_PREMIUM), t('basecamp.exchange.done', { count: amount }))
                }
              >
                {busy === 'exchange' ? t('basecamp.shop.saving') : t('basecamp.exchange.go')}
              </button>
            </div>
            <p className={styles.muted}>{t('basecamp.exchange.cost', { coins: cost })}</p>
          </section>

          {message && (
            <p role={message.error ? 'alert' : 'status'} className={message.error ? styles.shopError : styles.shopNote}>
              {message.text}
            </p>
          )}

          {CAMP_KINDS.map((kind) => {
            const items = campItems(scene, kind)
            if (kind === 'background' && items.length <= 1) return null
            return (
              <section key={kind} aria-labelledby={`camp-kind-${kind}`}>
                <h3 id={`camp-kind-${kind}`}>{t(KIND_TITLES[kind])}</h3>
                {items.length === 0 ? (
                  <p className={styles.muted}>{t('basecamp.shop.empty')}</p>
                ) : (
                  <ul className={styles.pieces}>
                    {items.map((item) => (
                      <Piece key={item.id} item={item} busy={busy} run={run} />
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
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
  run(key: string, action: () => Promise<string | CampError | null>, done: string): Promise<void>
}) {
  const { t, locale } = useI18n()
  const { state, buyCampItem, setCampItemUsed } = useCareer()
  const name = campItemName(item, locale)
  const owned = ownsCampItem(state, item)
  const used = isCampItemUsed(state, item)
  const locked = getLevel(state.athlete.xp) < item.level
  const balance = item.currency === 'coins' ? state.coins : premiumOf(state)
  const src = campArt(item)
  // A background in use stays until another is chosen; a cabin or decor is taken out.
  const canToggle = !(used && item.kind === 'background')

  return (
    <li className={styles.piece}>
      {src ? <img src={src} alt="" loading="lazy" /> : <span className={styles.noArt}>{t('basecamp.shop.noArt')}</span>}
      <strong>{name}</strong>
      {owned ? (
        <button
          type="button"
          className={styles.action}
          aria-pressed={used}
          aria-disabled={!canToggle || busy !== null || undefined}
          onClick={() => canToggle && void run(item.id, () => setCampItemUsed(item.id, !used), '')}
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
              void run(item.id, () => buyCampItem(item.id, { price: item.price, currency: item.currency }), t('basecamp.shop.bought', { name }))
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
