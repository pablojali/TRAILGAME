import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { T0 } from './gameFixtures'

// jsdom does not implement scrolling; react-router's ScrollRestoration calls it.
// (Node-environment tests, such as the Edge Function bundle check, have no window.)
if (typeof window !== 'undefined') window.scrollTo = () => {}
// jsdom cannot play media: play() resolves at once, as a browser that allows playback.
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = () => Promise.resolve()
  HTMLMediaElement.prototype.pause = () => {}
}

// Only Date is faked, so timers used by user-event keep working; tests move time with
// vi.setSystemTime for deterministic Fitness decay.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: T0 })
})

afterEach(() => {
  cleanup()
  if (typeof localStorage !== 'undefined') localStorage.clear()
  vi.useRealTimers()
})

// The owner edits src/data/*.csv on GitHub (3 November 2026). Game tests run against fixed copies
// of those tables, so changing a price, name or level never breaks the checks; the real tables are
// only validated (src/data/tables.test.ts).
vi.mock('../data/equipment.csv?raw', async () => ({ default: (await import('./fixtures/equipment.csv?raw')).default }))
vi.mock('../data/race_field.csv?raw', async () => ({ default: (await import('./fixtures/race_field.csv?raw')).default }))
vi.mock('../data/achievements.csv?raw', async () => ({ default: (await import('./fixtures/achievements.csv?raw')).default }))
vi.mock('../data/ranking_points.csv?raw', async () => ({ default: (await import('./fixtures/ranking_points.csv?raw')).default }))
vi.mock('../data/races.csv?raw', async () => ({ default: (await import('./fixtures/races.csv?raw')).default }))
vi.mock('../data/levels.csv?raw', async () => ({ default: (await import('./fixtures/levels.csv?raw')).default }))
vi.mock('../domain/athlete/shirtFiles', () => import('./fixtures/shirtFiles'))
// The owner uploads race clips (assets/race/clips): game tests run without them, so an upload never
// changes a race flow under test; the player itself is tested with files it is given.
vi.mock('../features/races/raceClips', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/races/raceClips')>()
  return { ...actual, raceClip: (raceId: string, segment: number, files: Record<string, string> = {}) => actual.raceClip(raceId, segment, files) }
})
