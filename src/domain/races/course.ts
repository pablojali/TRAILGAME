/**
 * Real courses from GPX files (owner design, 18 November 2026): the owner uploads a race's GPX in
 * Trail Studio; the track becomes a course file (src/data/courses/RACE-xxx.json) with its profile
 * and route, and the race's distance, elevation and segments come from it. The game draws the real
 * profile in the preparation and the race, and the route on a map in the Majors.
 *
 * A course is a list of points along the route, evenly spaced: [km from the start, elevation in
 * metres, latitude, longitude]. Elevation is smoothed, so GPS noise does not add climbing.
 */
export type CoursePoint = [km: number, elevationM: number, lat: number, lon: number]

export interface Course {
  /** Format version. */
  v: 1
  points: CoursePoint[]
}

export interface CourseStats {
  distanceKm: number
  gainM: number
  lossM: number
}

/** A track point read from a GPX file. */
export interface TrackPoint {
  lat: number
  lon: number
  /** Missing when the GPX has no elevation for it. */
  ele?: number
}

/** Most points a course keeps (about 30 KB of JSON). */
export const MAX_COURSE_POINTS = 1200
/** The shortest step between kept points, in metres. */
const MIN_STEP_M = 20
/** Elevation is averaged over this distance (metres) before counting climbs. */
const SMOOTH_M = 120
/** A rise or drop counts once it adds up to this many metres (filters what is left of the noise). */
const HYSTERESIS_M = 3

/**
 * The points of a GPX file's tracks (or, without tracks, its route), in order. Throws in Spanish (the
 * owner reads it in Trail Studio) when there is nothing usable.
 */
