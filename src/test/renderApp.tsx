import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes } from '../app/routes'
import type { GameState } from '../game-engine/gameState'
import { createLocalStorageGameRepository, SAVE_KEY } from '../repositories/gameRepository'
import { newGame } from './gameFixtures'

/** Renders the full app (shell, game provider, routes) at a path. */
export function renderApp(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const view = render(<RouterProvider router={router} />)
  return { router, ...view }
}

/** Stores a v2 career so the app starts in play. Defaults to a new All-rounder. */
export function seedCareer(state: GameState = newGame()) {
  createLocalStorageGameRepository().save(state)
  return state
}

export function readSave(): { schemaVersion: number; state: GameState } | null {
  const raw = localStorage.getItem(SAVE_KEY)
  return raw === null ? null : JSON.parse(raw)
}
