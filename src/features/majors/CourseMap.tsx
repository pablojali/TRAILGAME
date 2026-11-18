import { useEffect, useRef, useState } from 'react'
import type { Course } from '../../domain/races/course'
import { useI18n } from '../../i18n/i18n'
import styles from './Majors.module.css'

/** Map tiles: OpenTopoMap (owner choice, 18 November 2026: the route over a real map). */
const TILE = 256
const MAX_ZOOM = 16
const tileUrl = (z: number, x: number, y: number) => `https://${'abc'[(x + y) % 3]}.tile.opentopomap.org/${z}/${x}/${y}.png`

/** Web Mercator: a point's position in pixels at a zoom level. */
function project(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const scale = TILE * 2 ** zoom
  const sin = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180)
  return { x: ((lon + 180) / 360) * scale, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale }
}

export interface MapRunner {
  /** km from the start of the course. */
  km: number
  me: boolean
  label?: string
}

/**
 * The course seen from above (owner design, 18 November 2026): the race's GPX route over a real
 * topographic map, the segment being run highlighted, and the runners on it. The view fits the
 * segment (or the whole course) in the box; nothing to pan or zoom.
 */
export function CourseMap({
  course,
  fromKm,
  toKm,
  runners,
  label,
}: {
  course: Course
  /** The segment to show and highlight; the whole course when missing. */
  fromKm?: number
  toKm?: number
  runners: MapRunner[]
  label: string
}) {
  const { t } = useI18n()
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 360, height: 220 })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setSize({ width: el.clientWidth || 360, height: el.clientHeight || 220 })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const all = course.points
  const start = fromKm ?? 0
  const end = toKm ?? all[all.length - 1]![0]
  const focus = all.filter(([km]) => km >= start && km <= end)
  const frame = focus.length >= 2 ? focus : all
  // The highest zoom at which the frame (with a margin) fits the box.
  let zoom = MAX_ZOOM
  for (; zoom > 1; zoom--) {
    const pts = frame.map(([, , lat, lon]) => project(lat, lon, zoom))
    const w = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x))
    const h = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y))
    if (w <= size.width * 0.82 && h <= size.height * 0.82) break
  }
  const pts = frame.map(([, , lat, lon]) => project(lat, lon, zoom))
  const centre = {
    x: (Math.max(...pts.map((p) => p.x)) + Math.min(...pts.map((p) => p.x))) / 2,
    y: (Math.max(...pts.map((p) => p.y)) + Math.min(...pts.map((p) => p.y))) / 2,
  }
  const left = centre.x - size.width / 2
  const top = centre.y - size.height / 2
  const toScreen = (lat: number, lon: number) => {
    const p = project(lat, lon, zoom)
    return { x: p.x - left, y: p.y - top }
  }
  const path = (points: typeof all) =>
    points
      .map(([, , lat, lon]) => {
        const p = toScreen(lat, lon)
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
      })
      .join(' ')
  const at = (km: number) => {
    let i = 1
    while (i < all.length - 1 && all[i]![0] < km) i++
    const [k0, , lat0, lon0] = all[i - 1]!
    const [k1, , lat1, lon1] = all[i]!
    const f = k1 > k0 ? Math.min(1, Math.max(0, (km - k0) / (k1 - k0))) : 0
    return toScreen(lat0 + (lat1 - lat0) * f, lon0 + (lon1 - lon0) * f)
  }

  // The tiles under the box.
  const tiles: { key: string; x: number; y: number; src: string }[] = []
  const count = 2 ** zoom
  for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + size.height) / TILE); ty++) {
    if (ty < 0 || ty >= count) continue
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + size.width) / TILE); tx++) {
      const wrapped = ((tx % count) + count) % count
      tiles.push({ key: `${zoom}/${tx}/${ty}`, x: tx * TILE - left, y: ty * TILE - top, src: tileUrl(zoom, wrapped, ty) })
    }
  }
  const segment = fromKm !== undefined && toKm !== undefined ? all.filter(([km]) => km >= start && km <= end) : null
  const startPoint = toScreen(all[0]![2], all[0]![3])
  const finishPoint = toScreen(all[all.length - 1]![2], all[all.length - 1]![3])

  return (
    <figure className={styles.courseMap} aria-label={label}>
      <div ref={box} className={styles.courseMapBox}>
        {tiles.map((tile) => (
          <img key={tile.key} src={tile.src} alt="" draggable={false} loading="lazy" style={{ left: tile.x, top: tile.y }} />
        ))}
        <svg viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
          <polyline className={styles.mapRoute} points={path(all)} />
          {segment && segment.length >= 2 && <polyline className={styles.mapSegment} points={path(segment)} />}
          <circle className={styles.mapStart} cx={startPoint.x} cy={startPoint.y} r={5} />
          <circle className={styles.mapFinish} cx={finishPoint.x} cy={finishPoint.y} r={5} />
          {runners
            .filter((r) => !r.me)
            .map((r, i) => {
              const p = at(r.km)
              return <circle key={i} className={styles.mapRunner} cx={p.x} cy={p.y} r={4} />
            })}
          {runners
            .filter((r) => r.me)
            .map((r, i) => {
              const p = at(r.km)
              return <circle key={`me-${i}`} className={styles.mapMe} cx={p.x} cy={p.y} r={7} />
            })}
        </svg>
      </div>
      <figcaption className={styles.mapCredit}>{t('major.map.credit')}</figcaption>
    </figure>
  )
}
