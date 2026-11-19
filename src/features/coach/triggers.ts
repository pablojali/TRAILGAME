import { OWNED_FROM_START } from '../../domain/equipment/items'
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
  /** For Trail Studio (Spanish). */
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
const inRaceFlow = (pathname: string) => pathname.startsWith('/races/run/') || pathname.startsWith('/races/results/')

export const COACH_TRIGGERS: Record<string, CoachTrigger> = {
  // The first steps after the welcome (owner request, 19 November 2026): inside the refuge, then the starter gear.
  'open-camp-inside': {
    label: 'Al entrar al interior del refugio (carrera nueva, 1ª semana)',
    applies: (s, p, q) => p === '/base-camp' && query(q).get('view') === 'interior' && isNewCareer(s),
  },
  'open-equipment-starter': {
    label: 'Al abrir Equipo con el equipo inicial sin poner (carrera nueva)',
    applies: (s, p, q) => p === '/equipment' && !query(q).get('slot') && !query(q).get('tab') && isNewCareer(s) && starterOff(s),
  },
  'open-shoes-starter': {
    label: 'Al abrir las zapatillas en Equipo con las iniciales sin poner (carrera nueva)',
    applies: (s, p, q) => p === '/equipment' && query(q).get('slot') === 'shoes' && !query(q).get('item') && isNewCareer(s) && starterOff(s),
  },
  'open-starter-item': {
    label: 'Al abrir la carta del equipo inicial sin poner (carrera nueva)',
    applies: (s, p, q) => p === '/equipment' && OWNED_FROM_START.includes(query(q).get('item') ?? '') && isNewCareer(s) && starterOff(s),
  },
  'starter-equipped': {
    label: 'En Equipo, con el equipo inicial puesto (carrera nueva)',
    applies: (s, p) => p === '/equipment' && isNewCareer(s) && !starterOff(s),
  },
  'open-dashboard': { label: 'Al abrir Inicio', applies: (_s, p) => p === '/' },
  'open-training': { label: 'Al abrir Entreno', applies: (_s, p) => p === '/training' },
  'open-equipment': { label: 'Al abrir Equipo', applies: (_s, p) => p === '/equipment' },
  'open-appearance': { label: 'Al abrir Aspecto', applies: (_s, p) => p === '/appearance' },
  'open-attributes': { label: 'Al abrir Atributos', applies: (_s, p) => p === '/attributes' },
  'open-races': { label: 'Al abrir la lista de Carreras', applies: (_s, p) => p === '/races' },
  'open-race-detail': { label: 'Al abrir el detalle de una carrera', applies: (_s, p) => /^\/races\/RACE-\d+$/.test(p) },
  'open-race-prep': {
    label: 'Al preparar una carrera (día de carrera, antes de salir)',
    applies: (s, p) => p.startsWith('/races/run/') && s.activeRace === null && isRaceDayToday(s),
  },
  'open-race-result': { label: 'Al ver el resultado de una carrera', applies: (_s, p) => p.startsWith('/races/results/') },
  'open-career': { label: 'Al abrir Trayectoria', applies: (_s, p) => p.startsWith('/career') },
  'open-settings': { label: 'Al abrir Ajustes', applies: (_s, p) => p === '/settings' },
  'first-week-done': {
    label: 'Al terminar la 1ª semana sin carrera inscrita (en Inicio o Entreno)',
    applies: (s, p) => (p === '/' || p === '/training') && s.week.number >= 2 && s.raceEntries.length === 0,
  },
  'first-race-done': {
    label: 'Después de la 1ª carrera, al salir del resultado (fuera de Trayectoria)',
    applies: (s, p) => !inRaceFlow(p) && !p.startsWith('/career') && hasFinishedRace(s),
  },
  'career-after-first-race': { label: 'Al abrir Trayectoria después de la 1ª carrera', applies: (s, p) => p.startsWith('/career') && hasFinishedRace(s) },
  pending: { label: 'Nuevo disparador: pídeselo a Claude (no aparece hasta programarlo)', applies: () => false },
}

/** Screen elements a step may point at: `data-coach` value → where it is and what it is (Spanish). */
export const COACH_TARGETS: Record<string, string> = {
  attributes: 'Inicio · atributos',
  condition: 'Inicio · fitness y fatiga',
  'go-training': 'Inicio · botón Entrenar',
  'nav-dashboard': 'Menú · Inicio',
  'camp-customize': 'Base Camp · botón Personalizar',
  'camp-gear': 'Base Camp · botón Equipo (dentro del refugio)',
  'gear-shoes': 'Equipo · casilla de zapatillas',
  'gear-starter': 'Equipo · carta del equipo inicial (nivel 0)',
  'gear-equip': 'Equipo · botón Equipar de una carta',
  'nav-training': 'Menú · Entreno',
  'nav-basecamp': 'Menú · Base Camp',
  'nav-races': 'Menú · Carreras',
  'nav-career': 'Menú · Trayectoria',
  week: 'Entreno · días de la semana',
  session: 'Entreno · sesión del día y sus efectos',
  'complete-day': 'Entreno · botón Completar',
  'race-list': 'Carreras · lista de carreras',
  intensity: 'Preparación · intensidad del tramo 1',
  nutrition: 'Preparación · gel y barrita',
  'start-race': 'Preparación · botón Empezar la carrera',
}
