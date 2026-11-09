import type { GameState } from '../../game-engine/gameState'
import { isRaceDayToday } from '../../game-engine/raceSchedule'
import type { MessageKey } from '../../i18n/i18n'

/**
 * Trail Coach moments (owner request, 8 November 2026): after the welcome, the coach comes back at
 * key points of the first days of a career, each once: the Dashboard tour, the Training screen, the
 * end of the first week (to Races), the race list, the race preparation and, after the first race,
 * Career. Each step shows a text and may point at elements marked `data-coach="…"` on screen.
 * A `click` step waits for the player to tap one of its targets (nothing else can be tapped); any
 * other step has a Next button and the screen behind cannot be tapped.
 */
export type MomentId = 'dashboard' | 'training' | 'first-week' | 'race-list' | 'race-prep' | 'first-race' | 'career'

export interface CoachStep {
  tip: TipId
  /** `data-coach` values of the elements to point at (all those on screen are highlighted). */
  targets: string[]
  /** Ends the moment when the player taps a target (it navigates by itself). */
  click?: boolean
}

type TipId =
  | 'attributes'
  | 'condition'
  | 'plan'
  | 'week'
  | 'session'
  | 'complete'
  | 'firstWeek'
  | 'raceList'
  | 'intensity'
  | 'nutrition'
  | 'startRace'
  | 'firstRace'
  | 'career'

export interface CoachMoment {
  id: MomentId
  steps: CoachStep[]
  /** Whether the moment belongs on this screen and at this point of the career. */
  applies(state: GameState, pathname: string, seen: ReadonlySet<string>): boolean
  /** A target that must be on screen for the moment to start (e.g. the race's Start button). */
  requires?: string
}

const hasFinishedRace = (state: GameState) => state.raceEntries.some((entry) => entry.status === 'finished')
const inRaceFlow = (pathname: string) => pathname.startsWith('/races/run/') || pathname.startsWith('/races/results/')

/** In order: the first one not seen that applies is shown. */
export const MOMENTS: readonly CoachMoment[] = [
  {
    id: 'dashboard',
    steps: [
      { tip: 'attributes', targets: ['attributes'] },
      { tip: 'condition', targets: ['condition'] },
      { tip: 'plan', targets: ['nav-training', 'go-training'], click: true },
    ],
    applies: (_state, pathname) => pathname === '/',
  },
  {
    id: 'training',
    steps: [
      { tip: 'week', targets: ['week'] },
      { tip: 'session', targets: ['session'] },
      { tip: 'complete', targets: ['complete-day'] },
    ],
    applies: (_state, pathname, seen) => pathname === '/training' && seen.has('dashboard'),
    requires: 'complete-day',
  },
  {
    // The first week is over and no race entered yet: to Races.
    id: 'first-week',
    steps: [{ tip: 'firstWeek', targets: ['nav-races'], click: true }],
    applies: (state, pathname, seen) =>
      (pathname === '/' || pathname === '/training') &&
      seen.has('training') &&
      !seen.has('race-list') &&
      state.week.number >= 2 &&
      state.raceEntries.length === 0,
  },
  {
    id: 'race-list',
    steps: [{ tip: 'raceList', targets: ['race-list'] }],
    applies: (_state, pathname, seen) => pathname === '/races' && seen.has('dashboard'),
  },
  {
    id: 'race-prep',
    steps: [
      { tip: 'intensity', targets: ['intensity'] },
      { tip: 'nutrition', targets: ['nutrition'] },
      { tip: 'startRace', targets: ['start-race'] },
    ],
    applies: (state, pathname, seen) =>
      pathname.startsWith('/races/run/') && seen.has('dashboard') && state.activeRace === null && isRaceDayToday(state),
    requires: 'start-race',
  },
  {
    // After the first race (once its result has been left): to Career.
    id: 'first-race',
    steps: [{ tip: 'firstRace', targets: ['nav-career'], click: true }],
    applies: (state, pathname, seen) =>
      !inRaceFlow(pathname) && !pathname.startsWith('/career') && seen.has('dashboard') && !seen.has('career') && hasFinishedRace(state),
  },
  {
    id: 'career',
    steps: [{ tip: 'career', targets: [] }],
    applies: (state, pathname, seen) => pathname.startsWith('/career') && seen.has('dashboard') && hasFinishedRace(state),
  },
]

export const MOMENT_IDS: readonly MomentId[] = MOMENTS.map((moment) => moment.id)

/** The moment to show now, if any. Careers from before the coach (no progress) get none. */
export function currentMoment(state: GameState, pathname: string): CoachMoment | null {
  const coach = state.coach
  if (!coach?.welcomeDone) return null
  const seen = new Set(coach.seen ?? [])
  return MOMENTS.find((moment) => !seen.has(moment.id) && moment.applies(state, pathname, seen)) ?? null
}

export function tipTitle(tip: TipId): MessageKey {
  return `coach.tip.${tip}.title`
}

export function tipText(tip: TipId): MessageKey {
  return `coach.tip.${tip}.text`
}
