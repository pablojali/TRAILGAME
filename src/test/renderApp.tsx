import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes } from '../app/routes'
import type { GameState } from '../game-engine/gameState'
import { SAVE_KEY, SCHEMA_VERSION } from '../repositories/gameRepository'
import { newGame } from './gameFixtures'

/**
 * Renders the full app (shell, game provider, routes) at a path and waits until the saved career
 * has loaded (the repository is asynchronous).
 */
export async function renderApp(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const view = render(<RouterProvider router={router} />)
  await waitFor(() => expect(screen.queryByText('Loading your career…')).not.toBeInTheDocument())
  return { router, ...view }
}

/** Stores a v2 career so the app starts in play. Defaults to a new All-rounder. */
export function seedCareer(state: GameState = newGame()) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, savedAt: new Date(0).toISOString(), state }))
  return state
}

export function readSave(): { schemaVersion: number; state: GameState } | null {
  const raw = localStorage.getItem(SAVE_KEY)
  return raw === null ? null : JSON.parse(raw)
}
