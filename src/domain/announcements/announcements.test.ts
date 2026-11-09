import { describe, expect, it } from 'vitest'
import { buildInbox } from '../../app/inbox/inbox'
import { newGame } from '../../test/gameFixtures'
import { activeAnnouncements, ANNOUNCEMENTS, parseAnnouncements } from './announcements'

const HEADER = 'id,from,until,link,title,text,title_es,text_es\n'

describe('announcements to every player (owner request, 9 November 2026)', () => {
  it('reads the table with English as fallback, and the owner table is valid', () => {
    expect(Array.isArray(ANNOUNCEMENTS)).toBe(true)
    const [a] = parseAnnouncements(`${HEADER}new-races,2026-11-10T09:00Z,2026-11-17T09:00Z,/races,New races,Five new races.,Carreras nuevas,\n`)
    expect(a).toMatchObject({ id: 'new-races', from: Date.UTC(2026, 10, 10, 9), until: Date.UTC(2026, 10, 17, 9), link: '/races' })
    expect(a!.title.es).toBe('Carreras nuevas')
    expect(a!.text.es).toBe('Five new races.')
  })

  it('refuses what could not be shown', () => {
    const bad = (row: string) => () => parseAnnouncements(HEADER + row)
    expect(bad('x,10/11/2026,,,T,X,,\n')).toThrow('UTC date')
    expect(bad('x,2026-11-10T09:00Z,2026-11-09T09:00Z,,T,X,,\n')).toThrow('after from')
    expect(bad('x,2026-11-10T09:00Z,,races,T,X,,\n')).toThrow('path in the game')
    expect(bad('x,2026-11-10T09:00Z,,,T,X,,\nx,2026-11-10T09:00Z,,,T,X,,\n')).toThrow('twice')
  })

  it('shows each one in the Inbox between its dates', () => {
    const list = parseAnnouncements(`${HEADER}hello,2026-11-10T09:00Z,2026-11-12T09:00Z,,Hi,All,,\n`)
    expect(activeAnnouncements(list, Date.UTC(2026, 10, 10, 8))).toEqual([])
    expect(activeAnnouncements(list, Date.UTC(2026, 10, 11))).toHaveLength(1)
    expect(activeAnnouncements(list, Date.UTC(2026, 10, 12, 9))).toEqual([])
    const items = buildInbox(newGame(), Date.UTC(2026, 10, 11), {}, list)
    expect(items.find((i) => i.kind === 'announcement')).toEqual({ id: 'announcement:hello', kind: 'announcement', at: Date.UTC(2026, 10, 10, 9), values: { id: 'hello' } })
  })
})
