import { describe, expect, it } from 'vitest'
import { buildCourse, courseLengthKm, courseSegments, courseStats, distanceM, elevationAt, evenCuts, parseCourse, parseGpx, type TrackPoint } from './course'

/** A straight track north from (42, 1): `km` long, its elevation given by `ele(km)`, a point every 10 m. */
function track(km: number, ele: (km: number) => number, noise = 0): TrackPoint[] {
  const points: TrackPoint[] = []
  for (let m = 0; m <= km * 1000; m += 10) {
    const jitter = noise ? (m / 10) % 2 === 0 ? noise : -noise : 0
    points.push({ lat: 42 + m / 111_195, lon: 1, ele: ele(m / 1000) + jitter })
  }
  return points
}

const gpx = (body: string) => `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>${body}</trkseg></trk></gpx>`

describe('courses from GPX (owner design, 18 November 2026)', () => {
  it('reads track points with their elevation, ignoring route points when there is a track', () => {
    const points = parseGpx(
      gpx(`<trkpt lat="42.0" lon="1.0"><ele>100</ele></trkpt><trkpt lat='42.001' lon='1.0'><ele>110.5</ele><time>x</time></trkpt><trkpt lat="42.002" lon="1.0"/>`) +
        '<rte><rtept lat="0" lon="0"><ele>1</ele></rtept></rte>',
    )
    expect(points).toEqual([{ lat: 42, lon: 1, ele: 100 }, { lat: 42.001, lon: 1, ele: 110.5 }, { lat: 42.002, lon: 1 }])
  })

  it('refuses a GPX without a course or without elevation', () => {
    expect(() => parseGpx('<gpx></gpx>')).toThrow(/recorrido/)
    expect(() => parseGpx(gpx('<trkpt lat="42" lon="1"/><trkpt lat="42.1" lon="1"/>'))).toThrow(/altitudes/)
  })

  it('measures the distance on the Earth', () => {
    expect(distanceM({ lat: 42, lon: 1 }, { lat: 43, lon: 1 })).toBeCloseTo(111_195, -1)
  })

  it('builds an evenly spaced course with its length, ascent and descent', () => {
    // 10 km: up 500 m over the first 5 km, down 300 m over the last 5.
    const course = buildCourse(track(10, (km) => (km <= 5 ? 1000 + km * 100 : 1500 - (km - 5) * 60)))
    expect(courseLengthKm(course)).toBeCloseTo(10, 1)
    expect(course.points.length).toBeLessThanOrEqual(1201)
    const stats = courseStats(course)
    expect(stats.distanceKm).toBe(10)
    expect(stats.gainM).toBeGreaterThan(470)
    expect(stats.gainM).toBeLessThan(510)
    expect(stats.lossM).toBeGreaterThan(270)
    expect(stats.lossM).toBeLessThan(310)
    expect(elevationAt(course, 5)).toBeGreaterThan(1450)
  })

  it('does not count GPS noise as climbing', () => {
    const flat = buildCourse(track(5, () => 800, 4))
    expect(courseStats(flat).gainM).toBeLessThan(15)
  })

  it('cuts the course into segments at the aid stations', () => {
    const course = buildCourse(track(12, (km) => 500 + km * 50))
    expect(evenCuts(course, 3)).toEqual([4, 8])
    const segments = courseSegments(course, [4, 8], [1, 2, 3])
    expect(segments.map((s) => [s.distanceKm, s.technicality])).toEqual([[4, 1], [4, 2], [4, 3]])
    expect(segments.reduce((sum, s) => sum + s.gainM, 0)).toBeGreaterThan(500)
  })

  it('reads a course file back, and nothing else', () => {
    const course = buildCourse(track(2, () => 100))
    expect(parseCourse(JSON.parse(JSON.stringify(course)))).toEqual(course)
    expect(parseCourse({ v: 2, points: [] })).toBeNull()
    expect(parseCourse({ v: 1, points: [[0, 1, 2]] })).toBeNull()
  })
})
