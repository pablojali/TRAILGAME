/**
 * Remote copy of the career (M7, cloud save). The game stays local-first: the career is played and
 * saved in this browser as before, and a copy is kept in the cloud for a second device and for when
 * local data is lost. `src/sync/cloudSync.ts` decides which copy wins.
 */
export interface CloudSave {
  /** The saved career, untrusted until `parseGameState` accepts it. */
  state: unknown
  schemaVersion: number
  /** Raised by one on every write; used to detect a change made on another device. */
  version: number
  /** When the player last changed this copy (epoch ms). */
  changedAt: number
}

export type PushResult = { ok: true; version: number } | { ok: false; reason: 'conflict' }

export interface CloudStore {
  /** Signs the player in if needed (an anonymous account the first time). */
  connect(): Promise<void>
  /** The player's cloud copy, or null if there is none yet. */
  pull(): Promise<CloudSave | null>
  /**
   * Writes the career if the cloud copy is still at `baseVersion` (null: there is none yet).
   * Otherwise nothing is written and the result is a conflict.
   */
  push(save: Omit<CloudSave, 'version'>, baseVersion: number | null): Promise<PushResult>
  /** Deletes the player's cloud copy. */
  remove(): Promise<void>
}
