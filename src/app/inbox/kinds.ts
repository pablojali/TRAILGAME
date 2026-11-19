import { parseCsv } from '../../data/csv'
import notificationsCsv from '../../data/notifications.csv?raw'
import type { InboxKind } from './inbox'

/** The notifications the game creates by itself; announcements are the owner's and always shown. */
export const AUTOMATIC_KINDS = [
  'race',
  'challenge',
  'level',
  'season',
  'race-day',
  'decay',
  'cloud',
  'ranking',
  'visit',
  'congrats',
  'message',
  'friend-request',
  'friend-accepted',
] as const satisfies readonly InboxKind[]

/**
 * The automatic notifications turned off (owner request, 19 November 2026), from the owner's table
 * src/data/notifications.csv (edited in Trail Studio). A kind missing from the table is shown.
 */
export function parseNotificationKinds(text: string): Set<InboxKind> {
  const off = new Set<InboxKind>()
  const seen = new Set<string>()
  parseCsv(text).forEach((row, i) => {
    const where = `notifications.csv row ${i + 1}`
    const kind = row.kind ?? ''
    if (!(AUTOMATIC_KINDS as readonly string[]).includes(kind)) throw new Error(`${where}: unknown kind "${kind}"`)
    if (seen.has(kind)) throw new Error(`${where}: ${kind} is listed twice`)
    seen.add(kind)
    if (row.on !== 'yes' && row.on !== 'no') throw new Error(`${where}: on must be yes or no`)
    if (row.on === 'no') off.add(kind as InboxKind)
  })
  return off
}

export const NOTIFICATIONS_OFF: ReadonlySet<InboxKind> = parseNotificationKinds(notificationsCsv)
