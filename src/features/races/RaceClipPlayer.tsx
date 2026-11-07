import { useI18n } from '../../i18n/i18n'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RaceClip } from './raceClips'
import styles from './RaceClipPlayer.module.css'

/** Longest wait for a clip to start playing before it is skipped (slow network, no autoplay). */
const START_TIMEOUT_MS = 5000

/** The player's sound choice, kept on the device (owner request, 7 November 2026: clips have sound). */
const SOUND_KEY = 'trailgame.clipSound'

function soundWanted(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

function saveSound(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off')
  } catch {
    // The choice only lasts this visit.
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * Plays a race clip over the whole screen (owner request, 3 November 2026), inline and with its
 * ambient sound (owner request, 7 November 2026). When the browser does not allow sound without a
 * tap, it plays muted and the sound button turns it on; the player's choice is remembered. It closes when the clip has ended (or was skipped, failed, did not start in
 * time) and the race step it shows is confirmed (`ready`).
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
  // With "reduce motion" on, the clip waits on its poster for a tap instead of playing by itself
  // (owner report, 7 November 2026: skipping it outright showed only a black flash).
  const [reduced] = useState(prefersReducedMotion)
  const [waitingTap, setWaitingTap] = useState(reduced)
  const [ended, setEnded] = useState(false)
  const started = useRef(false)
  const done = useRef(false)
  const video = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(() => !soundWanted())

  // Start with sound when the player wants it; if the browser refuses, play muted instead.
  useEffect(() => {
    const element = video.current
    if (!element || waitingTap) return
    element.muted = !soundWanted()
    const playing = element.play?.()
    if (playing && typeof playing.catch === 'function') {
      playing.catch(() => {
        if (!element.muted) {
          element.muted = true
          setMuted(true)
          void element.play?.()?.catch?.(() => {})
        }
      })
    }
  }, [waitingTap])

  function toggleSound() {
    const element = video.current
    const next = !muted
    setMuted(next)
    saveSound(!next)
    if (element) {
      element.muted = next
      // A tap allows sound: resume if the browser had held the video back.
      if (element.paused) void element.play?.()?.catch?.(() => {})
    }
  }

  // A clip that does not start in time is skipped (not while it waits for a tap).
  useEffect(() => {
    if (waitingTap) return
    const timer = window.setTimeout(() => {
      if (!started.current) setEnded(true)
    }, START_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [waitingTap])

  useEffect(() => {
    if (ended && ready && !done.current) {
      done.current = true
      onDone()
    }
  }, [ended, ready, onDone])

  // Over the whole app, top bar and tab bar included (rendered at the end of the page).
  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <video
        ref={video}
        className={styles.video}
        autoPlay={!reduced}
        muted={muted}
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
      <p className={styles.title}>{title}</p>
      {waitingTap && !ended && (
        <button type="button" className={styles.play} onClick={() => setWaitingTap(false)}>
          <span aria-hidden="true">▶ </span>
          {t('raceRun.playClip')}
        </button>
      )}
      <button
        type="button"
        className={styles.sound}
        aria-pressed={!muted}
        aria-label={muted ? t('raceRun.soundOn') : t('raceRun.soundOff')}
        onClick={toggleSound}
      >
        <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
      </button>
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
