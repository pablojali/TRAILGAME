import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import type { CampAction, CampItem, CampScene } from '../../domain/basecamp/catalog'
import { campScene, campSpots, type CampSpot, type PlacedDecor } from '../../game-engine/camp'
import { useI18n, type MessageKey } from '../../i18n/i18n'
import styles from './BaseCamp.module.css'
import { artRatio, campArt } from './campArt'
import { CampShop } from './CampShop'
import { useMailbox, visitPath } from './visits'

/** A point on a scene, in fractions of its picture (0–1 across, 0–1 down). */
interface Spot {
  x: number
  y: number
}

const LABELS: Record<CampScene, 'basecamp.exteriorLabel' | 'basecamp.interiorLabel'> = {
  exterior: 'basecamp.exteriorLabel',
  interior: 'basecamp.interiorLabel',
}

/** Lanterns of the first living room (lvl0): a warm glow that flickers. */
const LANTERNS: Record<string, readonly Spot[]> = {
  'lvl0-interior': [
    { x: 0.428, y: 0.06 },
    { x: 0.25, y: 0.33 },
    { x: 0.012, y: 0.35 },
    { x: 0.856, y: 0.53 },
  ],
}

/** The sun of the first exterior (lvl0), glowing behind the peaks. */
const SUNS: Record<string, Spot> = { 'lvl0-exterior': { x: 0.9, y: 0.36 } }

/** Dust in the light: a few motes drifting (positions and delays fixed, no randomness). */
const MOTES: readonly (Spot & { delay: number })[] = [
  { x: 0.08, y: 0.22, delay: 0 },
  { x: 0.16, y: 0.4, delay: 2.5 },
  { x: 0.22, y: 0.15, delay: 5 },
  { x: 0.3, y: 0.3, delay: 1.2 },
  { x: 0.12, y: 0.55, delay: 3.8 },
  { x: 0.6, y: 0.2, delay: 6.2 },
]

/** Sparks of light outside, among the trees and over the meadow. */
const FIREFLIES: readonly (Spot & { delay: number })[] = [
  { x: 0.55, y: 0.62, delay: 0 },
  { x: 0.62, y: 0.7, delay: 1.7 },
  { x: 0.2, y: 0.72, delay: 3.1 },
  { x: 0.78, y: 0.66, delay: 4.4 },
  { x: 0.45, y: 0.78, delay: 2.2 },
  { x: 0.9, y: 0.6, delay: 5.6 },
]

/** Inside, the gear button's centre this far from the screen's left edge (half the button and a margin). */
const GEAR_EDGE = 64

/**
 * How many screens wide each scene is at most (the rest is swiped). The living room is narrower
 * (2600×1600), so it may be wider in screens and fill more of the height (owner request,
 * 17 November 2026: less blur above and below).
 */
const SCREENS_WIDE: Record<CampScene, number> = { exterior: 1.8, interior: 2.4 }

const at = ({ x, y }: Spot) => ({ left: `${x * 100}%`, top: `${y * 100}%` })

/** The button's words for each action. */
const ACTION_LABELS: Record<CampAction, MessageKey> = {
  enter: 'basecamp.enter',
  exit: 'basecamp.action.exit',
  gear: 'basecamp.gear',
  look: 'basecamp.action.look',
  mailbox: 'basecamp.action.mailbox',
  training: 'basecamp.action.training',
  races: 'basecamp.action.races',
  career: 'basecamp.action.career',
}

/** The screens an action opens. */
const ACTION_PATHS: Partial<Record<CampAction, string>> = {
  gear: '/equipment',
  look: '/appearance',
  training: '/training',
  races: '/races',
  career: '/career',
}

/**
 * Base Camp (owner design, 15 November 2026): the player's refuge, a cabin in the mountains.
 * Outside, the cabin; inside, one living room wider than the screen, scrolled sideways. The bench
 * opens Equipment. Since 16 November 2026 each scene is built from the player's pieces: a
 * background, a cabin over it and decor over both (Customize). The view is kept in the URL
 * (`?view=interior`), so coming back from Equipment returns inside.
 */
