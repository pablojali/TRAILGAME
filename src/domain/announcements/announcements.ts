import { parseCsv } from '../../data/csv'
import announcementsCsv from '../../data/announcements.csv?raw'
import type { Locale } from '../../i18n/i18n'

/**
 * Announcements to every player (owner request, 9 November 2026): messages the owner writes in Trail
 * Studio (src/data/announcements.csv), shown in every Inbox between their dates. The game also reads
 * the published table again while it is open (/announcements.csv, emitted by the build), so a new
 * message reaches players without a reload.
 */
export interface Announcement {
  id: string
  /** Epoch ms from which it shows. */
  from: number
  /** Epoch ms when it stops showing, or none. */
  until?: number
  /** Where tapping it goes in the game. */
  link?: string
  title: Record<Locale, string>
  text: Record<Locale, string>
}

const LANGUAGES = ['es', 'fr', 'it', 'de'] as const
const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/

/** Reads the announcements table; throws with the row on any mistake. */
export function parseAnnouncements(text: string): Announcement[] {
  const seen = new Set<string>()
  return parseCsv(text).map((row, i) => {
    const where = `announcements.csv row ${i + 1}`
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(row.id ?? '')) throw new Error(`${where}: id must be lowercase words joined by hyphens`)
    if (seen.has(row.id!)) throw new Error(`${where}: ${row.id} is listed twice`)
    seen.add(row.id!)
    if (!DATE.test(row.from ?? '')) throw new Error(`${where}: from must be a UTC date like 2026-11-10T09:00Z`)
    if (row.until && !DATE.test(row.until)) throw new Error(`${where}: until must be a UTC date like 2026-11-17T09:00Z`)
    const from = Date.parse(row.from!)
    const until = row.until ? Date.parse(row.until) : undefined
    if (until !== undefined && until <= from) throw new Error(`${where}: until must be after from`)
    if (row.link && !row.link.startsWith('/')) throw new Error(`${where}: link must be a path in the game, like /races`)
    if (!row.title || !row.text) throw new Error(`${where}: the English title and text are required`)
    const title = { en: row.title } as Record<Locale, string>
    const body = { en: row.text } as Record<Locale, string>
    for (const language of LANGUAGES) {
      title[language] = row[`title_${language}`] || row.title
      body[language] = row[`text_${language}`] || row.text
    }
    return { id: row.id!, from, ...(until !== undefined ? { until } : {}), ...(row.link ? { link: row.link } : {}), title, text: body }
  })
}

export const ANNOUNCEMENTS: readonly Announcement[] = parseAnnouncements(announcementsCsv)

/** The announcements showing at `now`. */
export function activeAnnouncements(list: readonly Announcement[], now: number): Announcement[] {
  return list.filter((a) => a.from <= now && (a.until === undefined || now < a.until))
}

/** The published table, read again (null when it cannot be read: the bundled one stays). */
export async function fetchAnnouncements(): Promise<Announcement[] | null> {
  try {
    const response = await fetch('/announcements.csv', { cache: 'no-store' })
    if (!response.ok) return null
    return parseAnnouncements(await response.text())
  } catch {
    return null
  }
}
