import { parseCourse, type Course } from '../../domain/races/course'

/**
 * The real courses uploaded in Trail Studio (owner design, 18 November 2026): one file per race,
 * src/data/courses/RACE-xxx.json, made from the race's GPX. A race without one is drawn from its
 * segments, as before.
 */
const FILES = import.meta.glob('../../data/courses/*.json', { eager: true, import: 'default' }) as Record<string, unknown>

const COURSES = new Map<string, Course>()
for (const [path, value] of Object.entries(FILES)) {
  const id = /([A-Z]+-\d{3})\.json$/.exec(path)?.[1]
  const course = parseCourse(value)
  if (id && course) COURSES.set(id, course)
}

export function raceCourse(raceId: string): Course | null {
  return COURSES.get(raceId) ?? null
}
