import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { GameState } from '../../game-engine/gameState'
import { createCloudSync, type RemoteCareerStore } from '../../repositories/cloudSync'
import { createLocalStorageGameRepository, SAVE_KEY } from '../../repositories/gameRepository'
import type { CareerOpsCall } from '../../repositories/supabase/careerOpsClient'
import { handleCareerOp, type CareerOpsStore, type CareerRecord } from '../../server/careerOps'
import { enterRace } from '../../game-engine/races'
import { newGame, onSunday, T0, TEST_IDENTITY, withAthlete } from '../../test/gameFixtures'
import { GameProvider } from './GameProvider'
import { useGame, type GameContextValue } from './gameContext'

/**
 * The real client (GameProvider, cloud sync) talking to the real server handler (handleCareerOp)
 * over an in-memory database with commit_career's rules, and a switchable network.
 */
function world(initial: GameState | null) {
  const careers = new Map<string, CareerRecord>()
  const operations = new Map<string, { userId: string; response: unknown }>()
  if (initial) careers.set('ana', { version: 1, schemaVersion: 2, state: JSON.parse(JSON.stringify(initial)) })
  const network = { down: false, dropResponses: false }
  const requests: string[] = []
  const db: CareerOpsStore = {
    load: async (userId) => structuredClone(careers.get(userId) ?? null),
    operation: async (id) => structuredClone(operations.get(id) ?? null),
    async commit({ userId, baseVersion, state, operationId, response }) {
      if (operationId && operations.has(operationId)) {
        return { status: 'duplicate', version: careers.get(userId)?.version ?? null, response: operations.get(operationId)!.response }
      }
      const current = careers.get(userId)
      if ((current?.version ?? null) !== baseVersion) return { status: 'conflict', version: current?.version ?? null, response: null }
      const version = (current?.version ?? 0) + 1
      careers.set(userId, { version, schemaVersion: 2, state: JSON.parse(JSON.stringify(state)) })
      const stored = { ...(response ?? {}), version }
      if (operationId) operations.set(operationId, { userId, response: stored })
      return { status: 'saved', version, response: stored }
    },
  }
  const ops: CareerOpsCall = async (request) => {
    if (network.down) return { ok: false, error: 'offline' }
    requests.push(`${request.action}${'operationId' in request ? ` ${request.operationId}` : ''}`)
    const result = await handleCareerOp('token-ana', JSON.parse(JSON.stringify(request)), {
      store: db,
      authenticate: async (token) => (token === 'token-ana' ? 'ana' : null),
      now: () => T0 + 1000,
    })
    // The server answered but the response was lost on the way back.
    if (network.dropResponses) return { ok: false, error: 'offline' }
    return result.body
  }
  const remoteStore: RemoteCareerStore = {
    userId: async () => 'ana',
    fetch: async () => {
      const record = careers.get('ana')
      return record ? { version: record.version, schemaVersion: 2, state: structuredClone(record.state), updatedAt: 0 } : null
    },
    save: async (state, baseVersion) => {
      const response = await ops({ action: 'save', baseVersion, snapshot: state })
      if (response.ok) return { saved: true, version: response.version, state: response.state }
      if (response.error === 'conflict') return { saved: false, version: 'version' in response ? (response.version ?? null) : null }
      throw new Error(response.error)
    },
  }
  return {
    ops,
    network,
    requests,
    server: () => careers.get('ana')?.state as GameState | undefined,
    version: () => careers.get('ana')?.version,
    cloud: () => createCloudSync({ store: remoteStore, storage: localStorage, debounceMs: 0 }),
  }
}

function renderGame(w: ReturnType<typeof world>) {
  const game: { current: GameContextValue | null } = { current: null }
  function Probe() {
    game.current = useGame()
    return <p data-testid="phase">{game.current.phase.kind}</p>
  }
  render(
    <GameProvider repository={createLocalStorageGameRepository(localStorage, () => T0)} clock={() => T0} identity={null} cloud={w.cloud()} ops={w.ops}>
      <Probe />
    </GameProvider>,
  )
  const view = { game: () => game.current!, phase: () => screen.getByTestId('phase').textContent }
  return {
    ...view,
    playing: () => {
      const phase = view.game().phase
      if (phase.kind !== 'playing') throw new Error(`not playing: ${phase.kind}`)
      return phase.state
    },
    local: () => JSON.parse(localStorage.getItem(SAVE_KEY)!).state as GameState,
  }
}

function seedLocal(state: GameState) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: 2, savedAt: 'x', state }))
}

