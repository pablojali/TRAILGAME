import { useEffect, useRef } from 'react'
import { RaceViewEngine } from './raceView'
import type { RaceViewSource } from './types'
import styles from './RaceDemo.module.css'

/**
 * The race back view as a component. It reads its state from `source` once per frame (no React
 * render per frame), so the caller can be a simulated generator or the real race.
 */
export function RaceView({ source, onFps, label }: { source: RaceViewSource; onFps?: (fps: number) => void; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sourceRef = useRef(source)
  const fpsRef = useRef(onFps)
  useEffect(() => {
    sourceRef.current = source
    fpsRef.current = onFps
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new RaceViewEngine(canvas, () => sourceRef.current(), { onFps: (fps) => fpsRef.current?.(fps) })
    const fit = () => engine.resize(canvas.clientWidth || 1, canvas.clientHeight || 1)
    fit()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    observer?.observe(canvas)
    engine.start()
    return () => {
      observer?.disconnect()
      engine.stop()
    }
  }, [])

  return <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={label} />
}
