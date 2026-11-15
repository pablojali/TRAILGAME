import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import exteriorUrl from '../../../assets/ui/basecamp/exterior.webp'
import interiorUrl from '../../../assets/ui/basecamp/interior.webp'
import { useI18n } from '../../i18n/i18n'
import styles from './BaseCamp.module.css'

type View = 'exterior' | 'interior'

/** A point on a scene, in fractions of its picture (0–1 across, 0–1 down). */
interface Spot {
  x: number
  y: number
}

/**
 * The scenes (owner art, 15 November 2026). Each picture fills the screen's height and is wider
 * than the screen, so it scrolls sideways (swipe). Everything placed on it is in fractions of the
 * picture, so it stays on its spot at any screen size.
 */
const SCENES: Record<View, { src: string; ratio: number; focus: number; label: string }> = {
  // The cabin in the forest, the mountain behind (1079 × 625).
  exterior: { src: exteriorUrl, ratio: 1079 / 625, focus: 0.36, label: 'basecamp.exteriorLabel' },
  // The living room's band of the owner's interior (1080 × 912): window, gear, the bench.
  interior: { src: interiorUrl, ratio: 1080 / 912, focus: 0.72, label: 'basecamp.interiorLabel' },
}

/** Lanterns of the interior: a warm glow that flickers. */
const LANTERNS: readonly Spot[] = [
  { x: 0.428, y: 0.06 },
  { x: 0.25, y: 0.33 },
  { x: 0.012, y: 0.35 },
  { x: 0.856, y: 0.53 },
]

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

const at = ({ x, y }: Spot) => ({ left: `${x * 100}%`, top: `${y * 100}%` })

/**
 * Base Camp V1 (owner design, 15 November 2026): the player's refuge, a humble wooden cabin in the
 * mountains. Outside, the cabin (the future door for visitors); inside, one living room wider than
 * the screen, scrolled sideways. The first thing to use inside is the gear zone: the bench opens
 * Equipment, unchanged. No avatar walks here yet. The view is kept in the URL (`?view=interior`), so
 * coming back from Equipment returns inside.
 */
export function BaseCampScreen() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const view: View = params.get('view') === 'interior' ? 'interior' : 'exterior'
  const show = (next: View) => setParams(next === 'interior' ? { view: 'interior' } : {}, { replace: true })

  return (
    <section className={styles.camp} aria-labelledby="basecamp-title">
      <header className={styles.bar}>
        <h1 id="basecamp-title" className={styles.title}>
          {t('basecamp.title')}
        </h1>
        <div className={styles.switch} role="group" aria-label={t('basecamp.views')}>
          <button type="button" aria-pressed={view === 'exterior'} onClick={() => show('exterior')}>
            {t('basecamp.outside')}
          </button>
          <button type="button" aria-pressed={view === 'interior'} onClick={() => show('interior')}>
            {t('basecamp.inside')}
          </button>
        </div>
      </header>

      {view === 'exterior' ? (
        <Panorama key="exterior" view="exterior">
          <div className={styles.sun} style={at({ x: 0.9, y: 0.36 })} aria-hidden="true" />
          {FIREFLIES.map((f, i) => (
            <span key={i} className={styles.firefly} style={{ ...at(f), animationDelay: `${f.delay}s` }} aria-hidden="true" />
          ))}
          <button type="button" className={styles.spot} style={at({ x: 0.36, y: 0.52 })} onClick={() => show('interior')}>
            <span className={styles.ring} aria-hidden="true" />
            <span className={styles.spotLabel}>{t('basecamp.enter')}</span>
          </button>
        </Panorama>
      ) : (
        <Panorama key="interior" view="interior">
          {LANTERNS.map((l, i) => (
            <span key={i} className={styles.lantern} style={{ ...at(l), animationDelay: `${i * 0.7}s` }} aria-hidden="true" />
          ))}
          {MOTES.map((m, i) => (
            <span key={i} className={styles.mote} style={{ ...at(m), animationDelay: `${m.delay}s` }} aria-hidden="true" />
          ))}
          {/* The gear zone: the bench with the shoes and the pack opens Equipment. */}
          <Link to="/equipment" className={styles.spot} style={at({ x: 0.73, y: 0.62 })}>
            <span className={styles.ring} aria-hidden="true" />
            <span className={styles.spotLabel}>{t('basecamp.gear')}</span>
          </Link>
        </Panorama>
      )}
      <p className={styles.hint} aria-hidden="true">
        {t('basecamp.swipe')}
      </p>
    </section>
  )
}

/** A picture as tall as the screen and wider than it, scrolled sideways, opening on its focus. */
function Panorama({ view, children }: { view: View; children: ReactNode }) {
  const { t } = useI18n()
  const scene = SCENES[view]
  const scroller = useRef<HTMLDivElement>(null)
  // Open on the scene's focus (the cabin's door, the gear bench), before the first paint.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const width = el.clientHeight * scene.ratio
    el.scrollLeft = Math.max(0, width * scene.focus - el.clientWidth / 2)
  }, [scene])
  return (
    <div ref={scroller} className={styles.scroller} tabIndex={0} aria-label={t(scene.label as 'basecamp.exteriorLabel')}>
      <div className={styles.scene} style={{ aspectRatio: String(scene.ratio) }}>
        <img className={styles.picture} src={scene.src} alt="" draggable={false} />
        {children}
      </div>
    </div>
  )
}
