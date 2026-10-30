import type { GameState } from '../game-engine/gameState'
import { parseGameState, SCHEMA_VERSION } from './gameRepository'

/**
 * Cloud saves (Phase 2C). The game plays from ONE active GameState, saved locally first
 * (localStorage, as before); this module keeps a copy of it in the player's cloud career and
 * restores it on another device. It never makes play wait for the network, never merges two
 * careers and never overwrites a career silently: when the device and the cloud both changed, the
 * player chooses. It knows nothing about Supabase: the remote store is injected.
 *
 * The cloud copy is a backup, not anti-cheat: its values come from the client.
 */

/** The player's career as stored in the cloud. */
export interface RemoteCareer {
  version: number
  schemaVersion: number
  /** Untrusted until parseGameState accepts it. */
  state: unknown
  updatedAt: number
}

export type RemoteSaveResult =
  | { saved: true; version: number }
  /** Nothing written: the cloud is at another version (null: the expected career is gone). */
  | { saved: false; version: number | null }

export interface RemoteCareerStore {
  /** The signed-in user's id (waits for the shared sign-in). Rejects when offline. */
  userId(): Promise<string>
  fetch(): Promise<RemoteCareer | null>
  /** Saves if the cloud is still at `baseVersion` (null: no cloud career expected). */
  save(state: GameState, baseVersion: number | null): Promise<RemoteSaveResult>
}

/** What this device knows about its last sync, per user (kept in localStorage). */
export interface SyncMeta {
  userId: string
  /** The cloud version the local career was last in step with. */
  baseVersion: number | null
  /** Fingerprint of the career last confirmed in the cloud. */
  syncedHash: string | null
  /** Local changes not yet confirmed in the cloud. */
  pending: boolean
}

export const SYNC_META_KEY = 'trailgame.sync'
/** The local career replaced when the player keeps the cloud one (a safety copy, never read by the game). */
export const LOCAL_BACKUP_KEY = 'trailgame.save.backup'

export type SyncStatus =
  /** Supabase is not configured: local saves only. */
  | 'off'
  | 'connecting'
  | 'synced'
  | 'syncing'
  /** Local changes waiting to be uploaded (e.g. offline); retried automatically. */
  | 'pending'
  | 'conflict'
  /** The cloud copy cannot be used (unsupported or damaged); local play continues. */
  | 'error'

export interface CareerSummary {
  name: string
  level: number
  week: number
  coins: number
  races: number
}

export interface SyncConflict {
  local: GameState
  /** Null when the cloud copy is unreadable (damaged or from an unsupported version). */
  remote: GameState | null
  remoteVersion: number | null
  remoteUpdatedAt: number | null
}

export type Decision =
  | { action: 'none' }
  | { action: 'in-sync'; version: number }
  | { action: 'push'; baseVersion: number | null }
  | { action: 'adopt'; state: GameState; version: number }
  | { action: 'conflict'; conflict: SyncConflict }

