import { describe, expect, it } from 'vitest'
import { mailboxItems } from '../../app/inbox/inbox'
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
    expect(await camp.refuge('ana')).toEqual({ name: 'Ana', me: false, camp: { owned: ['lake-exterior'], using: ['lake-exterior'] } })
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