export function parseGpx(text: string): TrackPoint[] {
  const points: TrackPoint[] = []
  const tag = /<(trkpt|rtept)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g
  const attr = (attrs: string, name: string) => {
    const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`).exec(attrs)
    return match ? Number(match[1]) : NaN
  }
  const hasTrack = /<trkpt\b/.test(text)
  for (const match of text.matchAll(tag)) {
    if (hasTrack && match[1] !== 'trkpt') continue
    const lat = attr(match[2]!, 'lat')
    const lon = attr(match[2]!, 'lon')
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue
    const ele = /<ele>\s*([^<]+?)\s*<\/ele>/.exec(match[4] ?? '')
    const elevation = ele ? Number(ele[1]) : NaN
    points.push(Number.isFinite(elevation) ? { lat, lon, ele: elevation } : { lat, lon })
  }
  if (points.length < 2) throw new Error('El GPX no tiene un recorrido (faltan puntos de track o de ruta).')
  if (!points.some((p) => p.ele !== undefined)) throw new Error('El GPX no tiene altitudes (<ele>): no se puede sacar el desnivel.')
  return points
}

/** Distance between two points on the Earth, in metres. */
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** The course of a track: evenly spaced points with smoothed elevation. */
export function buildCourse(track: readonly TrackPoint[]): Course {
  // Distance along the track; missing elevations take the last known one (or the first known).
  const firstEle = track.find((p) => p.ele !== undefined)!.ele!
  const along: { m: number; ele: number; lat: number; lon: number }[] = []
  let m = 0
  let ele = firstEle
  track.forEach((p, i) => {
    if (i > 0) m += distanceM(track[i - 1]!, p)
    if (p.ele !== undefined) ele = p.ele
    along.push({ m, ele, lat: p.lat, lon: p.lon })
  })
  const total = m
  if (!(total > 100)) throw new Error('El recorrido del GPX mide menos de 100 m.')

  // Evenly spaced samples, interpolated along the track.
  const step = Math.max(MIN_STEP_M, total / (MAX_COURSE_POINTS - 1))
  const count = Math.floor(total / step) + 1
  const samples: { m: number; ele: number; lat: number; lon: number }[] = []
  let j = 0
  for (let k = 0; k < count; k++) {
    const at = k === count - 1 ? total : k * step
    while (j < along.length - 2 && along[j + 1]!.m < at) j++
    const a = along[j]!
    const b = along[j + 1] ?? a
    const f = b.m > a.m ? Math.min(1, Math.max(0, (at - a.m) / (b.m - a.m))) : 0
    samples.push({ m: at, ele: a.ele + (b.ele - a.ele) * f, lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f })
  }
  if (samples[samples.length - 1]!.m < total) samples.push({ ...along[along.length - 1]!, m: total })

  // Elevation averaged over SMOOTH_M around each sample.
  const half = Math.max(1, Math.round(SMOOTH_M / step / 2))
  const smooth = samples.map((_, i) => {
    let sum = 0
    let n = 0
    for (let k = Math.max(0, i - half); k <= Math.min(samples.length - 1, i + half); k++) {
      sum += samples[k]!.ele
      n++
    }
    return sum / n
  })
  return {
    v: 1,
    points: samples.map((s, i) => [round(s.m / 1000, 3), round(smooth[i]!, 1), round(s.lat, 5), round(s.lon, 5)]),
  }
}

function round(value: number, digits: number): number {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

/** The course's length in km. */
export function courseLengthKm(course: Course): number {
  return course.points[course.points.length - 1]![0]
}

/** Elevation at a distance along the course (km), interpolated. */
export function elevationAt(course: Course, km: number): number {
  const pts = course.points
  if (km <= pts[0]![0]) return pts[0]![1]
  for (let i = 1; i < pts.length; i++) {
    if (pts[i]![0] >= km) {
      const [k0, e0] = pts[i - 1]!
      const [k1, e1] = pts[i]!
      return k1 > k0 ? e0 + ((e1 - e0) * (km - k0)) / (k1 - k0) : e1
    }
  }
  return pts[pts.length - 1]![1]
}

/** The profile between two distances (km): the points inside, with both ends interpolated. */
export function profileBetween(course: Course, fromKm: number, toKm: number): [km: number, elevationM: number][] {
  const inside = course.points.filter(([km]) => km > fromKm && km < toKm).map(([km, e]): [number, number] => [km, e])
  return [[fromKm, elevationAt(course, fromKm)], ...inside, [toKm, elevationAt(course, toKm)]]
}

/** Distance, ascent and descent between two distances (km), climbs counted past a small threshold. */
export function courseStats(course: Course, fromKm = 0, toKm = courseLengthKm(course)): CourseStats {
  const profile = profileBetween(course, fromKm, toKm)
  let gain = 0
  let loss = 0
  let anchor = profile[0]![1]
  for (const [, e] of profile) {
    const change = e - anchor
    if (change >= HYSTERESIS_M) {
      gain += change
      anchor = e
    } else if (change <= -HYSTERESIS_M) {
      loss -= change
      anchor = e
    }
  }
  return { distanceKm: round(toKm - fromKm, 1), gainM: Math.round(gain), lossM: Math.round(loss) }
}

/** A course file read back, or null if it is not one. */
export function parseCourse(value: unknown): Course | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as { v?: unknown; points?: unknown }
  if (v.v !== 1 || !Array.isArray(v.points) || v.points.length < 2) return null
  const points = v.points.filter((p): p is CoursePoint => Array.isArray(p) && p.length === 4 && p.every((n) => typeof n === 'number' && Number.isFinite(n)))
  return points.length === v.points.length ? { v: 1, points } : null
}

/**
 * The segments of a course cut at aid stations (km from the start, in order): each segment's
 * distance, ascent and descent from the course, with the technicality the owner gives it.
 */
export function courseSegments(course: Course, cutsKm: readonly number[], technicalities: readonly number[]): { distanceKm: number; gainM: number; lossM: number; technicality: number }[] {
  const ends = [0, ...cutsKm, courseLengthKm(course)]
  return ends.slice(1).map((end, i) => ({ ...courseStats(course, ends[i]!, end), technicality: technicalities[i] ?? 0 }))
}

/** Aid stations for `segments` equal segments of the course, at whole tenths of a km. */
export function evenCuts(course: Course, segments: number): number[] {
  const length = courseLengthKm(course)
  return Array.from({ length: Math.max(0, segments - 1) }, (_, i) => round((length * (i + 1)) / segments, 1))
}
