import { parseCourse, type Course } from '../domain/races/course'
import { raceCourse } from '../features/races/courses'
import type { Workspace } from './model'

/** Where a race's course file lives (built from its GPX). */
export const coursePath = (raceId: string) => `src/data/courses/${raceId}.json`

/** The race's course: this visit's upload (or its removal), else the published one. */
export function workspaceCourse(ws: Workspace, raceId: string): Course | null {
  const pending = ws.uploads[coursePath(raceId)]
  if (pending) {
    if (!pending.base64) return null
    try {
      const bytes = Uint8Array.from(atob(pending.base64), (c) => c.charCodeAt(0))
      return parseCourse(JSON.parse(new TextDecoder().decode(bytes)))
    } catch {
      return null
    }
  }
  return raceCourse(raceId)
}

