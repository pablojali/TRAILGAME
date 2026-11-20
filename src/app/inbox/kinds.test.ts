import { describe, expect, it } from 'vitest'
import { arrange, type InboxItem } from './inbox'
import { NOTIFICATIONS_OFF, parseNotificationKinds } from './kinds'

describe('automatic notifications turned off (owner request, 19 November 2026)', () => {
  it('reads the table: kinds set to no are off, unknown kinds and bad values refused', () => {
    expect([...parseNotificationKinds('kind,on\nrace,yes\nseason,no\nvisit,no\n')]).toEqual(['season', 'visit'])
    expect(() => parseNotificationKinds('kind,on\nannouncement,no\n')).toThrow(/unknown kind/)
    expect(() => parseNotificationKinds('kind,on\nrace,maybe\n')).toThrow(/yes or no/)
    expect(() => parseNotificationKinds('kind,on\nrace,yes\nrace,no\n')).toThrow(/twice/)
    expect(NOTIFICATIONS_OFF).toBeInstanceOf(Set)
  })

  it('hides those kinds from the Inbox but remembers them', () => {
    const items: InboxItem[] = [
      { id: 'season:202611', kind: 'season', at: 1, values: {} },
      { id: 'level:3', kind: 'level', at: 2, values: {} },
    ]
    const { list, memory } = arrange(items, { seen: {}, read: [] }, 10, new Set(['season']))
    expect(list.map((i) => i.id)).toEqual(['level:3'])
    expect(Object.keys(memory.seen).sort()).toEqual(['level:3', 'season:202611'])
  })
})
