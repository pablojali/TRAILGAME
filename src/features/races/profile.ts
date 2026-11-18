import { profileBetween, type Course } from '../../domain/races/course'
import { getRace } from '../../domain/races/races'
import { getRaceSegments, type RaceSegment } from '../../game-engine/raceEngine'
import { raceCourse } from './courses'

/** A profile: [metres from its start, elevation in metres]. */
export type Profile = [number, number][]

/**
 * The real course of a race and how its km map onto the race's (the race's km are the segments'
 * rounded sums): null when the race has no course from a GPX.
 */
function courseOf(raceId: string | undefined): { course: Course; kmPerRaceKm: number } | null {
  const course = raceId ? raceCourse(raceId) : null
  const race = raceId ? getRace(raceId) : undefined
  if (!course || !race) return null
  const totalM = getRaceSegments(race).reduce((sum, s) => sum + s.distanceM, 0)
  if (!(totalM > 0)) return null
  return { course, kmPerRaceKm: course.points[course.points.length - 1]![0] / (totalM / 1000) }
}

/**
 * A segment's elevation profile: the real one when the race has a course from a GPX (owner
 * design, 18 November 2026), else drawn from the segment's climbs and descents (relative).
 */
export function segmentProfile(raceId: string | undefined, segment: RaceSegment): Profile {
  const real = courseOf(raceId)
  if (real) {
    const k = real.kmPerRaceKm
    const from = segment.startM / 1000
    return profileBetween(real.course, from * k, (from + segment.distanceM / 1000) * k).map(([km, e]) => [(km / k - from) * 1000, e])
  }
  const points: Profile = [[0, 0]]
  let x = 0
  let y = 0
  for (const { block } of segment.pieces) {
    x += block.lengthM
    y += block.gainM - block.lossM
    points.push([x, y])
  }
  return points
}

/** The whole race's profile, real or drawn from its segments, with where each segment starts. */
export function raceProfile(raceId: string): { profile: Profile; cutsM: number[]; real: boolean } | null {
  const race = getRace(raceId)
  if (!race) return null
  const segments = getRaceSegments(race)
  const cutsM = segments.slice(1).map((s) => s.startM)
  const real = courseOf(raceId)
  if (real) {
    const k = real.kmPerRaceKm
    return { profile: real.course.points.map(([km, e]) => [(km / k) * 1000, e]), cutsM, real: true }
  }
  const profile: Profile = [[0, 0]]
  let y = 0
  for (const segment of segments) {
    let x = segment.startM
    for (const { block } of segment.pieces) {
      x += block.lengthM
      y += block.gainM - block.lossM
      profile.push([x, y])
    }
  }
  return { profile, cutsM, real: false }
}

/** The elevation of a profile at a distance (metres), interpolated. */
export function heightAt(profile: Profile, m: number): number {
  if (m <= profile[0]![0]) return profile[0]![1]
  for (let i = 1; i < profile.length; i++) {
    const [x1, y1] = profile[i]!
    if (x1 >= m) {
      const [x0, y0] = profile[i - 1]!
      return x1 > x0 ? y0 + ((y1 - y0) * (m - x0)) / (x1 - x0) : y1
    }
  }
  return profile[profile.length - 1]![1]
}

/** The race's real course and a converter from the race's metres to the course's km (null without a GPX). */
export function courseMapping(raceId: string): { course: Course; toCourseKm(raceM: number): number } | null {
  const real = courseOf(raceId)
  return real ? { course: real.course, toCourseKm: (raceM) => (raceM / 1000) * real.kmPerRaceKm } : null
}
