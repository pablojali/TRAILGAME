import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { GameState } from '../../game-engine/gameState'
import {
  createLocalStorageGameRepository,
  IncompatibleSaveError,
  SAVE_KEY,
  SaveError,
  SCHEMA_VERSION,
  type GameRepository,
} from '../../repositories/gameRepository'
import { newGame, T0, TEST_IDENTITY, withAthlete } from '../../test/gameFixtures'
import { GameProvider } from './GameProvider'
import { useGame, type GameContextValue } from './gameContext'

/** Exposes the game context to the test and shows the phase. */
function renderProvider(repository: GameRepository) {
  const game: { current: GameContextValue | null } = { current: null }
  function Probe() {
    game.current = useGame()
    return <p data-testid="phase">{game.current.phase.kind}</p>
  }
  render(
    <GameProvider repository={repository} clock={() => T0}>
      <Probe />
    </GameProvider>,
  )
  return { game: () => game.current!, phase: () => screen.getByTestId('phase').textContent }
}

/** A repository whose load and saves can be held back and failed by the test. */
function controlledRepository(initial: GameState | null) {
  let finishLoad: (state: GameState | null) => void = () => {}
  let failLoad: (error: unknown) => void = () => {}
  let failNextSaves = 0
  const writes: GameState[] = []
  let stored = initial
  const repo: GameRepository = {
    load: () =>
      new Promise((resolve, reject) => {
        finishLoad = resolve
        failLoad = reject
      }),
    save: async (state) => {
      if (failNextSaves > 0) {
        failNextSaves--
        throw new SaveError()
      }
      writes.push(state)
      stored = state
    },
    clear: async () => {
      stored = null
    },
  }
  return {
    repo,
    writes,
    stored: () => stored,
    finishLoad: (state = initial) => act(async () => finishLoad(state)),
    failLoad: (error: unknown) => act(async () => failLoad(error)),
    failSaves: (count: number) => {
      failNextSaves = count
    },
  }
}

describe('GameProvider — asynchronous loading and saving', () => {
  it('is loading until the save is read, and refuses game actions meanwhile', async () => {
    const store = controlledRepository(newGame())
    const view = renderProvider(store.repo)
    expect(view.phase()).toBe('loading')
    let error: unknown
    act(() => {
      error = view.game().planSession({ week: 1, dayIndex: 0 }, 'rest')
      view.game().resetCareer()
    })
    expect(error).toBe('wrong-week')
    expect(store.writes).toEqual([])

    await store.finishLoad()
    expect(view.phase()).toBe('playing')
    // Nothing to decay at load time, so loading writes nothing.
    expect(store.writes).toEqual([])
  })

  it('loads an existing schema v2 save from localStorage', async () => {
    const saved = withAthlete(newGame(), { xp: 120 })
    localStorage.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, savedAt: 'x', state: saved }))
    const view = renderProvider(createLocalStorageGameRepository(localStorage, () => T0))
    await waitFor(() => expect(view.phase()).toBe('playing'))
    const phase = view.game().phase
    expect(phase.kind === 'playing' && phase.state).toEqual(saved)
  })

  it('starts a new career when there is no save, and stores it', async () => {
    const store = controlledRepository(null)
    const view = renderProvider(store.repo)
    await store.finishLoad()
    expect(view.phase()).toBe('new-career')
    await act(async () => view.game().startCareer('climber', TEST_IDENTITY))
    expect(view.phase()).toBe('playing')
    await waitFor(() => expect(store.stored()?.athlete.profile).toBe('climber'))
  })

  it('shows an incompatible save without writing anything', async () => {
    const store = controlledRepository(null)
    const view = renderProvider(store.repo)
    await store.failLoad(new IncompatibleSaveError('legacy-v1'))
    expect(view.phase()).toBe('incompatible')
    expect(store.writes).toEqual([])
  })

  it('reports an unreadable save and loads again on retry', async () => {
    const store = controlledRepository(newGame())
    const view = renderProvider(store.repo)
    await store.failLoad(new Error('storage unavailable'))
    expect(view.phase()).toBe('load-failed')
    act(() => view.game().retryLoad())
    expect(view.phase()).toBe('loading')
    await store.finishLoad()
    expect(view.phase()).toBe('playing')
  })

  it('stores the latest state after rapid consecutive actions', async () => {
    const store = controlledRepository(withAthlete(newGame(), { xp: 100 }))
    const view = renderProvider(store.repo)
    await store.finishLoad()
    act(() => {
      view.game().allocateAttributePoint('speed', 0)
      view.game().allocateAttributePoint('speed', 1)
      view.game().allocateAttributePoint('speed', 2)
    })
    await waitFor(() => expect(store.stored()?.athlete.spentAttributePoints).toBe(2))
    // Writes never go backwards.
    const spent = store.writes.map((s) => s.athlete.spentAttributePoints)
    expect(spent).toEqual([...spent].sort())
  })

  it('reports a failed save, keeps the state, and recovers on the next save', async () => {
    const store = controlledRepository(withAthlete(newGame(), { xp: 100 }))
    const view = renderProvider(store.repo)
    await store.finishLoad()
    store.failSaves(1)
    await act(async () => {
      view.game().allocateAttributePoint('speed', 0)
    })
    await waitFor(() => expect(view.game().saveFailed).toBe(true))
    // The game goes on with the unsaved state.
    const phase = view.game().phase
    expect(phase.kind === 'playing' && phase.state.athlete.spentAttributePoints).toBe(1)

    await act(async () => {
      view.game().allocateAttributePoint('speed', 1)
    })
    await waitFor(() => expect(view.game().saveFailed).toBe(false))
    expect(store.stored()?.athlete.spentAttributePoints).toBe(2)
  })
})