export function BaseCampScreen() {
  const { t } = useI18n()
  const { state } = useCareer()
  const [params, setParams] = useSearchParams()
  const [shopOpen, setShopOpen] = useState(false)
  const [mailOpen, setMailOpen] = useState(false)
  const view: CampScene = params.get('view') === 'interior' ? 'interior' : 'exterior'
  const show = (next: CampScene) => setParams(next === 'interior' ? { view: 'interior' } : {}, { replace: true })
  const scene = campScene(state, view)
  const spots = campSpots(state, view)
  // The scene opens on the door outside; inside, on the gear button if there is one, else at the left.
  const focus = spots.find((s) => s.action === (view === 'exterior' ? 'enter' : 'gear'))
  const act = (action: CampAction) => {
    if (action === 'enter') show('interior')
    else if (action === 'exit') show('exterior')
    else if (action === 'mailbox') setMailOpen(true)
  }

  return (
    <section className={styles.camp} aria-labelledby="basecamp-title">
      {/* Title and Customize side by side (owner request, 17 November 2026). The door goes in; inside, "Go out" goes back. */}
      <header className={styles.bar}>
        {view === 'interior' && (
          <button type="button" className={styles.customize} onClick={() => show('exterior')}>
            {t('basecamp.goOut')}
          </button>
        )}
        <h1 id="basecamp-title" className={styles.title}>
          {t('basecamp.title')}
        </h1>
        <button type="button" className={styles.customize} onClick={() => setShopOpen(true)}>
          {t('basecamp.customize')}
        </button>
      </header>

      <Panorama key={`${view}:${scene.picture.id}`} scene={view} background={scene.picture} layers={[scene.cabin]} objects={scene.placed} focus={focus?.x ?? 0}>
        {view === 'exterior' ? (
          <ExteriorAmbience picture={scene.picture} />
        ) : (
          <>
            {(LANTERNS[scene.picture.id] ?? []).map((l, i) => (
              <span key={i} className={styles.lantern} style={{ ...at(l), animationDelay: `${i * 0.7}s` }} aria-hidden="true" />
            ))}
            {MOTES.map((m, i) => (
              <span key={i} className={styles.mote} style={{ ...at(m), animationDelay: `${m.delay}s` }} aria-hidden="true" />
            ))}
          </>
        )}
        {spots.map((spot) => (
          <SpotButton key={spot.item.id} spot={spot} onAct={act} />
        ))}
      </Panorama>
      <p className={styles.hint} aria-hidden="true">
        {t('basecamp.swipe')}
      </p>
      {shopOpen && <CampShop scene={view} onClose={() => setShopOpen(false)} />}
      {mailOpen && <Mailbox onClose={() => setMailOpen(false)} />}
    </section>
  )
}

/**
 * A piece's action: a pulsing ring and its words; screens open as links, the rest as buttons. On an
 * object (decor) only the ring shows, so the words don't cover its drawing (owner request,
 * 17 November 2026); the words stay for screen readers.
 */
function SpotButton({ spot, onAct }: { spot: CampSpot; onAct(action: CampAction): void }) {
  const { t } = useI18n()
  const path = ACTION_PATHS[spot.action]
  const onObject = spot.item.kind === 'decor'
  const label = t(ACTION_LABELS[spot.action])
  const className = onObject ? `${styles.spot} ${styles.objectSpot}` : styles.spot
  const content = (
    <>
      <span className={styles.ring} aria-hidden="true" />
      {!onObject && <span className={styles.spotLabel}>{label}</span>}
    </>
  )
  const named = onObject ? { 'aria-label': label, title: label } : {}
  return path ? (
    <Link to={path} className={className} style={at(spot)} {...named}>
      {content}
    </Link>
  ) : (
    <button type="button" className={className} style={at(spot)} onClick={() => onAct(spot.action)} {...named}>
      {content}
    </button>
  )
}

/** Outside: the sun of the first exterior and fireflies. */
export function ExteriorAmbience({ picture }: { picture: CampItem }) {
  const sun = SUNS[picture.id]
  return (
    <>
      {sun && <div className={styles.sun} style={at(sun)} aria-hidden="true" />}
      {FIREFLIES.map((f, i) => (
        <span key={i} className={styles.firefly} style={{ ...at(f), animationDelay: `${f.delay}s` }} aria-hidden="true" />
      ))}
    </>
  )
}

