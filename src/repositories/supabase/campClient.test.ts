import { describe, expect, it } from 'vitest'
import { friendItems, mailboxItems } from '../../app/inbox/inbox'
import { createCampService } from './campClient'

const service = (answers: Record<string, unknown>, calls: unknown[] = []) =>
  createCampService(
    async () => ({
      rpc: async (name: string, args?: Record<string, unknown>) => {
        calls.push([name, args])
        return name in answers ? { data: answers[name], error: null } : { data: null, error: { message: 'down' } }
      },
    }),
    async () => null,
  )

describe('the refuge service', () => {
  it('reads a refuge (cleaned like a save), records visits and reads the mailbox', async () => {
    const calls: unknown[] = []
    const camp = service(
      {
        camp_public: { name: 'Ana', me: false, camp: { owned: ['lake-exterior', 'gone'], using: ['lake-exterior', 'gone'] } },
        camp_visit: { congratulated: true },
        camp_mailbox: [{ id: 3, kind: 'congrats', name: 'Bo', at: '2026-11-17T10:00:00Z' }, { id: 4, kind: 'spam' }],
      },
      calls,
    )
    expect(await camp.refuge('ana')).toEqual({ name: 'Ana', me: false, friend: false, online: false, camp: { owned: ['lake-exterior'], using: ['lake-exterior'] } })
    expect(await camp.visit('Ana', true)).toEqual({ congratulated: true })
    const mailbox = await camp.mailbox()
    expect(mailbox).toEqual([{ id: 3, kind: 'congrats', name: 'Bo', at: Date.parse('2026-11-17T10:00:00Z') }])
    expect(calls[1]).toEqual(['camp_visit', { p_name: 'Ana', p_congrats: true }])
    expect(mailboxItems(mailbox === 'offline' ? [] : mailbox)).toEqual([
      { id: 'camp:3', kind: 'congrats', at: Date.parse('2026-11-17T10:00:00Z'), link: '/base-camp/visit/Bo', values: { name: 'Bo' } },
    ])
  })

  it('answers offline when the server cannot be reached', async () => {
    const camp = service({})
    expect(await camp.refuge('Ana')).toBe('offline')
    expect(await camp.visit('Ana', false)).toBe('offline')
    expect(await camp.mailbox()).toBe('offline')
  })
})

describe('friends', () => {
  it('reads the list, sends and answers requests, and explains limits', async () => {
    const calls: unknown[] = []
    const camp = createCampService(
      async () => ({
        rpc: async (name: string, args?: Record<string, unknown>) => {
          calls.push([name, args])
          if (name === 'friend_list') return { data: [{ name: 'Bo', country: null, xp: 10, relation: 'incoming', since: '2026-11-17T10:00:00Z', mine: false }, { name: 'x' }], error: null }
          if (name === 'friend_request') return args?.p_name === 'Full' ? { data: null, error: { message: 'too-many-pending' } } : { data: 'accepted', error: null }
          if (name === 'friend_respond') return { data: 'declined', error: null }
          return { data: true, error: null }
        },
      }),
      async () => null,
    )
    expect(await camp.friends()).toEqual([{ name: 'Bo', country: null, xp: 10, relation: 'incoming', since: Date.parse('2026-11-17T10:00:00Z'), mine: false }])
    expect(await camp.requestFriend('Bo')).toBe('accepted')
    expect(await camp.requestFriend('Full')).toBe('too-many-pending')
    expect(await camp.answerFriend('Bo', false)).toBe('declined')
    expect(await camp.removeFriend('Bo')).toBe(true)
    expect(calls[3]).toEqual(['friend_respond', { p_name: 'Bo', p_accept: false }])
    expect(
      friendItems([
        { name: 'Bo', relation: 'incoming', since: 5, mine: false },
        { name: 'Cy', relation: 'friend', since: 6, mine: true },
        { name: 'Di', relation: 'friend', since: 7, mine: false },
      ]).map((item) => [item.kind, item.link]),
    ).toEqual([
      ['friend-request', '/base-camp?friends=1'],
      ['friend-accepted', '/base-camp/visit/Cy'],
    ])
  })
})

describe('runner search', () => {
  it('finds runners by name and reads their country and XP', async () => {
    const camp = createCampService(
      async () => ({ rpc: async () => ({ data: [{ name: 'Martina', country: 'AR', xp: 300 }, { name: 7 }], error: null }) }),
      async () => null,
    )
    expect(await camp.searchRunners('mar')).toEqual([{ name: 'Martina', country: 'AR', xp: 300 }])
  })
})

describe('presence', () => {
  it('reads whether the owner is home and their avatar', async () => {
    const camp = createCampService(
      async () => ({
        rpc: async () => ({
          data: { name: 'Ana', me: false, friend: true, online: true, avatar: { sex: 'female', appearance: { skin: 'tone-2' } }, camp: null },
          error: null,
        }),
      }),
      async () => null,
    )
    const refuge = await camp.refuge('Ana')
    expect(refuge).toMatchObject({ online: true, avatar: { sex: 'female', appearance: { skin: 'tone-2' } } })
  })
})
