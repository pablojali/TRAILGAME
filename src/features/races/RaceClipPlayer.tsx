import { useI18n } from '../../i18n/i18n'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RaceClip } from './raceClips'
import styles from './RaceClipPlayer.module.css'

/** Longest wait for a clip to start playing before it is skipped (slow network, no autoplay). */
const START_TIMEOUT_MS = 5000

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * Plays a race clip over the whole screen (owner request, 3 November 2026). Muted and inline so
 * phones autoplay it. It closes when the clip has ended (or was skipped, failed, did not start in
 * time, or the player prefers reduced motion) and the race step it shows is confirmed (`ready`).
 */
export function RaceClipPlayer({
  clip,
  title,
  ready,
  onDone,
}: {
  clip: RaceClip
  /** e.g. "Segment 2 of 4 · 5.5 km". */
  title: string
  /** The server confirmed the segment: the clip may close. */
  ready: boolean
  onDone(): void
}) {
  const { t } = useI18n()
  const [ended, setEnded] = useState(prefersReducedMotion)
  const started = useRef(false)
  const done = useRef(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!started.current) setEnded(true)
    }, START_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (ended && ready && !done.current) {
      done.current = true
      onDone()
    }
  }, [ended, ready, onDone])

  // Over the whole app, top bar and tab bar included (rendered at the end of the page).
  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={title}>
      {!prefersReducedMotion() && (
        <video
          className={styles.video}
          autoPlay
          muted
          playsInline
          preload="auto"
          poster={clip.poster}
          onPlaying={() => {
            started.current = true
          }}
          onEnded={() => setEnded(true)}
          onError={() => setEnded(true)}
        >
          {clip.webm && <source src={clip.webm} type="video/webm" />}
          {clip.mp4 && <source src={clip.mp4} type="video/mp4" />}
        </video>
      )}
      <p className={styles.title}>{title}</p>
      {ended && !ready ? (
        <p className={styles.waiting} role="status">
          Running…
        </p>
      ) : (
        <button type="button" className={styles.skip} onClick={() => setEnded(true)}>
          {t('raceRun.skip')}
        </button>
      )}
    </div>,
    document.body,
  )
}
