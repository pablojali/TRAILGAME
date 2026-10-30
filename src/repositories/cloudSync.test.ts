import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameState } from '../game-engine/gameState'
import { execute, newGame, withAthlete } from '../test/gameFixtures'
import {
  canonicalJson,
  careerHash,
  createCloudSync,
  decide,
  LOCAL_BACKUP_KEY,
  SYNC_META_KEY,
  type RemoteCareer,
  type RemoteCareerStore,
  type SyncMeta,
} from './cloudSync'

/**
 * A fake cloud that behaves like save_my_career: one career, versions that rise by one, and a
 * write refused (nothing changed) unless it names the current version.
 */
function fakeCloud(initial: { state: unknown; version: number; schemaVersion?: number } | null = null) {
  let career: RemoteCareer | null = initial
    ? { version: initial.version, schemaVersion: initial.schemaVersion ?? 2, state: structuredClone(initial.state), updatedAt: 1 }
    : null
  const log: string[] = []
  const network = { down: false }
  let inFlight = 0
  let maxInFlight = 0
  const store: RemoteCareerStore = {
    async userId() {
      if (network.down) throw new TypeError('Failed to fetch')
      return 'user-1'
    },
    async fetch() {
      log.push('fetch')
      if (network.down) throw new TypeError('Failed to fetch')
      // As from the database: keys in another order.
      return career && { ...career, state: JSON.parse(canonicalJson(career.state)) }
    },
    async save(state, baseVersion) {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      try {
        await Promise.resolve()
        log.push(`save base=${baseVersion} xp=${state.athlete.xp}`)
        if (network.down) throw new TypeError('Failed to fetch')
        if (!career) {
          if (baseVersion !== null) return { saved: false, version: null }
          career = { version: 1, schemaVersion: 2, state: structuredClone(state), updatedAt: 2 }
          return { saved: true, version: 1 }
        }
        if (baseVersion !== career.version) return { saved: false, version: career.version }
        career = { version: career.version + 1, schemaVersion: 2, state: structuredClone(state), updatedAt: 3 }
        return { saved: true, version: career.version }
      } finally {
        inFlight--
      }
    },
  }
  return {
    store,
    log,
    network,
    remote: () => career,
    maxInFlight: () => maxInFlight,
    /** Another device writes a newer career. */
    otherDeviceWrites(state: GameState) {
      career = { version: career!.version + 1, schemaVersion: 2, state: structuredClone(state), updatedAt: 9 }
    },
  }
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

function metaOf(storage: ReturnType<typeof memoryStorage>): SyncMeta | null {
  const raw = storage.data.get(SYNC_META_KEY)
  return raw ? JSON.parse(raw) : null
}

function setup(cloud: ReturnType<typeof fakeCloud>, storage = memoryStorage()) {
  const adopted: GameState[] = []
  const sync = createCloudSync({ store: cloud.store, storage, debounceMs: 1_000, retryMs: 1_000, retryMaxMs: 8_000 })
  sync.connect({ adopt: (state) => adopted.push(state), changed: () => {} })
  return { sync, adopted, storage }
}

const progressed = (xp: number) => withAthlete(execute(newGame()).state, { xp })

afterEach(() => {
  vi.useRealTimers()
})

describe('first sync on a device', () => {
  it('local save only: uploads it as the cloud career, then confirms', async () => {
    const cloud = fakeCloud()
    const { sync, storage, adopted } = setup(cloud)
    const local = progressed(250)
    await sync.start(local)
    expect(cloud.log).toEqual(['fetch', 'save base=null xp=250'])
    expect(cloud.remote()).toMatchObject({ version: 1 })
    expect(cloud.remote()!.state).toEqual(local)
    expect(sync.status()).toBe('synced')
    expect(metaOf(storage)).toMatchObject({ userId: 'user-1', baseVersion: 1, pending: false })
    expect(adopted).toEqual([])
  })

  it('cloud career only: restores it, never creating a new one', async () => {
    const cloudCareer = progressed(400)
    const cloud = fakeCloud({ state: cloudCareer, version: 7 })
    const { sync, adopted } = setup(cloud)
    await sync.start(null)
    expect(adopted).toEqual([cloudCareer])
    expect(cloud.log).toEqual(['fetch'])
    expect(sync.status()).toBe('synced')
  })

  it('both present and equal: nothing to do', async () => {
    const career = progressed(300)
    const cloud = fakeCloud({ state: career, version: 4 })
    const { sync, adopted, storage } = setup(cloud)
    await sync.start(structuredClone(career))
    expect(cloud.log).toEqual(['fetch'])
    expect(adopted).toEqual([])
    expect(metaOf(storage)).toMatchObject({ baseVersion: 4, pending: false })
  })

  it('both present and different, never synced here: asks the player, changing nothing', async () => {
    const cloud = fakeCloud({ state: progressed(900), version: 5 })
    const { sync, adopted } = setup(cloud)
    const local = progressed(250)
    await sync.start(local)
    expect(sync.status()).toBe('conflict')
    expect(sync.conflict()).toMatchObject({ local, remoteVersion: 5 })
    expect(cloud.log).toEqual(['fetch'])
    expect(cloud.remote()!.state).toMatchObject({ athlete: { xp: 900 } })
    expect(adopted).toEqual([])
  })

  it('uploads over the untouched starting copy of the same runner (careers created in Phase 2A)', async () => {
    const start = newGame()
    const cloud = fakeCloud({ state: start, version: 1 })
    const { sync } = setup(cloud)
    await sync.start(progressed(250))
    expect(cloud.log).toEqual(['fetch', 'save base=1 xp=250'])
    expect(sync.status()).toBe('synced')
  })

  it('neither present: nothing until a career starts, which is created in the cloud once', async () => {
    vi.useFakeTimers()
    const cloud = fakeCloud()
    const { sync } = setup(cloud)
    await sync.start(null)
    expect(cloud.log).toEqual(['fetch'])
    const created = newGame()
    sync.localSaved(created)
    sync.localSaved(created)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(cloud.log).toEqual(['fetch', 'save base=null xp=0'])
    expect(cloud.remote()!.version).toBe(1)
  })

  it('a failed download changes nothing locally and retries', async () => {
    vi.useFakeTimers()
    const cloud = fakeCloud({ state: progressed(900), version: 5 })
    cloud.network.down = true
    const { sync, adopted } = setup(cloud)
    await sync.start(progressed(250))
    expect(sync.status()).toBe('pending')
    expect(adopted).toEqual([])
    cloud.network.down = false
    await vi.advanceTimersByTimeAsync(1_000)
    expect(sync.status()).toBe('conflict')
  })

  it('a failed upload keeps the local career pending and uploads it later', async () => {
    vi.useFakeTimers()
    const cloud = fakeCloud()
    const { sync, storage } = setup(cloud)
    const local = progressed(250)
    cloud.network.down = true
    await sync.start(local)
    expect(sync.status()).toBe('pending')
    cloud.network.down = false
    await vi.advanceTimersByTimeAsync(1_000)
    expect(cloud.remote()!.state).toEqual(local)
    expect(metaOf(storage)).toMatchObject({ baseVersion: 1, pending: false })
  })

  it('rejects an unsupported or damaged cloud career safely, asking before replacing it', async () => {
    const local = progressed(250)
    for (const bad of [
      fakeCloud({ state: progressed(900), version: 3, schemaVersion: 3 }),
      fakeCloud({ state: { athlete: 'broken' }, version: 3 }),
    ]) {
      const { sync, adopted } = setup(bad)
      await sync.start(local)
      expect(sync.status()).toBe('conflict')
      expect(sync.conflict()).toMatchObject({ remote: null, remoteVersion: 3 })
      expect(adopted).toEqual([])
      expect(bad.log).toEqual(['fetch'])
    }
    // With no local career, a damaged cloud career is not restored.
    const bad = fakeCloud({ state: { athlete: 'broken' }, version: 3 })
    const { sync, adopted } = setup(bad)
    await sync.start(null)
    expect(adopted).toEqual([])
  })
})

describe('ongoing sync', () => {
  it('uploads after a local save, batching rapid saves into one ordered upload', async () => {
    vi.useFakeTimers()
    const cloud = fakeCloud({ state: progressed(100), version: 1 })
    const storage = memoryStorage()
    const { sync } = setup(cloud, storage)
    await sync.start(progressed(100))
    sync.localSaved(progressed(110))
    sync.localSaved(progressed(120))
    sync.localSaved(progressed(130))
    expect(sync.status()).toBe('pending')
    expect(metaOf(storage)!.pending).toBe(true)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(cloud.log).toEqual(['fetch', 'save base=1 xp=130'])
    expect(cloud.remote()).toMatchObject({ version: 2 })
    expect(sync.status()).toBe('synced')
  })

  it('never overlaps uploads: a save during an upload goes next, on the new version', async () => {
    vi.useFakeTimers()
    const cloud = fakeCloud({ state: progressed(100), version: 1 })
    const { sync } = setup(cloud)
    await sync.start(progressed(100))
    sync.localSaved(progressed(110))
    await vi.advanceTimersByTimeAsync(1_000)
    sync.localSaved(progressed(120))
    sync.localSaved(progressed(130))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(cloud.log).toEqual(['fetch', 'save base=1 xp=110', 'save base=2 xp=130'])
    expect(cloud.maxInFlight()).toBe(1)
    expect(cloud.remote()!.state).toMatchObject({ athlete: { xp: 130 } })
  })

  it('keeps playing offline, retrying with growing delays, and uploads when back', async () => {
    vi.useFakeTimers()
    const cloud = fakeCloud({ state: progressed(100), version: 1 })
    const { sync } = setup(cloud)
    await sync.start(progressed(100))
    cloud.network.down = true
    sync.localSaved(progressed(150))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(sync.status()).toBe('pending')
    const attempts = () => cloud.log.filter((l) => l.startsWith('save')).length
    await vi.advanceTimersByTimeAsync(1_000) // retry after 1 s
    await vi.advanceTimersByTimeAsync(1_999) // the next waits 2 s
    expect(attempts()).toBe(2)
    cloud.network.down = false
    sync.retry() // back online
    await vi.advanceTimersByTimeAsync(0)
    expect(cloud.remote()!.state).toMatchObject({ athlete: { xp: 150 } })
    expect(sync.status()).toBe('synced')
  })

  it('a pending upload survives a restart and is sent at the next startup', async () => {
    vi.useFakeTimers()
    const cloud = fakeCloud({ state: progressed(100), version: 1 })
    const storage = memoryStorage()
    const first = setup(cloud, storage)
    await first.sync.start(progressed(100))
    cloud.network.down = true
    first.sync.localSaved(progressed(170))
    await vi.advanceTimersByTimeAsync(1_000)
    first.sync.stop()
    // The app is closed and opened again, online.
    cloud.network.down = false
    const second = setup(cloud, storage)
    await second.sync.start(progressed(170))
    expect(cloud.remote()).toMatchObject({ version: 2, state: { athlete: { xp: 170 } } })
  })

  it('another device wrote first: nothing is overwritten and the player chooses', async () => {
    vi.useFakeTimers()
    const cloud = fakeCloud({ state: progressed(100), version: 1 })
    const { sync } = setup(cloud)
    await sync.start(progressed(100))
    cloud.otherDeviceWrites(progressed(500))
    sync.localSaved(progressed(120))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(cloud.remote()!.state).toMatchObject({ athlete: { xp: 500 } })
    expect(sync.status()).toBe('conflict')
    expect(sync.conflict()).toMatchObject({ remoteVersion: 2, local: { athlete: { xp: 120 } } })
  })

  it('a newer cloud career replaces an unchanged local one at startup (played on another device)', async () => {
    const cloud = fakeCloud({ state: progressed(100), version: 1 })
    const storage = memoryStorage()
    const first = setup(cloud, storage)
    await first.sync.start(progressed(100))
    cloud.otherDeviceWrites(progressed(600))
    const second = setup(cloud, storage)
    await second.sync.start(progressed(100))
    expect(second.adopted).toEqual([progressed(600)])
    expect(cloud.log.filter((l) => l.startsWith('save'))).toEqual([])
  })
})

describe('conflict choice', () => {
  it('keeping this device replaces exactly the cloud copy the player saw', async () => {
    const cloud = fakeCloud({ state: progressed(900), version: 5 })
    const { sync } = setup(cloud)
    await sync.start(progressed(250))
    await expect(sync.resolve('local')).resolves.toEqual({ ok: true, adopt: null })
    expect(cloud.log).toEqual(['fetch', 'save base=5 xp=250'])
    expect(cloud.remote()).toMatchObject({ version: 6, state: { athlete: { xp: 250 } } })
    expect(sync.status()).toBe('synced')
  })

  it('keeping the cloud returns it to play, after a backup of the local career', async () => {
    const cloud = fakeCloud({ state: progressed(900), version: 5 })
    const { sync, storage } = setup(cloud)
    const local = progressed(250)
    await sync.start(local)
    const result = await sync.resolve('cloud')
    expect(result).toEqual({ ok: true, adopt: progressed(900) })
    expect(JSON.parse(storage.data.get(LOCAL_BACKUP_KEY)!).state).toEqual(local)
    expect(cloud.log).toEqual(['fetch'])
    expect(metaOf(storage)).toMatchObject({ baseVersion: 5, syncedHash: careerHash(progressed(900)) })
  })

  it('if the cloud changed again while choosing, nothing is overwritten and the new difference is shown', async () => {
    const cloud = fakeCloud({ state: progressed(900), version: 5 })
    const { sync } = setup(cloud)
    await sync.start(progressed(250))
    cloud.otherDeviceWrites(progressed(950))
    await expect(sync.resolve('local')).resolves.toEqual({ ok: false })
    expect(cloud.remote()!.state).toMatchObject({ athlete: { xp: 950 } })
    expect(sync.conflict()).toMatchObject({ remoteVersion: 6 })
  })

  it('a failed choice (offline) keeps the conflict and both careers', async () => {
    const cloud = fakeCloud({ state: progressed(900), version: 5 })
    const { sync } = setup(cloud)
    await sync.start(progressed(250))
    cloud.network.down = true
    await expect(sync.resolve('local')).resolves.toEqual({ ok: false })
    expect(sync.status()).toBe('conflict')
    expect(cloud.remote()!.state).toMatchObject({ athlete: { xp: 900 } })
  })

  it('does not upload during an unresolved conflict', async () => {
    vi.useFakeTimers()
    const cloud = fakeCloud({ state: progressed(900), version: 5 })
    const { sync } = setup(cloud)
    await sync.start(progressed(250))
    sync.localSaved(progressed(260))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(cloud.log).toEqual(['fetch'])
  })
})

describe('decide (pure)', () => {
  const remoteOf = (state: GameState, version: number): RemoteCareer => ({ version, schemaVersion: 2, state, updatedAt: 0 })

  it('never merges: every case is one whole career, or a question', () => {
    const a = progressed(200)
    const b = progressed(300)
    expect(decide(null, null, null, null)).toEqual({ action: 'none' })
    expect(decide(a, null, null, null)).toEqual({ action: 'push', baseVersion: null })
    expect(decide(null, remoteOf(b, 2), b, null)).toEqual({ action: 'adopt', state: b, version: 2 })
    expect(decide(a, remoteOf(b, 2), b, null)).toMatchObject({ action: 'conflict' })
    const meta: SyncMeta = { userId: 'u', baseVersion: 2, syncedHash: careerHash(b), pending: true }
    expect(decide(a, remoteOf(b, 2), b, meta)).toEqual({ action: 'push', baseVersion: 2 })
    expect(decide(a, remoteOf(b, 3), b, meta)).toMatchObject({ action: 'conflict' })
  })

  it('keeps every GameState field through the canonical comparison', () => {
    const career = progressed(250)
    const reordered = JSON.parse(canonicalJson(career))
    expect(reordered).toEqual(career)
    expect(careerHash(reordered)).toBe(careerHash(career))
    expect(careerHash(progressed(251))).not.toBe(careerHash(career))
  })
})
