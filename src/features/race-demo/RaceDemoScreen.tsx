import { useEffect, useRef, useState } from 'react'
import { DEFAULT_FRAMING, type Framing } from './projection'
import { RaceView } from './RaceView'
import { GAP_MAX, GAP_MIN, RaceSimulation } from './simulation'
import styles from './RaceDemo.module.css'

/**
 * Demo of the race back view (owner brief, 24 November 2026), at /race-demo: a made-up race and a
 * debug panel (speed, add and remove rivals, move one rival, frames per second). It does not touch
 * the game's races. See docs/RACE_BACK_VIEW_DEMO.md.
 */
export function RaceDemoScreen() {
  const [sim] = useState(() => new RaceSimulation())
  const [speed, setSpeed] = useState(sim.speed)
  const [ids, setIds] = useState(sim.ids)
  const [selected, setSelected] = useState<string | null>(sim.ids[0] ?? null)
  const [gap, setGap] = useState<number | null>(null)
  const [fps, setFps] = useState(0)
  const [open, setOpen] = useState(true)
  const [framing, setFraming] = useState<Framing>(DEFAULT_FRAMING)
  const lastStep = useRef<number | null>(null)

  // The simulation moves on in step with the view's frames: it is stepped when the view reads it.
  const source = () => {
    const now = performance.now()
    const dt = lastStep.current === null ? 0 : Math.min(0.05, (now - lastStep.current) / 1000)
    lastStep.current = now
    sim.step(dt)
    return sim.state()
  }

  useEffect(() => {
    sim.speed = speed
  }, [sim, speed])

  const shownGap = gap ?? (selected ? Math.round(sim.gapOf(selected) ?? 0) : 0)

  return (
    <main className={styles.screen}>
      <RaceView source={source} onFps={setFps} label="Race seen from behind the runner" framing={framing} />
      <section className={styles.panel} aria-label="Debug panel">
        <header className={styles.panelHead}>
          <strong>Race view demo</strong>
          <span className={styles.fps} aria-live="off">
            {fps} fps
          </span>
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? 'Hide' : 'Show'}
          </button>
        </header>
        {open && (
          <div className={styles.controls}>
            <label>
              Speed {speed.toFixed(1)} m/s
              <input type="range" min={0} max={8} step={0.1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
            </label>
            <label>
              Runner size {Math.round((1 - framing.headTop) * 100)}% of the screen
              <input
                type="range"
                min={20}
                max={60}
                step={1}
                value={Math.round((1 - framing.headTop) * 100)}
                onChange={(e) => setFraming({ ...framing, headTop: 1 - Number(e.target.value) / 100 })}
              />
            </label>
            <div className={styles.row}>
              <button
                type="button"
                onClick={() => {
                  const id = sim.add()
                  setIds(sim.ids)
                  setSelected(id)
                  setGap(null)
                }}
              >
                + rival
              </button>
              <button
                type="button"
                disabled={ids.length === 0}
                onClick={() => {
                  sim.remove(selected ?? undefined)
                  const next = sim.ids
                  setIds(next)
                  setSelected(next[next.length - 1] ?? null)
                  setGap(null)
                }}
              >
                − rival
              </button>
              <span>{ids.length} rivals</span>
            </div>
            {ids.length > 0 && (
              <>
                <label>
                  Rival
                  <select
                    value={selected ?? ''}
                    onChange={(e) => {
                      setSelected(e.target.value)
                      setGap(null)
                    }}
                  >
                    {ids.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Gap {shownGap} m {gap === null ? '(running)' : '(held)'}
                  <input
                    type="range"
                    min={GAP_MIN}
                    max={GAP_MAX}
                    step={1}
                    value={shownGap}
                    onChange={(e) => {
                      const value = Number(e.target.value)
                      setGap(value)
                      if (selected) sim.setGap(selected, value)
                    }}
                  />
                </label>
                <p className={styles.hint}>Negative gap: ahead of you. Positive: behind.</p>
                {gap !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selected) sim.setGap(selected, null)
                      setGap(null)
                    }}
                  >
                    Let it run
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
