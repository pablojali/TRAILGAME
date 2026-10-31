import styles from './RadarChart.module.css'

interface RadarChartProps {
  /** One axis per value, clockwise from the top. */
  values: readonly { id: string; label: string; value: number }[]
  /** The value at the outer ring. */
  max: number
  className?: string
}

/**
 * The value at the outer ring for a set of values: 50 until a value passes 45, then 10 above the
 * best, in steps of 10. Fixed for a new runner (owner feedback, 31 October 2026: a starting runner
 * should not look strong), so the shape grows as the attributes do.
 */
export function radarScale(values: readonly number[]): number {
  return Math.max(50, Math.ceil((Math.max(...values) + 5) / 10) * 10)
}

const SIZE = 200
const CENTRE = SIZE / 2
const RADIUS = 70

function point(index: number, count: number, ratio: number): [number, number] {
  const angle = -Math.PI / 2 + (index / count) * Math.PI * 2
  return [CENTRE + Math.cos(angle) * RADIUS * ratio, CENTRE + Math.sin(angle) * RADIUS * ratio]
}

const polygon = (points: [number, number][]) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

/**
 * Spider chart of a set of values (the runner's attributes). Decorative: the values are given to
 * assistive technology by the caller (e.g. as meters), so the chart is hidden from it.
 */
export function RadarChart({ values, max, className }: RadarChartProps) {
  const count = values.length
  const rings = [1 / 3, 2 / 3, 1]
  const shape = values.map((v, i) => point(i, count, Math.max(0, Math.min(1, v.value / max))))
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={`${styles.radar} ${className ?? ''}`} aria-hidden="true">
      {rings.map((ratio) => (
        <polygon key={ratio} points={polygon(values.map((_, i) => point(i, count, ratio)))} className={styles.ring} />
      ))}
      {values.map((v, i) => {
        const [x, y] = point(i, count, 1)
        return <line key={v.id} x1={CENTRE} y1={CENTRE} x2={x} y2={y} className={styles.axis} />
      })}
      <polygon points={polygon(shape)} className={styles.shape} />
      {shape.map(([x, y], i) => (
        <circle key={values[i]!.id} cx={x} cy={y} r="2.5" className={styles.dot} />
      ))}
      {values.map((v, i) => {
        const [x, y] = point(i, count, 1.2)
        const anchor = Math.abs(x - CENTRE) < 4 ? 'middle' : x > CENTRE ? 'start' : 'end'
        return (
          <text key={v.id} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className={styles.label}>
            {v.label}
          </text>
        )
      })}
    </svg>
  )
}
