import { useEffect, useRef, useState } from 'react'
import type { Course } from '../../domain/races/course'
import styles from './Majors.module.css'

const TILE = 256
/** The closest view, about zoom 16 of a web map: a very short segment does not fill the box. */
const MAX_SCALE = 2 ** 16

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
 * The course seen from above (owner design, 18 November 2026): the race's GPX route, the segment
 * being run highlighted, and the runners on it. The view fits the segment (or the whole course) in
 * the box; nothing to pan or zoom. Only the route, drawn like the course profile (owner request,
 * 19 November 2026: no map tiles).
 */
export function CourseMap({
  course,
  fromKm,
  toKm,
  runners,
  label,
  compact = false,
  aidKm = [],
}: {
  course: Course
  /** The segment to show and highlight; the whole course when missing. */
  fromKm?: number
  toKm?: number
  runners: MapRunner[]
  label: string
  /** A small map (the race page). */
  compact?: boolean
  /** The aid stations, in km of the course, marked on the route. */
  aidKm?: readonly number[]
}) {
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
  // The scale at which the frame (with a margin) fits the box: points first at zoom 0, then scaled.
  const raw = (lat: number, lon: number) => project(lat, lon, 0)
  const pts = frame.map(([, , lat, lon]) => raw(lat, lon))
  const minX = Math.min(...pts.map((p) => p.x))
  const maxX = Math.max(...pts.map((p) => p.x))
  const minY = Math.min(...pts.map((p) => p.y))
  const maxY = Math.max(...pts.map((p) => p.y))
  const scale = Math.min(MAX_SCALE, (size.width * 0.86) / Math.max(maxX - minX, 1e-9), (size.height * 0.86) / Math.max(maxY - minY, 1e-9))
  const centre = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  const toScreen = (lat: number, lon: number) => {
    const p = raw(lat, lon)
    return { x: (p.x - centre.x) * scale + size.width / 2, y: (p.y - centre.y) * scale + size.height / 2 }
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

  const segment = fromKm !== undefined && toKm !== undefined ? all.filter(([km]) => km >= start && km <= end) : null
  const startPoint = toScreen(all[0]![2], all[0]![3])
  const finishPoint = toScreen(all[all.length - 1]![2], all[all.length - 1]![3])

  return (
    <figure className={`${styles.courseMap} ${compact ? styles.courseMapCompact : ''}`} aria-label={label}>
      <div ref={box} className={styles.courseMapBox}>
        <svg viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
          <polyline className={styles.mapRoute} points={path(all)} />
          {segment && segment.length >= 2 && <polyline className={styles.mapSegment} points={path(segment)} />}
          {aidKm.map((km) => {
            const p = at(km)
            return <circle key={km} className={styles.mapAid} cx={p.x} cy={p.y} r={3} />
          })}
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
    </figure>
  )
}
