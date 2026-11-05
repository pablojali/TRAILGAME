import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { T0 } from './gameFixtures'

// jsdom does not implement scrolling; react-router's ScrollRestoration calls it.
// (Node-environment tests, such as the Edge Function bundle check, have no window.)
if (typeof window !== 'undefined') window.scrollTo = () => {}

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
vi.mock('../data/levels.csv?raw', async () => ({ default: (await import('./fixtures/levels.csv?raw')).default }))
vi.mock('../domain/athlete/shirtFiles', () => import('./fixtures/shirtFiles'))
