import { OWNED_FROM_START } from '../../domain/equipment/items'
import { campSpots } from '../../game-engine/camp'
import { isEquipped } from '../../game-engine/equipment'
import type { GameState } from '../../game-engine/gameState'
import { isRaceDayToday } from '../../game-engine/raceSchedule'

/**
 * What the Trail Coach knows how to wait for (owner request, 9 November 2026): the triggers a moment
 * of src/data/coach_moments.csv may use, and the screen elements a step may point at (marked
 * `data-coach="…"` in the screens). Trail Studio offers these lists; a new trigger or element is
 * programmed here (and marked on its screen) before a moment can use it.
 */
export interface CoachTrigger {
  /** For Trail Studio (English). */
  label: string
  /** Whether the moment may appear now: the screen (path and query, e.g. "?view=interior") and the moment in the career. */
  applies(state: GameState, pathname: string, search: string): boolean
}

const hasFinishedRace = (state: GameState) => state.raceEntries.some((entry) => entry.status === 'finished')
/** A new career's first days: the first week, no race entered (the first steps in Base Camp). */
const isNewCareer = (state: GameState) => state.week.number === 1 && state.raceEntries.length === 0
/** The starter gear (level 0, everyone's from the start) not worn yet. */
const starterOff = (state: GameState) => OWNED_FROM_START.some((id) => !isEquipped(state, id))
const query = (search: string) => new URLSearchParams(search)
/** The gear button inside the refuge: the gear stand placed. */
const gearPlaced = (state: GameState) => campSpots(state, 'interior').some((spot) => spot.action === 'gear')
const inside = (p: string, q: string) => p === '/base-camp' && query(q).get('view') === 'interior'
const inRaceFlow = (pathname: string) => pathname.startsWith('/races/run/') || pathname.startsWith('/races/results/')

export const COACH_TRIGGERS: Record<string, CoachTrigger> = {
  // The first steps after the welcome (owner request, 19 November 2026): inside the refuge, then the starter gear.
  'open-camp-inside': {
    label: 'On going inside the refuge without the gear stand (new career, week 1)',
    applies: (s, p, q) => inside(p, q) && !query(q).get('customize') && isNewCareer(s) && !gearPlaced(s),
  },
  'open-camp-customize-gear': {
    label: 'In Customize, inside, without the gear stand (new career)',
    applies: (s, p, q) => inside(p, q) && query(q).get('customize') === '1' && isNewCareer(s) && !gearPlaced(s),
  },
  'camp-gear-placed': {
    label: 'Inside the refuge, with the gear stand and the starter gear not on (new career)',
    applies: (s, p, q) => inside(p, q) && !query(q).get('customize') && isNewCareer(s) && gearPlaced(s) && starterOff(s),
  },
  'open-equipment-starter': {
    label: 'On opening Equipment with the starter gear not on (new career)',
    applies: (s, p, q) => p === '/equipment' && !query(q).get('slot') && !query(q).get('tab') && isNewCareer(s) && starterOff(s),
  },
  'open-shoes-starter': {
    label: 'On opening the shoes in Equipment with the starter ones not on (new career)',
    applies: (s, p, q) => p === '/equipment' && query(q).get('slot') === 'shoes' && !query(q).get('item') && isNewCareer(s) && starterOff(s),
  },
  'open-starter-item': {
    label: 'On opening the starter gear\'s card, not on yet (new career)',
    applies: (s, p, q) => p === '/equipment' && OWNED_FROM_START.includes(query(q).get('item') ?? '') && isNewCareer(s) && starterOff(s),
  },
  'starter-equipped': {
    label: 'In Equipment, with the starter gear on (new career)',
    applies: (s, p) => p === '/equipment' && isNewCareer(s) && !starterOff(s),
  },
  'open-dashboard': { label: 'On opening the Dashboard', applies: (_s, p) => p === '/' },
  'open-training': { label: 'On opening Training', applies: (_s, p) => p === '/training' },
  'open-equipment': { label: 'On opening Equipment', applies: (_s, p) => p === '/equipment' },
  'open-appearance': { label: 'On opening Look', applies: (_s, p) => p === '/appearance' },
  'open-attributes': { label: 'On opening Attributes', applies: (_s, p) => p === '/attributes' },
  'open-races': { label: 'On opening the Races list', applies: (_s, p) => p === '/races' },
  'open-race-detail': { label: 'On opening a race\'s details', applies: (_s, p) => /^\/races\/RACE-\d+$/.test(p) },
  'open-race-prep': {
    label: 'On preparing a race (race day, before the start)',
    applies: (s, p) => p.startsWith('/races/run/') && s.activeRace === null && isRaceDayToday(s),
  },
  'open-race-result': { label: 'On seeing a race\'s result', applies: (_s, p) => p.startsWith('/races/results/') },
  'open-career': { label: 'On opening Career', applies: (_s, p) => p.startsWith('/career') },
  'open-settings': { label: 'On opening Settings', applies: (_s, p) => p === '/settings' },
  'first-week-done': {
    label: 'On finishing week 1 with no race entered (on the Dashboard or Training)',
    applies: (s, p) => (p === '/' || p === '/training') && s.week.number >= 2 && s.raceEntries.length === 0,
  },
  'first-race-done': {
    label: 'After the first race, on leaving the result (outside Career)',
    applies: (s, p) => !inRaceFlow(p) && !p.startsWith('/career') && hasFinishedRace(s),
  },
  'career-after-first-race': { label: 'On opening Career after the first race', applies: (s, p) => p.startsWith('/career') && hasFinishedRace(s) },
  pending: { label: 'New trigger: ask Claude (it does not show until programmed)', applies: () => false },
}

/** Screen elements a step may point at: `data-coach` value → where it is and what it is (Trail Studio, English). */
export const COACH_TARGETS: Record<string, string> = {
  attributes: 'Dashboard · attributes',
  condition: 'Dashboard · fitness and fatigue',
  'go-training': 'Dashboard · Train button',
  'nav-dashboard': 'Menu · Dashboard',
  'camp-customize': 'Base Camp · Customize button',
  'camp-gear': 'Base Camp · Gear button (the gear stand, inside the refuge)',
  'camp-gear-put': 'Customize · the gear stand\'s Place button',
  'gear-shoes': 'Equipment · shoes box',
  'gear-starter': 'Equipment · starter gear card (level 0)',
  'gear-equip': 'Equipment · a card\'s Equip button',
  'nav-training': 'Menu · Training',
  'nav-basecamp': 'Menu · Base Camp',
  'nav-races': 'Menu · Races',
  'nav-career': 'Menu · Career',
  week: 'Training · days of the week',
  session: 'Training · the day\'s session and its effects',
  'complete-day': 'Training · Complete button',
  'race-list': 'Races · race list',
  intensity: 'Preparation · segment 1 intensity',
  nutrition: 'Preparation · gel and bar',
  'start-race': 'Preparation · Start the race button',
}
