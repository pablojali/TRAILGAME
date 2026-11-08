import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { useGame } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import type { CoachProgress } from '../../game-engine/gameState'
import { useI18n } from '../../i18n/i18n'
import { coachPortrait } from './coach'
import { currentMoment, MOMENT_IDS, tipText, tipTitle, type CoachMoment } from './moments'
import styles from './CoachGuide.module.css'

interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Room left around a highlighted element. */
const PAD = 6

/** Height the speech panel needs beside a highlight (px); with less, it goes to the bottom. */
const PANEL_ROOM = 230

/** Where the marked elements are on screen (visible ones only), re-measured as the layout moves. */
function useTargets(targets: readonly string[], requires: string | undefined, active: boolean) {
  const [found, setFound] = useState<{ boxes: Box[]; ready: boolean; key: string }>({ boxes: [], ready: false, key: '' })
  const signature = targets.join(' ')
  useLayoutEffect(() => {
    if (!active) return
    const measure = () => {
      const boxes: Box[] = []
      for (const target of signature ? signature.split(' ') : []) {
        for (const element of document.querySelectorAll(`[data-coach="${target}"]`)) {
          const rect = element.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) {
            boxes.push({ x: rect.left - PAD, y: rect.top - PAD, w: rect.width + 2 * PAD, h: rect.height + 2 * PAD })
          }
        }
      }
      const ready = !requires || document.querySelector(`[data-coach="${requires}"]`) !== null
      const key = `${ready}|${boxes.map((b) => [b.x, b.y, b.w, b.h].map(Math.round).join(',')).join(';')}`
      setFound((current) => (current.key === key ? current : { boxes, ready, key }))
    }
    measure()
    const timer = window.setInterval(measure, 150)
    window.addEventListener('resize', measure)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('resize', measure)
    }
  }, [signature, requires, active])
  return found
}

/** The screen's area outside the boxes, so taps only reach the highlighted elements. */
function outsidePath(boxes: Box[]): string {
  const outer = `M0 0H${window.innerWidth}V${window.innerHeight}H0Z`
  return `path(evenodd, '${outer}${boxes.map((b) => `M${b.x} ${b.y}h${b.w}v${b.h}h${-b.w}Z`).join('')}')`
}

/**
 * The Trail Coach's moments (src/features/coach/moments.ts): the screen dims, the elements the
 * coach talks about stay lit, and a speech panel with the coach explains them. Each moment is
 * saved as seen once finished (or all of them with Skip tips).
 */
export function CoachGuide() {
  const { phase, setCoachProgress } = useGame()
  const { pathname } = useLocation()
  const state = phase.kind === 'playing' ? phase.state : null
  const moment = state ? currentMoment(state, pathname) : null
  return state && moment ? <Guide key={moment.id} moment={moment} progress={state.coach!} setProgress={setCoachProgress} sex={state.athlete.sex} skin={state.athlete.appearance.skin} /> : null
}

function Guide({
  moment,
  progress,
  setProgress,
  sex,
  skin,
}: {
  moment: CoachMoment
  progress: CoachProgress
  setProgress(progress: CoachProgress): unknown
  sex: Parameters<typeof coachPortrait>[0]
  skin: Parameters<typeof coachPortrait>[1]
}) {
  const { t } = useI18n()
  const index = Math.min(progress.step ?? 0, moment.steps.length - 1)
  const step = moment.steps[index]!
  const { boxes, ready } = useTargets(step.targets, moment.requires, true)
  const action = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const seen = progress.seen ?? []

  const finish = () => setProgress({ ...progress, seen: [...new Set([...seen, moment.id])], step: 0 })
  const next = () => (index < moment.steps.length - 1 ? setProgress({ ...progress, step: index + 1 }) : finish())
  const skipAll = () => setProgress({ ...progress, seen: [...new Set([...seen, ...MOMENT_IDS])], step: 0 })

  // A tap on a highlighted element ends a click step; the element then does what it always does.
  const finishRef = useRef(finish)
  finishRef.current = finish
  useEffect(() => {
    if (!step.click) return
    const onClick = (event: MouseEvent) => {
      const marked = (event.target as Element | null)?.closest?.('[data-coach]')
      if (marked && step.targets.includes(marked.getAttribute('data-coach')!)) finishRef.current()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [step])

  // Each step is read from its panel; its button takes the focus.
  useEffect(() => {
    if (!ready) return
    if (action.current) action.current.focus()
    else panel.current?.focus()
  }, [ready, index])

  if (!ready) return null
  const portrait = coachPortrait(sex, skin)

  // The panel goes on the side with more room around what is highlighted.
  // When neither side has room (a tall highlight), it goes over the bottom of the screen.
  let place: React.CSSProperties | null = null
  if (boxes.length) {
    const top = Math.min(...boxes.map((b) => b.y))
    const bottom = Math.max(...boxes.map((b) => b.y + b.h))
    const below = window.innerHeight - bottom
    if (Math.max(below, top) >= PANEL_ROOM) place = below >= top ? { top: bottom + 10 } : { bottom: window.innerHeight - top + 10 }
  }

  return (
    <div className={styles.guide}>
      <svg className={styles.dim} width="100%" height="100%" aria-hidden="true">
        <defs>
          <mask id="coach-holes">
            <rect width="100%" height="100%" fill="white" />
            {boxes.map((b, i) => (
              <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="12" fill="black" />
            ))}
          </mask>
        </defs>
        <rect width="100%" height="100%" mask="url(#coach-holes)" />
      </svg>
      {boxes.map((b, i) => (
        <span key={i} className={styles.ring} style={{ left: b.x, top: b.y, width: b.w, height: b.h }} />
      ))}
      <div className={styles.blocker} style={step.click && boxes.length ? { clipPath: outsidePath(boxes) } : undefined} />

      <div
        ref={panel}
        className={`${styles.panel} ${place ? '' : styles.panelFree}`}
        style={place ?? undefined}
        role="dialog"
        aria-labelledby="coach-tip-title"
        aria-describedby="coach-tip-text"
        tabIndex={-1}
      >
        {portrait && <img className={styles.avatar} src={portrait} alt="" />}
        <div className={styles.body}>
          <p className={styles.speaker}>
            {t('coach.label')}
            {moment.steps.length > 1 && (
              <span className={styles.count}>
                {index + 1}/{moment.steps.length}
              </span>
            )}
          </p>
          <h2 id="coach-tip-title" className={styles.title}>
            {t(tipTitle(step.tip))}
          </h2>
          <p id="coach-tip-text" className={styles.text}>
            {t(tipText(step.tip))}
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.skip} onClick={skipAll}>
              {t('coach.skipTips')}
            </button>
            {!step.click && (
              <button ref={action} type="button" className={`${button.button} ${button.primary} ${styles.next}`} onClick={next}>
                {index < moment.steps.length - 1 ? t('coach.next') : t('coach.gotIt')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