async function ready(view: ReturnType<typeof renderGame>, w: ReturnType<typeof world>) {
  await waitFor(() => expect(view.phase()).toBe('playing'))
  await waitFor(() => expect(view.game().cloudStatus).toBe('synced'))
  return w
}

describe('server-authoritative training (client and server together)', () => {
  it('a completed day is the server\'s result, played and saved locally without another upload', async () => {
    const w = world(newGame())
    seedLocal(newGame())
    const view = renderGame(w)
    await ready(view, w)
    let error: unknown
    await act(async () => {
      error = await view.game().executeDay({ week: 1, dayIndex: 0 })
    })
    expect(error).toBeNull()
    expect(view.playing()).toEqual(w.server())
    expect(view.playing().week.currentDayIndex).toBe(1)
    expect(view.playing().athlete.xp).toBeGreaterThan(0)
    await waitFor(() => expect(view.local()).toEqual(w.server()))
    expect(view.game().lastExecution?.outcome.xpGained).toBe(view.playing().athlete.xp)
    expect(w.requests.filter((r) => r.startsWith('save'))).toEqual([])
  })

  it('offline: no XP or progression locally, a clear error, and the retry applies it once', async () => {
    const w = world(newGame())
    seedLocal(newGame())
    const view = renderGame(w)
    await ready(view, w)
    w.network.down = true
    let error: unknown
    await act(async () => {
      error = await view.game().executeDay({ week: 1, dayIndex: 0 })
    })
    expect(error).toBe('offline')
    expect(view.playing()).toMatchObject({ athlete: { xp: 0 }, week: { currentDayIndex: 0 } })
    expect(w.version()).toBe(1)
    w.network.down = false
    await act(async () => {
      error = await view.game().executeDay({ week: 1, dayIndex: 0 })
    })
    expect(error).toBeNull()
    expect(view.playing().week.currentDayIndex).toBe(1)
    expect(w.version()).toBe(2)
  })

  it('a lost response is retried with the same operation id and never applied twice', async () => {
    const w = world(newGame())
    seedLocal(newGame())
    const view = renderGame(w)
    await ready(view, w)
    w.network.dropResponses = true
    await act(async () => {
      expect(await view.game().executeDay({ week: 1, dayIndex: 0 })).toBe('offline')
    })
    // The server did apply it; the device did not award anything.
    expect(w.version()).toBe(2)
    expect(view.playing().athlete.xp).toBe(0)
    w.network.dropResponses = false
    await act(async () => {
      expect(await view.game().executeDay({ week: 1, dayIndex: 0 })).toBeNull()
    })
    const trains = w.requests.filter((r) => r.startsWith('train'))
    expect(new Set(trains).size).toBe(1)
    expect(w.version()).toBe(2)
    expect(view.playing()).toEqual(w.server())
  })

  it('progression edited on the device is replaced by the server\'s on upload', async () => {
    const w = world(newGame())
    seedLocal(withAthlete(newGame(), { xp: 50_000 }))
    const view = renderGame(w)
    // The cloud career is untouched, so the device uploads; the server keeps its own progression.
    await waitFor(() => expect(w.version()).toBe(2))
    expect(w.server()!.athlete.xp).toBe(0)
    await waitFor(() => expect(view.playing().athlete.xp).toBe(0))
  })

  it('a conflicting device career cannot be kept; the cloud career is played', async () => {
    const w = world(withAthlete(newGame(), { xp: 300 }))
    seedLocal(withAthlete(newGame(), { xp: 50_000 }))
    const view = renderGame(w)
    await waitFor(() => expect(view.game().syncConflict).not.toBeNull())
    expect(view.game().canKeepDeviceCareer).toBe(false)
    await act(async () => {
      expect(await view.game().resolveSyncConflict('local')).toBe(false)
    })
    expect(w.server()!.athlete.xp).toBe(300)
    await act(async () => {
      expect(await view.game().resolveSyncConflict('cloud')).toBe(true)
    })
    expect(view.playing().athlete.xp).toBe(300)
  })

  it('a sync upload keeps the server\'s progression and the device adopts it', async () => {
    const w = world(withAthlete(newGame(), { xp: 300 }))
    seedLocal(withAthlete(newGame(), { xp: 300 }))
    const view = renderGame(w)
    await ready(view, w)
    // A changed look is the device's to change; it is uploaded and kept.
    await act(async () => {
      view.game().setAppearance({ ...view.playing().athlete.appearance, outfit: 'shirt-l1-01' })
    })
    await waitFor(() => expect(w.server()!.athlete.appearance.outfit).toBe('shirt-l1-01'))
    expect(w.server()!.athlete.xp).toBe(300)
  })

  it('runs the race and spends attribute points on the server', async () => {
    const sunday = onSunday(withAthlete(newGame(), { xp: 100 }))
    const w = world(sunday)
    const entered = enterRace(sunday, 'RACE-001', T0)
    if (!entered.ok) throw new Error(entered.error)
    seedLocal(sunday)
    const view = renderGame(w)
    await ready(view, w)
    await act(async () => {
      expect(await view.game().enterRace('RACE-001')).toBeNull()
    })
    // The entry is the server's (Phase 3B.2).
    expect(w.server()!.raceEntries).toMatchObject([{ raceId: 'RACE-001', status: 'pending' }])
    const entryId = view.playing().raceEntries[0]!.id
    let raced: Awaited<ReturnType<GameContextValue['raceDay']>> | undefined
    await act(async () => {
      raced = await view.game().raceDay({ week: 1, dayIndex: 6 }, entryId)
    })
    expect(raced?.ok).toBe(true)
    expect(w.server()!.raceEntries[0]!.status).toBe('finished')
    expect(view.playing()).toEqual(w.server())
    const spent = view.playing().athlete.spentAttributePoints
    await act(async () => {
      expect(await view.game().allocateAttributePoint('speed', spent)).toBeNull()
    })
    expect(w.server()!.athlete.spentAttributePoints).toBe(spent + 1)
  })

  it('buys and equips on the server; offline nothing is bought or charged', async () => {
    const w = world({ ...newGame(), coins: 100 })
    seedLocal({ ...newGame(), coins: 100 })
    const view = renderGame(w)
    await ready(view, w)
    w.network.down = true
    await act(async () => {
      expect(await view.game().buyItem('poles', 25)).toBe('offline')
    })
    expect(view.playing()).toMatchObject({ coins: 100, ownedEquipment: ['starter-shoes'] })
    expect(w.server()!.coins).toBe(100)
    w.network.down = false
    await act(async () => {
      expect(await view.game().buyItem('poles', 25)).toBeNull()
    })
    expect(w.server()).toMatchObject({ coins: 75, ownedEquipment: ['starter-shoes', 'poles'] })
    expect(view.playing()).toEqual(w.server())
    // The retry reused the operation id of the attempt that never reached the server.
    expect(w.requests.filter((r) => r.startsWith('buy'))).toHaveLength(1)
    await act(async () => {
      expect(await view.game().setItemEquipped('poles', true)).toBeNull()
    })
    expect(w.server()!.equipment).toEqual(['poles'])
    await act(async () => {
      expect(await view.game().buyItem('hydration-backpack-2', 90)).toBe('insufficient-coins')
    })
    expect(w.server()!.coins).toBe(75)
  })

  it('coins edited on the device are replaced by the server\'s on the next upload', async () => {
    const w = world({ ...newGame(), coins: 25 })
    seedLocal({ ...newGame(), coins: 25 })
    const view = renderGame(w)
    await ready(view, w)
    // A look change is uploaded with a snapshot whose coins were edited on the device.
    localStorage.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: 2, savedAt: 'x', state: { ...view.playing(), coins: 9_999 } }))
    await act(async () => {
      view.game().setAppearance({ ...view.playing().athlete.appearance, outfit: 'shirt-l1-01' })
    })
    await waitFor(() => expect(w.server()!.athlete.appearance.outfit).toBe('shirt-l1-01'))
    expect(w.server()!.coins).toBe(25)
    await waitFor(() => expect(view.playing().coins).toBe(25))
  })

  it('a new career is created by the server', async () => {
    const w = world(null)
    const view = renderGame(w)
    await waitFor(() => expect(view.phase()).toBe('new-career'))
    await act(async () => {
      expect(await view.game().startCareer('climber', TEST_IDENTITY)).toBeNull()
    })
    expect(w.server()).toMatchObject({ athlete: { profile: 'climber', xp: 0 } })
    expect(view.playing()).toEqual(w.server())
  })

  it('cannot start a career offline (nothing is created locally)', async () => {
    const w = world(null)
    const view = renderGame(w)
    await waitFor(() => expect(view.phase()).toBe('new-career'))
    w.network.down = true
    await act(async () => {
      expect(await view.game().startCareer('climber', TEST_IDENTITY)).toBe('offline')
    })
    expect(view.phase()).toBe('new-career')
    expect(localStorage.getItem(SAVE_KEY)).toBeNull()
  })
})
