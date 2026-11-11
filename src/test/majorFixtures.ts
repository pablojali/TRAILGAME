import type { MajorRewardPayload } from '../game-engine/majorRewards'
import { newGame } from './gameFixtures'

/** A Sunday Major result waiting for a player (phase 5): 12th of 50 on RACE-002, two segments. */
export function majorPayload(overrides: Partial<MajorRewardPayload> = {}): MajorRewardPayload {
  const athlete = newGame().athlete
  const finishedAt = Date.UTC(2026, 10, 15, 18, 30)
  return {
    eventId: '11111111-1111-4111-8111-111111111111',
    eventName: 'Major de Noviembre',
    raceId: 'RACE-002',
    position: 12,
    fieldSize: 50,
    timeS: 3600,
    startedAt: finishedAt - 30 * 60 * 1000,
    finishedAt,
    levelAtStart: 1,
    attributes: { ...athlete.attributes },
    fitness: athlete.fitness,
    fatigue: 10,
    equipment: [],
    dayForm: 0.1,
    finishFatigue: 30,
    splits: [
      { intensity: 'target', segmentS: 1800, arrivalS: 1800, fatigue: 20, position: 15, stop: 'normal', stopS: 60, fatigueAfterStop: 18 },
      { intensity: 'hard', segmentS: 1740, arrivalS: 3600, fatigue: 30, position: 12 },
    ],
    nutrition: { gel: false, bar: false },
    rivalTimesS: Array.from({ length: 49 }, (_, i) => 3300 + i * 25),
    ...overrides,
  }
}