/** Same JSON whatever the key order (the database reorders keys). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** A short fingerprint of a career (FNV-1a over its canonical JSON). */
export function careerHash(state: GameState): string {
  const text = canonicalJson(state)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${(hash >>> 0).toString(16)}-${text.length}`
}

/** The cloud career as a GameState, or null if it is unsupported or damaged. */
export function readRemoteState(remote: RemoteCareer, now: number): GameState | null {
  if (remote.schemaVersion !== SCHEMA_VERSION) return null
  return parseGameState(remote.state, now)
}

/**
 * True when the cloud career is the untouched start of the local one: the copy Phase 2A created
 * when the runner was made (Level 1, week 1, no races), for the same runner. Uploading the local
 * progress over it loses nothing.
 */
function isUntouchedStartOf(remote: GameState, local: GameState): boolean {
  return (
    remote.athlete.xp === 0 &&
    remote.week.number === 1 &&
    remote.week.currentDayIndex === 0 &&
    remote.raceEntries.length === 0 &&
    remote.athlete.name === local.athlete.name &&
    remote.athlete.profile === local.athlete.profile &&
    remote.athlete.sex === local.athlete.sex
  )
}

/**
 * What to do with the local and the cloud career (pure). `meta` is this device's sync record for
 * the signed-in user, or null (never synced here, or another user).
 */
export function decide(
  local: GameState | null,
  remote: RemoteCareer | null,
  remoteState: GameState | null,
  meta: SyncMeta | null,
): Decision {
  if (!remote) return local ? { action: 'push', baseVersion: null } : { action: 'none' }
  if (!remoteState) {
    return local
      ? { action: 'conflict', conflict: { local, remote: null, remoteVersion: remote.version, remoteUpdatedAt: remote.updatedAt } }
      : { action: 'none' }
  }
  if (!local) return { action: 'adopt', state: remoteState, version: remote.version }
  const localHash = careerHash(local)
  if (localHash === careerHash(remoteState)) return { action: 'in-sync', version: remote.version }
  // The cloud has not changed since this device last synced: the local career is newer.
  if (meta && meta.baseVersion === remote.version) return { action: 'push', baseVersion: remote.version }
  // The cloud changed elsewhere and the local career has not changed since it was synced.
  if (meta && meta.baseVersion !== null && !meta.pending && meta.syncedHash === localHash) {
    return { action: 'adopt', state: remoteState, version: remote.version }
  }
  if (isUntouchedStartOf(remoteState, local)) return { action: 'push', baseVersion: remote.version }
  return {
    action: 'conflict',
    conflict: { local, remote: remoteState, remoteVersion: remote.version, remoteUpdatedAt: remote.updatedAt },
  }
}

export function summarize(state: GameState, level: (xp: number) => number): CareerSummary {
  return {
    name: state.athlete.name,
    level: level(state.athlete.xp),
    week: state.week.number,
    coins: state.coins,
    races: state.raceEntries.filter((entry) => entry.status === 'finished').length,
  }
}

export interface CloudSyncHandlers {
  /** The cloud career replaces the local one (restore, or a newer cloud career with no local changes). */
  adopt(state: GameState): void
  /** Status or conflict changed. */
  changed(): void
}

export interface CloudSync {
  status(): SyncStatus
  conflict(): SyncConflict | null
  connect(handlers: CloudSyncHandlers): void
  /**
   * Compares the local career (null: none on this device) with the cloud one, once at startup.
   * Resolves when decided; never throws. Offline: local play continues and it retries.
   */
  start(local: GameState | null): Promise<void>
  /** Call after every successful local save; uploads it (debounced, ordered). */
  localSaved(state: GameState): void
  /** The player chose in a conflict. 'cloud' returns the career to play; 'local' uploads this device's. */
  resolve(choice: 'local' | 'cloud'): Promise<{ ok: true; adopt: GameState | null } | { ok: false }>
  /** Retries now (back online, app visible, player pressed retry). */
  retry(): void
  stop(): void
}

export interface CloudSyncOptions {
  store: RemoteCareerStore
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  now?: () => number
  /** Delay before uploading after a local save (rapid saves are batched). */
  debounceMs?: number
  /** First retry delay after a network failure; doubles up to `retryMaxMs`. */
  retryMs?: number
  retryMaxMs?: number
}

export function createCloudSync({
  store,
  storage,
  now = Date.now,
  debounceMs = 2_000,
  retryMs = 5_000,
  retryMaxMs = 300_000,
}: CloudSyncOptions): CloudSync {
  let state: SyncStatus = 'connecting'
  let handlers: CloudSyncHandlers | null = null
  let userId: string | null = null
  let meta: SyncMeta | null = null
  let started = false
  let currentConflict: SyncConflict | null = null
  /** The newest local career not yet confirmed in the cloud. */
  let latest: GameState | null = null
  let uploading: Promise<void> | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let retryDelay = retryMs

  /** Also reports a changed conflict while the status stays 'conflict'. */
  function setStatus(next: SyncStatus) {
    state = next
    handlers?.changed()
  }

  function readMeta(id: string): SyncMeta | null {
    try {
      const raw = storage?.getItem(SYNC_META_KEY)
      const parsed = raw ? (JSON.parse(raw) as SyncMeta) : null
      return parsed && parsed.userId === id ? parsed : null
    } catch {
      return null
    }
  }

  function writeMeta(next: SyncMeta) {
    meta = next
    try {
      storage?.setItem(SYNC_META_KEY, JSON.stringify(next))
    } catch {
      // Without storage the sync still works for this session.
    }
  }

  function synced(version: number, career: GameState) {
    writeMeta({ userId: userId!, baseVersion: version, syncedHash: careerHash(career), pending: false })
    retryDelay = retryMs
  }

  function schedule(delay: number) {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void run()
    }, delay)
  }

  function offline() {
    setStatus('pending')
    schedule(retryDelay)
    retryDelay = Math.min(retryDelay * 2, retryMaxMs)
  }

  function enterConflict(conflict: SyncConflict) {
    currentConflict = conflict
    setStatus('conflict')
  }

  /** Applies a decision (uploading if needed). */
  async function apply(decision: Decision): Promise<void> {
    switch (decision.action) {
      case 'none':
        setStatus('synced')
        return
      case 'in-sync':
        synced(decision.version, latest!)
        latest = null
        setStatus('synced')
        return
      case 'adopt':
        synced(decision.version, decision.state)
        latest = null
        handlers?.adopt(decision.state)
        setStatus('synced')
        return
      case 'conflict':
        enterConflict(decision.conflict)
        return
      case 'push':
        await upload(decision.baseVersion)
    }
  }

  /** Uploads the latest local career on top of `baseVersion`. */
  async function upload(baseVersion: number | null): Promise<void> {
    const career = latest
    if (!career) return
    setStatus('syncing')
    const result = await store.save(career, baseVersion)
    if (result.saved) {
      synced(result.version, career)
      // A newer local save arrived during the upload: upload that one next.
      if (latest === career) latest = null
      if (latest) schedule(0)
      else setStatus('synced')
      return
    }
    // Someone else wrote first (another device), or the career is gone: compare again.
    const remote = await store.fetch()
    await apply(decide(latest, remote, remote ? readRemoteState(remote, now()) : null, meta))
  }

  /** One sync step: the first comparison, or uploading pending changes. Never overlaps. */
  function run(): Promise<void> {
    if (uploading) return uploading
    uploading = (async () => {
      try {
        if (currentConflict) return
        if (!userId) {
          userId = await store.userId()
          meta = readMeta(userId)
        }
        if (!started) {
          const remote = await store.fetch()
          started = true
          await apply(decide(latest, remote, remote ? readRemoteState(remote, now()) : null, meta))
          return
        }
        if (latest) await upload(meta?.baseVersion ?? null)
      } catch {
        offline()
      } finally {
        uploading = null
      }
    })()
    return uploading
  }

  return {
    status: () => state,
    conflict: () => currentConflict,
    connect(next) {
      handlers = next
    },

    async start(local) {
      latest = local
      await run()
    },

    localSaved(career) {
      if (meta?.syncedHash === careerHash(career) && !latest) return
      latest = career
      if (userId) writeMeta({ ...(meta ?? { userId, baseVersion: null, syncedHash: null }), pending: true })
      if (currentConflict) return
      if (!started) return
      if (state !== 'syncing') setStatus('pending')
      schedule(debounceMs)
    },

    async resolve(choice) {
      const conflict = currentConflict
      if (!conflict || !userId) return { ok: false }
      try {
        if (choice === 'cloud') {
          if (!conflict.remote || conflict.remoteVersion === null) return { ok: false }
          try {
            storage?.setItem(LOCAL_BACKUP_KEY, JSON.stringify({ savedAt: new Date(now()).toISOString(), state: conflict.local }))
          } catch {
            // The backup is a courtesy; the choice was explicit.
          }
          synced(conflict.remoteVersion, conflict.remote)
          latest = null
          currentConflict = null
          setStatus('synced')
          return { ok: true, adopt: conflict.remote }
        }
        // Keep this device's career: replace the cloud copy the player saw, and only that one.
        latest = latest ?? conflict.local
        setStatus('syncing')
        const result = await store.save(latest, conflict.remoteVersion)
        if (!result.saved) {
          // The cloud changed again while choosing: show the new difference.
          const remote = await store.fetch()
          const decision = decide(latest, remote, remote ? readRemoteState(remote, now()) : null, null)
          if (decision.action === 'conflict') currentConflict = decision.conflict
          setStatus('conflict')
          return { ok: false }
        }
        synced(result.version, latest)
        latest = null
        currentConflict = null
        setStatus('synced')
        return { ok: true, adopt: null }
      } catch {
        setStatus('conflict')
        return { ok: false }
      }
    },

    retry() {
      if (currentConflict) return
      if (state === 'pending' || state === 'connecting') {
        retryDelay = retryMs
        schedule(0)
      }
    },

    /** Cancels a scheduled step (when the game unmounts); a later save or retry resumes. */
    stop() {
      if (timer !== null) clearTimeout(timer)
      timer = null
    },
  }
}
