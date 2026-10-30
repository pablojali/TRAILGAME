import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { GameState } from '../../game-engine/gameState'
import {
  createLocalStorageGameRepository,
  IncompatibleSaveError,
  SAVE_KEY,
  SaveError,
  SCHEMA_VERSION,
  type GameRepository,
} from '../../repositories/gameRepository'
import { createCloudSync, type CloudSync, type RemoteCareerStore } from '../../repositories/cloudSync'
import type { PlayerIdentity } from '../../repositories/supabase/playerIdentity'
import { newGame, T0, TEST_IDENTITY, withAthlete } from '../../test/gameFixtures'
import { GameProvider } from './GameProvider'
import { useGame, type GameContextValue } from './gameContext'

/** Exposes the game context to the test and shows the phase. */
function renderProvider(repository: GameRepository, identity: PlayerIdentity | null = null) {
  const game: { current: GameContextValue | null } = { current: null }
  function Probe() {
    game.current = useGame()
    return <p data-testid="phase">{game.current.phase.kind}</p>
  }
  render(
    <GameProvider repository={repository} clock={() => T0} identity={identity} cloud={null}>
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

/** A stand-in for the Supabase identity. */
function fakeIdentity() {
  return {
    start: vi.fn(async () => 'user-1'),
    status: () => 'signed-in' as const,
    stop: vi.fn(),
  } satisfies PlayerIdentity
}

/** A cloud that behaves like save_my_career (versions, conflicts); `down` simulates offline. */
function fakeCloudStore(initial: GameState | null = null) {
  let career: { version: number; state: GameState } | null = initial ? { version: 1, state: initial } : null
  const network = { down: false }
  const saves: number[] = []
  const store: RemoteCareerStore = {
    userId: async () => {
      if (network.down) throw new TypeError('Failed to fetch')
      return 'user-1'
    },
    fetch: async () => {
      if (network.down) throw new TypeError('Failed to fetch')
      return career && { version: career.version, schemaVersion: 2, state: structuredClone(career.state), updatedAt: 1 }
    },
    save: async (state, baseVersion) => {
      if (network.down) throw new TypeError('Failed to fetch')
      if ((career?.version ?? null) !== baseVersion) return { saved: false, version: career?.version ?? null }
      career = { version: (career?.version ?? 0) + 1, state: structuredClone(state) }
      saves.push(career.version)
      return { saved: true, version: career.version }
    },
  }
  return { store, network, saves, remote: () => career }
}

function renderWithCloud(repository: GameRepository, cloud: CloudSync) {
  const game: { current: GameContextValue | null } = { current: null }
  function Probe() {
    game.current = useGame()
    return <p data-testid="phase">{game.current.phase.kind}</p>
  }
  render(
    <GameProvider repository={repository} clock={() => T0} identity={fakeIdentity()} cloud={cloud}>
      <Probe />
    </GameProvider>,
  )
  return { game: () => game.current!, phase: () => screen.getByTestId('phase').textContent }
}

const localRepo = () => createLocalStorageGameRepository(localStorage, () => T0)

describe('GameProvider — cloud saves (Phase 2C)', () => {
  it('plays the local career at once and uploads it when the cloud has none (first migration)', async () => {
    const saved = withAthlete(newGame(), { xp: 300 })
    const raw = JSON.stringify({ schemaVersion: SCHEMA_VERSION, savedAt: 'x', state: saved })
    localStorage.setItem(SAVE_KEY, raw)
    const cloud = fakeCloudStore()
    const view = renderWithCloud(localRepo(), createCloudSync({ store: cloud.store, storage: localStorage, debounceMs: 0 }))
    await waitFor(() => expect(view.phase()).toBe('playing'))
    await waitFor(() => expect(cloud.remote()?.state).toEqual(saved))
    expect(view.game().cloudStatus).toBe('synced')
    // The local career is kept exactly as it was.
    expect(localStorage.getItem(SAVE_KEY)).toBe(raw)
  })

  it('restores the cloud career on a device with none, instead of offering a new career', async () => {
    const cloudCareer = withAthlete(newGame('climber'), { xp: 500 })
    const cloud = fakeCloudStore(cloudCareer)
    const view = renderWithCloud(localRepo(), createCloudSync({ store: cloud.store, storage: localStorage }))
    await waitFor(() => expect(view.phase()).toBe('playing'))
    const phase = view.game().phase
    expect(phase.kind === 'playing' && phase.state.athlete).toMatchObject({ profile: 'climber', xp: 500 })
    expect(view.game().cloudNotice).toBe('restored')
    await waitFor(() => expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).state.athlete.xp).toBe(500))
    expect(cloud.saves).toEqual([])
  })

  it('a new career on a new device is created in the cloud once', async () => {
    const cloud = fakeCloudStore()
    const view = renderWithCloud(localRepo(), createCloudSync({ store: cloud.store, storage: localStorage, debounceMs: 0 }))
    await waitFor(() => expect(view.phase()).toBe('new-career'))
    await act(async () => view.game().startCareer('climber', TEST_IDENTITY))
    await waitFor(() => expect(cloud.remote()?.state.athlete.profile).toBe('climber'))
    expect(cloud.saves).toEqual([1])
  })

  it('asks the player when the device and the cloud hold different careers, and keeps the chosen one', async () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: 2, savedAt: 'x', state: withAthlete(newGame(), { xp: 300 }) }))
    const cloud = fakeCloudStore(withAthlete(newGame('climber'), { xp: 900 }))
    const view = renderWithCloud(localRepo(), createCloudSync({ store: cloud.store, storage: localStorage }))
    await waitFor(() => expect(view.game().syncConflict).not.toBeNull())
    // Nothing was overwritten while waiting for the choice.
    expect(cloud.remote()!.state.athlete.xp).toBe(900)
    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).state.athlete.xp).toBe(300)
    await act(async () => {
      await view.game().resolveSyncConflict('cloud')
    })
    const phase = view.game().phase
    expect(phase.kind === 'playing' && phase.state.athlete.xp).toBe(900)
    await waitFor(() => expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).state.athlete.xp).toBe(900))
    expect(JSON.parse(localStorage.getItem('trailgame.save.backup')!).state.athlete.xp).toBe(300)
    expect(view.game().syncConflict).toBeNull()
  })

  it('plays normally offline: saves locally and reports the upload as pending', async () => {
    const cloud = fakeCloudStore()
    cloud.network.down = true
    const store = controlledRepository(null)
    const view = renderWithCloud(store.repo, createCloudSync({ store: cloud.store, storage: localStorage, debounceMs: 0, retryMs: 60_000 }))
    await store.finishLoad()
    await waitFor(() => expect(view.phase()).toBe('new-career'))
    await act(async () => view.game().startCareer('climber', TEST_IDENTITY))
    expect(view.phase()).toBe('playing')
    await waitFor(() => expect(store.stored()?.athlete.profile).toBe('climber'))
    expect(view.game().cloudStatus).toBe('pending')
    expect(cloud.remote()).toBeNull()
  })

  it('without Supabase the cloud is off and nothing changes', async () => {
    const view = renderProvider(controlledRepository(null).repo)
    expect(view.game().cloudStatus).toBe('off')
    expect(view.game().syncConflict).toBeNull()
  })
})
