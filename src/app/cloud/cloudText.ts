import type { MessageKey } from '../../i18n/i18n'
import type { SyncStatus } from '../../repositories/cloudSync'

/** How the cloud save is described to the player (indicator label and Settings): text keys. */
export const CLOUD_STATUS_TEXT: Record<SyncStatus, MessageKey> = {
  off: 'cloud.off',
  connecting: 'cloud.connecting',
  synced: 'cloud.synced',
  syncing: 'cloud.syncing',
  pending: 'cloud.pending',
  conflict: 'cloud.conflict',
  error: 'cloud.error',
}
