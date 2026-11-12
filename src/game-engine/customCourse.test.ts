import { describe, expect, it } from 'vitest'
import { getMaximumLevel, getMinimumLevel } from '../domain/races/access'
import { formatSegments, getRace, parseRaces, withCourse, courseOf } from '../domain/races/races'
import { getRaceField, getRaceSegments, getSegmentCount } from './raceEngine'
import { courseEffortKm, generateCourse } from './raceSimulation'

const HEADER =
  'id,name,category,distance_km,elevation_gain_m,recommended_level,technicality,terrain,min_level,max_level,stop_quick_s,stop_normal_s,stop_slow_s,segments'
const row = (cells: string) => parseRaces(`${HEADER}\n${cells}`)[0]!

describe('Races set by hand in Trail Studio (owner request, 12 November 2026)', () => {
  it('cuts the course where the owner put the aid stations, with each segment’s own ascent and descent', () => {
    const race = row('RACE-900,Test,trail,21.5,1300,10,3,Rocky,,,,,,6.5:800:100:1|8:0:900:4|7:500:300:2')
    expect(race).toMatchObject({ distanceKm: 21.5, elevationGainM: 1300, technicality: 4 })
    expect(getSegmentCount(race)).toBe(3)
    const segments = getRaceSegments(race)
    expect(segments.map((s) => s.distanceM)).toEqual([6500, 8000, 7000])
    expect(segments.map((s) => Math.round(s.gainM))).toEqual([800, 0, 500])
    expect(segments.map((s) => Math.round(s.lossM))).toEqual([100, 900, 300])
    expect(segments.map((s) => s.technicality)).toEqual([1, 4, 2])
    // The course adds up to the race; effort counts each segment's ascent.
    expect(generateCourse(race).reduce((sum, b) => sum + b.lengthM, 0)).toBe(21500)
    expect(courseEffortKm(generateCourse(race))).toBeCloseTo(21.5 + 13, 6)
    // The rivals' field builds on it.
    expect(getRaceField(race).segments).toHaveLength(3)
  })

  it('takes entry levels and stop seconds set by hand; empty is automatic', () => {
    const race = row('RACE-901,Test,open,10,200,8,0,Paths,3,12,20,60,150,')
    expect([getMinimumLevel(race), getMaximumLevel(race)]).toEqual([3, 12])
    expect(getRaceField(race).stopS).toEqual({ quick: 20, normal: 60, slow: 150 })
    const auto = row('RACE-902,Test,open,10,200,8,0,Paths,,,,,,')
    expect([getMinimumLevel(auto), getMaximumLevel(auto)]).toEqual([3, 10])
    expect(getSegmentCount(auto)).toBe(2)
  })

  it('refuses tables that do not add up or cannot be run', () => {
    expect(() => row('RACE-903,Test,trail,20,1300,10,3,Rocky,,,,,,6.5:800:100:1|8:0:900:4|7:500:300:2')).toThrow(/sums/)
    expect(() => row('RACE-904,Test,trail,2,1500,10,3,Rocky,,,,,,1:900:0:1|1:600:0:1')).toThrow(/do not fit/)
    expect(() => row('RACE-905,Test,trail,5,0,10,0,Flat,,,,,,5:0:0:0')).toThrow(/2 to 20 segments/)
    expect(() => row('RACE-906,Test,open,10,200,8,0,Paths,,,60,20,150,')).toThrow(/quick ≤ normal ≤ slow/)
    expect(() => row('RACE-907,Test,open,10,200,8,0,Paths,9,5,,,,')).toThrow(/below min_level/)
  })

  it('a race in progress keeps the course it started on', () => {
    const catalog = getRace('RACE-007')!
    const kept = courseOf(catalog)
    const edited = { ...catalog, segments: [{ distanceKm: catalog.distanceKm / 2, gainM: catalog.elevationGainM, lossM: 0, technicality: 1 }, { distanceKm: catalog.distanceKm / 2, gainM: 0, lossM: catalog.elevationGainM, technicality: 1 }] }
    expect(formatSegments(edited.segments)).toContain('|')
    expect(getSegmentCount(withCourse(edited, kept))).toBe(getSegmentCount(catalog))
    expect(withCourse(edited, kept).segments).toBeUndefined()
  })
})
