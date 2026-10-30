import type { SyncStatus } from '../../repositories/cloudSync'

/** How the cloud save is described to the player (indicator label and Settings). */
export const CLOUD_STATUS_TEXT: Record<SyncStatus, string> = {
  off: 'Saved on this device',
  connecting: 'Connecting to cloud save…',
  synced: 'Saved on this device and in the cloud',
  syncing: 'Saving to the cloud…',
  pending: 'Saved on this device; cloud save pending (it will retry)',
  conflict: 'Your device and the cloud have different careers: choose one',
  error: 'Cloud save unavailable; saved on this device',
}
