import { parseCsv } from '../../data/csv'
import coachCsv from '../../data/coach_moments.csv?raw'
import type { GameState } from '../../game-engine/gameState'
import type { Locale } from '../../i18n/i18n'
import { COACH_TARGETS, COACH_TRIGGERS } from './triggers'

/**
 * Trail Coach moments (owner requests, 8 and 9 November 2026): after the welcome, the coach comes
 * back at key points of a career, each moment once. They live in the owner's table
 * src/data/coach_moments.csv (edited in Trail Studio): when each appears (a trigger the game knows,
 * after or unless other moments), its steps, what each step points at and its texts. A step that
 * waits for a tap ends the moment when one of its targets is tapped (nothing else can be tapped); any
 * other step has a Next button.
 */
export type CoachLanguage = Exclude<Locale, 'en'>
const LANGUAGES: readonly CoachLanguage[] = ['es', 'fr', 'it', 'de']

export interface CoachStep {
  /** `data-coach` values of the elements to point at (all those on screen are highlighted). */
  targets: string[]
  /** Ends the moment when the player taps a target (it navigates by itself). */
  click: boolean
  title: Record<Locale, string>
  text: Record<Locale, string>
}

export interface CoachMoment {
  id: string
  trigger: string
  /** Moments that must have been seen first. */
  after: string[]
  /** Moments that, once seen, cancel this one. */
  unless: string[]
  steps: CoachStep[]
}

const list = (value: string | undefined) => (value ?? '').split(/\s+/).filter(Boolean)

/** Reads the coach table; throws with the row on any mistake. */
export function parseCoachMoments(text: string): CoachMoment[] {
  const moments: CoachMoment[] = []
  parseCsv(text).forEach((row, i) => {
    const where = `coach_moments.csv row ${i + 1}`
    const id = row.moment ?? ''
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) throw new Error(`${where}: moment must be lowercase words joined by hyphens`)
    const step = Number(row.step)
    let moment = moments.at(-1)
    if (moment?.id !== id) {
      if (moments.some((m) => m.id === id)) throw new Error(`${where}: the steps of ${id} must be together`)
      if (step !== 1) throw new Error(`${where}: ${id} must start at step 1`)
      if (!row.trigger || !COACH_TRIGGERS[row.trigger]) throw new Error(`${where}: unknown trigger "${row.trigger}"`)
      moment = { id, trigger: row.trigger, after: list(row.after), unless: list(row.unless), steps: [] }
      moments.push(moment)
    } else {
      if (step !== moment.steps.length + 1) throw new Error(`${where}: step ${row.step} of ${id} out of order`)
      if (row.trigger || row.after || row.unless) throw new Error(`${where}: trigger, after and unless go on step 1 only`)
    }
    const targets = list(row.targets)
    const unknown = targets.find((t) => !(t in COACH_TARGETS))
    if (unknown) throw new Error(`${where}: unknown target "${unknown}"`)
    if (row.tap !== '' && row.tap !== 'yes') throw new Error(`${where}: tap must be yes or empty`)
    if (row.tap === 'yes' && targets.length === 0) throw new Error(`${where}: a step that waits for a tap needs a target`)
    if (!row.title || !row.text) throw new Error(`${where}: the English title and text are required`)
    const title = { en: row.title } as Record<Locale, string>
    const body = { en: row.text } as Record<Locale, string>
    for (const language of LANGUAGES) {
      title[language] = row[`title_${language}`] || row.title
      body[language] = row[`text_${language}`] || row.text
    }
    moment.steps.push({ targets, click: row.tap === 'yes', title, text: body })
  })
  const ids = new Set(moments.map((m) => m.id))
  for (const m of moments) {
    const missing = [...m.after, ...m.unless].find((other) => !ids.has(other))
    if (missing) throw new Error(`coach_moments.csv: ${m.id} names an unknown moment "${missing}"`)
  }
  return moments
}

export const MOMENTS: readonly CoachMoment[] = parseCoachMoments(coachCsv)

export const MOMENT_IDS: readonly string[] = MOMENTS.map((moment) => moment.id)

/** The moment to show now, if any. Careers from before the coach (no progress) get none. */
export function currentMoment(state: GameState, pathname: string, moments: readonly CoachMoment[] = MOMENTS): CoachMoment | null {
  const coach = state.coach
  if (!coach?.welcomeDone) return null
  const seen = new Set(coach.seen ?? [])
  return (
    moments.find(
      (m) =>
        !seen.has(m.id) &&
        m.after.every((id) => seen.has(id)) &&
        !m.unless.some((id) => seen.has(id)) &&
        COACH_TRIGGERS[m.trigger]!.applies(state, pathname),
    ) ?? null
  )
}
