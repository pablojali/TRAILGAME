import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS, type Attributes, type ProfileId } from '../domain/athlete/athlete'
import { PROFILE_IDS, PROFILES } from '../domain/athlete/profiles'
import { getRace, RACES, type Race } from '../domain/races/races'
import { RACE_SIMULATION } from '../domain/races/simulationConfig'
import {
  courseEffortKm,
  explainRace,
  generateCourse,
  getDayForm,
  InvalidCourseError,
  raceSeconds,
  referenceAthlete,
  rivalTimes,
  simulateRace,
  splitEvenly,
  type RaceAthleteInput,
} from './raceSimulation'

function race(id: string): Race {
  return getRace(id)!
}

function athlete(profile: ProfileId, fitness: number, fatigue: number, extra: Partial<Attributes> = {}): RaceAthleteInput {
  return { attributes: { ...PROFILES[profile].attributes, ...extra }, fitness, fatigue }
}

function hms(seconds: number): string {
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function synthetic(overrides: Partial<Race>): Race {
  return { ...race('RACE-001'), id: 'TEST', ...overrides }
}

describe('course generation', () => {
  it('splits integers exactly, remainders first', () => {
    expect(splitEvenly(7700, 3)).toEqual([2567, 2567, 2566])
    expect(splitEvenly(10, 5)).toEqual([2, 2, 2, 2, 2])
    expect(splitEvenly(1, 3)).toEqual([1, 0, 0])
  })

  it.each(RACES.map((r) => [r.id, r] as const))('%s: exact distance, ascent and effort, positive segments', (_, r) => {
    const course = generateCourse(r)
    const climbs = Math.ceil(r.elevationGainM / RACE_SIMULATION.maxGainPerClimbM)
    expect(course).toHaveLength(3 * climbs + 1)
    expect(course.map((s) => s.type).join(',')).toBe(
      ['runnable', ...Array.from({ length: climbs }, () => ['climb', 'descent', 'runnable']).flat()].join(','),
    )
    expect(course.reduce((sum, s) => sum + s.lengthM, 0)).toBe(r.distanceKm * 1000)
    expect(course.reduce((sum, s) => sum + s.gainM, 0)).toBe(r.elevationGainM)
    expect(course.reduce((sum, s) => sum + s.lossM, 0)).toBe(r.elevationGainM)
    expect(course.every((s) => Number.isInteger(s.lengthM) && s.lengthM > 0)).toBe(true)
    // The steepest catalog segment is 18.05 % (RACE-012); the limit for valid data is 40 %.
    expect(course.every((s) => (s.gainM + s.lossM) / s.lengthM < 0.181)).toBe(true)
    expect(course.filter((s) => s.type === 'descent').every((s) => s.technicality === r.technicality)).toBe(true)
    expect(courseEffortKm(course)).toBeCloseTo(r.distanceKm + r.elevationGainM / 100, 9)
  })

  it('uses the approved technicality per race (D6)', () => {
    expect(RACES.map((r) => r.technicality)).toEqual([0, 0, 1, 1, 2, 1, 2, 3, 2, 3, 3, 3])
  })

  it('handles edge cases', () => {
    expect(generateCourse(synthetic({ distanceKm: 10, elevationGainM: 0 }))).toEqual([
      { type: 'runnable', lengthM: 10000, gainM: 0, lossM: 0, technicality: 0 },
    ])
    expect(generateCourse(synthetic({ category: 'trail', distanceKm: 12, elevationGainM: 600 }))).toHaveLength(4)
    expect(generateCourse(synthetic({ category: 'trail', distanceKm: 12, elevationGainM: 601 }))).toHaveLength(7)
    for (const [distanceKm, elevationGainM] of [[1, 1], [5.5, 125], [7.777, 1001]] as const) {
      const course = generateCourse(synthetic({ category: 'elite', distanceKm, elevationGainM }))
      expect(course.reduce((sum, s) => sum + s.lengthM, 0)).toBe(Math.round(distanceKm * 1000))
      expect(course.reduce((sum, s) => sum + s.gainM, 0)).toBe(elevationGainM)
    }
  })

  it('rejects invalid courses', () => {
    expect(() => generateCourse(synthetic({ distanceKm: 2, elevationGainM: 1500 }))).toThrow(InvalidCourseError)
    expect(() => generateCourse(synthetic({ distanceKm: 0, elevationGainM: 0 }))).toThrow(InvalidCourseError)
    expect(() => generateCourse(synthetic({ elevationGainM: -5 }))).toThrow(InvalidCourseError)
  })
})

describe('race simulation — approved test cases (docs/race-simulation/results.md §3)', () => {
  it.each<[string, string, RaceAthleteInput, string, number]>([
    ['All-rounder F20 Fa0', 'RACE-001', athlete('all-rounder', 20, 0), '0:45:41', 24],
    ['All-rounder F80 Fa10', 'RACE-001', athlete('all-rounder', 80, 10), '0:37:04', 1],
    ['Sprinter F60 Fa20', 'RACE-001', athlete('sprinter', 60, 20), '0:40:54', 11],
    ['Climber F60 Fa20', 'RACE-001', athlete('climber', 60, 20), '0:43:01', 17],
    ['All-rounder F60 Fa0', 'RACE-004', athlete('all-rounder', 60, 0), '1:55:17', 20],
    ['All-rounder F60 Fa80', 'RACE-004', athlete('all-rounder', 60, 80), '2:25:12', 47],
    ['Climber F60 Fa20', 'RACE-007', athlete('climber', 60, 20), '4:24:01', 47],
    ['Sprinter F60 Fa20', 'RACE-007', athlete('sprinter', 60, 20), '4:32:51', 50],
    ['Endurance F60 Fa20', 'RACE-012', athlete('endurance', 60, 20), '18:18:42', 50],
    ['Climber F60 Fa20', 'RACE-012', athlete('climber', 60, 20), '18:37:41', 50],
  ])('%s in %s: %s, position %i', (_, id, input, time, position) => {
    const result = simulateRace(race(id), input)
    expect(hms(result.timeS)).toBe(time)
    expect(result).toMatchObject({ position, fieldSize: 50, dayForm: 0 })
  })

  it('places the typical runner 24th of 50 in every race', () => {
    for (const r of RACES) expect(simulateRace(r, referenceAthlete(r.recommendedLevel)).position).toBe(24)
  })

  it('gives each profile terrain where it is fastest', () => {
    const fastest = (id: string) =>
      PROFILE_IDS.reduce((best, p) =>
        simulateRace(race(id), athlete(p, 60, 20)).timeS < simulateRace(race(id), athlete(best, 60, 20)).timeS ? p : best,
      )
    expect(fastest('RACE-001')).toBe('sprinter')
    expect(fastest('RACE-004')).toBe('all-rounder')
    expect(fastest('RACE-008')).toBe('climber')
    expect(fastest('RACE-012')).toBe('endurance')
  })
})

describe('race simulation — properties', () => {
  const baseline = athlete('all-rounder', 50, 20)

  it('is deterministic', () => {
    expect(simulateRace(race('RACE-009'), athlete('climber', 63, 17), 0.012)).toEqual(
      simulateRace(race('RACE-009'), athlete('climber', 63, 17), 0.012),
    )
  })

  it('never gets slower with more Fitness or faster with more Fatigue', () => {
    for (const r of RACES) {
      const course = generateCourse(r)
      for (let v = 0; v < 100; v += 10) {
        expect(raceSeconds(course, { ...baseline, fitness: v + 10 })).toBeLessThan(raceSeconds(course, { ...baseline, fitness: v }))
        expect(raceSeconds(course, { ...baseline, fatigue: v + 10 })).toBeGreaterThan(raceSeconds(course, { ...baseline, fatigue: v }))
      }
    }
  })

  it('never gets slower when any attribute rises (1–100)', () => {
    for (const r of RACES) {
      const course = generateCourse(r)
      for (const id of ATTRIBUTE_IDS) {
        for (let v = 1; v < 100; v += 11) {
          const higher = { ...baseline, attributes: { ...baseline.attributes, [id]: v + 11 } }
          const lower = { ...baseline, attributes: { ...baseline.attributes, [id]: v } }
          expect(raceSeconds(course, higher)).toBeLessThanOrEqual(raceSeconds(course, lower))
        }
      }
    }
  })

  it('lets Consistency soften Fatigue (D9) and nothing else', () => {
    const course = generateCourse(race('RACE-004'))
    const consistent = { ...baseline, attributes: { ...baseline.attributes, consistency: 24 } }
    expect(raceSeconds(course, consistent) / raceSeconds(course, baseline) - 1).toBeCloseTo(-0.008, 3)
    expect(raceSeconds(course, { ...consistent, fatigue: 0 })).toBe(raceSeconds(course, { ...baseline, fatigue: 0 }))
  })

  it('applies day form as a plain factor on the time', () => {
    const course = generateCourse(race('RACE-004'))
    expect(raceSeconds(course, baseline, -0.02)).toBeCloseTo(raceSeconds(course, baseline) * 0.98, 6)
  })
})

describe('day form (D1)', () => {
  it('is fixed for an entry and matches the prototype', () => {
    const form = getDayForm('RACE-004', 'entry-1', 1767254400000, 16)
    expect(form).toBe(getDayForm('RACE-004', 'entry-1', 1767254400000, 16))
    expect(form * 100).toBeCloseTo(-1.515, 3)
  })

  it('stays within ±4 % × (1 − Consistency / 100) and is centred', () => {
    const forms = Array.from({ length: 2000 }, (_, i) => getDayForm('RACE-004', `entry-${i}`, 1767254400000 + i, 16))
    expect(forms.every((f) => Math.abs(f) <= 0.04 * 0.84)).toBe(true)
    expect(Math.abs(forms.reduce((s, f) => s + f, 0) / forms.length)).toBeLessThan(0.002)
    expect(Math.abs(getDayForm('RACE-004', 'entry-1', 1767254400000, 100))).toBe(0)
  })
})

describe('result explanation (D10)', () => {
  it('lists the three largest single effects against the typical runner, largest first', () => {
    const explanation = explainRace(race('RACE-004'), athlete('climber', 70, 30))
    expect(explanation.referenceTimeS).toBe(1 * 3600 + 59 * 60 + 37)
    expect(explanation.gapS).toBe(simulateRace(race('RACE-004'), athlete('climber', 70, 30)).timeS - explanation.referenceTimeS)
    expect(explanation.factors.map((f) => [f.id, f.value, f.effectS])).toEqual([
      ['fitness', 70, -721],
      ['speed', 13, 415],
      ['fatigue', 30, 221],
    ])
    expect(explanation.factors[0]!.reference).toBeCloseTo(47.41, 2)
  })

  it('never lists an input that had no effect', () => {
    // RACE-001 has no technical descents, and this athlete matches the typical runner (level 4) in
    // everything but Speed.
    const typical = referenceAthlete(4)
    const explanation = explainRace(race('RACE-001'), {
      ...typical,
      attributes: { ...typical.attributes, speed: 30 },
    })
    expect(explanation.factors.map((f) => f.id)).toEqual(['speed'])
  })

  it('reports day form as its own factor when it is large enough', () => {
    const explanation = explainRace(race('RACE-001'), referenceAthlete(4), -0.03)
    expect(explanation.factors).toEqual([
      { id: 'day-form', value: -0.03, reference: 0, effectS: expect.any(Number) },
    ])
    expect(explanation.factors[0]!.effectS).toBeLessThan(0)
  })
})

describe('attributes above 100 (no upper limit, 30 October 2026)', () => {
  it('removes the technical-descent penalty at Technical 100 but never turns it into a bonus', () => {
    const course = generateCourse(race('RACE-012'))
    const at = (technical: number) => {
      const a = athlete('all-rounder', 60, 20, { technical })
      return raceSeconds(course, a)
    }
    expect(at(100)).toBeLessThan(at(90))
    // Above 100 the time still improves through the ability curve, and stays finite.
    expect(at(150)).toBeLessThan(at(100))
    expect(Number.isFinite(at(500))).toBe(true)
  })
})

describe('equipment race effects (owner approval, 29 October 2026; balance review 30 October 2026)', () => {
  const base = athlete('all-rounder', 60, 20)
  const change = (id: string, equipment: string[]) => {
    const course = generateCourse(race(id))
    return raceSeconds(course, { ...base, equipment }) / raceSeconds(course, base) - 1
  }

  it.each<[string[], string, number]>([
    // Owner's catalog after the balance review (30 October 2026), All-rounder at Fitness 60, Fatigue 20; see results.md §10.
    [['poles'], 'RACE-001', -0.0014],
    [['poles'], 'RACE-004', -0.0085],
    [['poles'], 'RACE-012', -0.014],
    [['poles-2'], 'RACE-001', -0.0104],
    [['trail-shoes-basic'], 'RACE-004', -0.0105],
    [['trail-shoes'], 'RACE-004', -0.0114],
    [['trail-shoes'], 'RACE-012', -0.0362],
    [['trail-shoes-light'], 'RACE-001', -0.0389],
    [['trail-shoes-light'], 'RACE-012', -0.0008],
    [['hydration-backpack'], 'RACE-004', -0.01],
    [['hydration-backpack'], 'RACE-012', -0.0386],
    [['hydration-backpack-2'], 'RACE-012', -0.0626],
    [['trail-shoes-light', 'poles-2', 'hydration-backpack-2'], 'RACE-001', -0.06],
    [['trail-shoes', 'poles-2', 'hydration-backpack-2'], 'RACE-012', -0.1256],
  ])('%j in %s: %d', (equipment, id, expected) => {
    expect(change(id, equipment)).toBeCloseTo(expected, 4)
  })

  it('makes the shoes a choice of terrain: light shoes for runnable courses, technical shoes for technical ones', () => {
    expect(change('RACE-001', ['trail-shoes-light'])).toBeLessThan(change('RACE-001', ['trail-shoes']))
    expect(change('RACE-012', ['trail-shoes'])).toBeLessThan(change('RACE-012', ['trail-shoes-light']))
  })

  it('helps only where it makes sense, and the starter shoes do nothing', () => {
    // No technical descents in Forest First Steps: the technical shoes' bonuses change nothing there.
    expect(change('RACE-001', ['trail-shoes'])).toBe(0)
    expect(change('RACE-012', ['starter-shoes'])).toBe(0)
  })

  it('does not change the field: the typical runner has no equipment', () => {
    expect(rivalTimes(race('RACE-004'))).toEqual(rivalTimes(race('RACE-004')))
    expect(referenceAthlete(11).equipment).toBeUndefined()
  })

  it('appears in the explanation only when it changed the time', () => {
    const all = ['poles-2', 'trail-shoes', 'hydration-backpack-2']
    const ultra = explainRace(race('RACE-012'), { ...referenceAthlete(50), equipment: all })
    expect(ultra.factors[0]).toMatchObject({ id: 'equipment', value: 3, reference: 0 })
    expect(ultra.factors[0]!.effectS).toBeLessThan(0)
    const starter = explainRace(race('RACE-001'), { ...referenceAthlete(1), equipment: ['starter-shoes'] })
    expect(starter.factors.map((f) => f.id)).not.toContain('equipment')
  })
})