/**
 * The mailbox (owner idea, 16 November 2026; filled 17 November 2026): the latest visits and
 * congratulations from other runners, each opening the visitor's refuge.
 */
function Mailbox({ onClose }: { onClose(): void }) {
  const { t, locale } = useI18n()
  const entries = useMailbox()
  return (
    <div className={styles.shopBack} role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className={styles.shop} role="dialog" aria-modal="true" aria-labelledby="camp-mailbox-title">
        <header className={styles.shopHead}>
          <h2 id="camp-mailbox-title">{t('basecamp.mailbox.title')}</h2>
          <button type="button" className={styles.close} onClick={onClose}>
            {t('basecamp.shop.close')}
          </button>
        </header>
        <div className={styles.shopBody}>
          {entries === null ? (
            <p className={styles.muted}>{t('basecamp.mailbox.loading')}</p>
          ) : entries === 'offline' ? (
            <p className={styles.muted}>{t('basecamp.mailbox.offline')}</p>
          ) : entries.length === 0 ? (
            <p className={styles.muted}>{t('basecamp.mailbox.empty')}</p>
          ) : (
            <ul className={styles.letters}>
              {entries.map((entry) => (
                <li key={entry.id}>
                  <span aria-hidden="true">{entry.kind === 'congrats' ? '👏' : '👣'}</span>
                  <span>
                    {t(entry.kind === 'congrats' ? 'basecamp.mailbox.congrats' : 'basecamp.mailbox.visit', { name: entry.name })}
                    <small>{new Date(entry.at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</small>
                  </span>
                  <Link to={visitPath(entry.name)} className={styles.customize}>
                    {t('basecamp.mailbox.visitBack')}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}

/**
 * The scene's pictures, as tall as the screen and wider than it, scrolled sideways, opening on its
 * focus (the door, the gear bench). The background sets the shape; every other piece is on the
 * same canvas and is stretched over it.
 */
export function Panorama({
  scene,
  background,
  layers,
  objects,
  focus,
  children,
}: {
  scene: CampScene
  background: CampItem
  layers: (CampItem | null)[]
  /** Decor standing in the background's slots: drawn with its base on the slot's point. */
  objects: PlacedDecor[]
  focus: number
  children: ReactNode
}) {
  const { t } = useI18n()
  const [ratio, setRatio] = useState(() => artRatio(background))
  const scroller = useRef<HTMLDivElement>(null)
  // The scene is about two screens wide (owner request, 16 November 2026: less to swipe); it never
  // grows past the screen's height. What is left above and below shows the refuge blurred.
  const [box, setBox] = useState<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const height = box ? Math.min(box.height, (box.width * SCREENS_WIDE[scene]) / ratio) : null
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || height === null) return
    // Outside, the door in the middle; inside, the gear button at the screen's left edge (owner
    // request, 17 November 2026: the room opens towards the side that scrolls).
    const at = height * ratio * focus
    el.scrollLeft = Math.max(0, scene === 'interior' ? at - GEAR_EDGE : at - el.clientWidth / 2)
  }, [ratio, focus, height, scene])
  const art = campArt(background)
  return (
    <>
      {art && <div className={styles.blur} style={{ backgroundImage: `url(${art})` }} aria-hidden="true" />}
    <div ref={scroller} className={styles.scroller} tabIndex={0} aria-label={t(LABELS[scene])}>
      <div className={styles.scene} style={height === null ? { aspectRatio: String(ratio) } : { height, width: height * ratio }}>
        <img
          className={styles.picture}
          src={art}
          alt=""
          draggable={false}
          onLoad={(e) => {
            const { naturalWidth: w, naturalHeight: h } = e.currentTarget
            if (w > 0 && h > 0 && Math.abs(w / h - ratio) > 0.01) setRatio(w / h)
          }}
        />
        {layers.map((item) => {
          const src = item && campArt(item)
          return src ? <img key={item.id} className={styles.layer} src={src} alt="" draggable={false} /> : null
        })}
        {objects.map(({ item, at }) => {
          const src = campArt(item)
          return src ? (
            <img
              key={item.id}
              className={styles.object}
              src={src}
              alt=""
              draggable={false}
              style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%`, height: `${(item.size ?? 0.2) * at.scale * 100}%` }}
            />
          ) : null
        })}
        {children}
      </div>
    </div>
    </>
  )
}
