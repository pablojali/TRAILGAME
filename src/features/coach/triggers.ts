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
  /** Whether the moment may appear now: the screen and the moment in the career. */
  applies(state: GameState, pathname: string): boolean
}

const hasFinishedRace = (state: GameState) => state.raceEntries.some((entry) => entry.status === 'finished')
const inRaceFlow = (pathname: string) => pathname.startsWith('/races/run/') || pathname.startsWith('/races/results/')

export const COACH_TRIGGERS: Record<string, CoachTrigger> = {
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
  'nav-training': 'Menú · Entreno',
  'nav-equipment': 'Menú · Equipo',
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
