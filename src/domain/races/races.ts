import type { RaceCategory } from './categories'

/**
 * Initial race catalog (Game Design Bible §10.4). Fictional events; ids are stable and saved.
 * Recommended levels spread over the category ranges (owner decision, 29 October 2026).
 */
export interface Race {
  id: string
  name: string
  category: RaceCategory
  distanceKm: number
  elevationGainM: number
  terrain: string
  /** Intended level, not a requirement: below it the early-entry fee applies. */
  recommendedLevel: number
  /** Descent technicality, 0 (none) to 3 (high), used by the race simulation (owner decision D6). */
  technicality: number
}

export const RACES: readonly Race[] = [
  { id: 'RACE-001', name: 'Forest First Steps', category: 'open', distanceKm: 5, elevationGainM: 120, terrain: 'Non-technical forest paths', recommendedLevel: 1, technicality: 0 },
  { id: 'RACE-002', name: 'Riverside Trail', category: 'open', distanceKm: 8, elevationGainM: 220, terrain: 'Packed dirt, rolling hills', recommendedLevel: 4, technicality: 0 },
  { id: 'RACE-003', name: 'Pine Loop Challenge', category: 'open', distanceKm: 10, elevationGainM: 350, terrain: 'Forest trail, short climbs', recommendedLevel: 8, technicality: 1 },
  { id: 'RACE-004', name: 'Ridge Runner', category: 'trail', distanceKm: 12, elevationGainM: 550, terrain: 'Rolling ridges, mixed trail', recommendedLevel: 11, technicality: 1 },
  { id: 'RACE-005', name: 'Stone Path Classic', category: 'trail', distanceKm: 15, elevationGainM: 750, terrain: 'Rocky sections, moderate technicality', recommendedLevel: 14, technicality: 2 },
  { id: 'RACE-006', name: 'Wildwood Ascent', category: 'trail', distanceKm: 18, elevationGainM: 950, terrain: 'Sustained climbs, forest terrain', recommendedLevel: 18, technicality: 1 },
  { id: 'RACE-007', name: 'Summit Quest', category: 'mountain', distanceKm: 22, elevationGainM: 1300, terrain: 'Steep climbs, rocky descents', recommendedLevel: 21, technicality: 2 },
  { id: 'RACE-008', name: 'Alpine Traverse', category: 'mountain', distanceKm: 28, elevationGainM: 1700, terrain: 'Alpine paths, technical descents', recommendedLevel: 25, technicality: 3 },
  { id: 'RACE-009', name: 'Sky Ridge Ultra', category: 'mountain', distanceKm: 35, elevationGainM: 2200, terrain: 'Exposed ridges, sustained elevation', recommendedLevel: 28, technicality: 2 },
  { id: 'RACE-010', name: 'High Peaks Challenge', category: 'elite', distanceKm: 42, elevationGainM: 2800, terrain: 'Highly technical mountain terrain', recommendedLevel: 31, technicality: 3 },
  { id: 'RACE-011', name: 'Legends of the Crest', category: 'elite', distanceKm: 55, elevationGainM: 3600, terrain: 'Long mountain ultra, technical sections', recommendedLevel: 40, technicality: 3 },
  { id: 'RACE-012', name: 'Beyond the Skyline', category: 'elite', distanceKm: 70, elevationGainM: 4800, terrain: 'Extreme ultra, long climbs and descents', recommendedLevel: 50, technicality: 3 },
]

const BY_ID = new Map(RACES.map((race) => [race.id, race]))

export function getRace(id: string): Race | undefined {
  return BY_ID.get(id)
}

export function isRaceId(value: unknown): value is string {
  return typeof value === 'string' && BY_ID.has(value)
}
