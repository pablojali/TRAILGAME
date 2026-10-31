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
