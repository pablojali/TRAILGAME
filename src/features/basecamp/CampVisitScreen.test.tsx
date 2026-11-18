import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n/i18n'
import type { CampService } from '../../repositories/supabase/campClient'
import { CampVisitScreen } from './CampVisitScreen'
import { defaultRefuge, visitPath } from './visits'

/** A refuge service with nothing in it, but what a test gives. */
const fake = (overrides: Partial<CampService>): CampService => ({
  refuge: async () => 'offline',
  visit: async () => ({ congratulated: false }),
  mailbox: async () => [],
  friends: async () => [],
  requestFriend: async () => 'pending',
  answerFriend: async () => 'friends',
  removeFriend: async () => true,
  leaveMessage: async () => true,
  deleteMessage: async () => true,
  searchRunners: async () => [],
  ...overrides,
})

function open(service: CampService, name = 'Ana') {
  const router = createMemoryRouter(
    [
      { path: '/base-camp/visit/:name', element: <CampVisitScreen service={service} /> },
      { path: '/base-camp', element: <p>Own Base Camp</p> },
    ],
    { initialEntries: [visitPath(name)] },
  )
  render(
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>,
  )
}

describe('Visiting a refuge (owner design, 17 November 2026)', () => {
  it('shows the runner’s refuge outside, records the visit and congratulates once', async () => {
    const user = userEvent.setup()
    const visit = vi.fn(async (_name: string, congratulate: boolean) => ({ congratulated: congratulate }))
    open(
      fake({
        refuge: async () => ({ name: 'Ana', me: false, friend: false, camp: { owned: ['lake-exterior'], using: ['lake-exterior'] } }),
        visit,
      }),
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana’s refuge' })).toBeInTheDocument()
    expect(screen.getByLabelText('Your cabin, outside')).toBeInTheDocument()
    // A visitor has no buttons in the scene.
    expect(screen.queryByRole('button', { name: 'Enter the cabin' })).not.toBeInTheDocument()
    expect(visit).toHaveBeenCalledWith('Ana', false)
    await user.click(await screen.findByRole('button', { name: '👏 Congratulate' }))
    expect(visit).toHaveBeenLastCalledWith('Ana', true)
    expect(await screen.findByRole('button', { name: 'Congratulated ✓' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('sends the player to their own Base Camp, and says when it cannot be reached', async () => {
    open(fake({ refuge: async () => ({ name: 'Me', me: true, friend: false, camp: null }) }), 'Me')
    expect(await screen.findByText('Own Base Camp')).toBeInTheDocument()
  })

  it('says when the refuge cannot be reached', async () => {
    open(fake({ refuge: async () => 'offline' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This refuge cannot be opened without a connection.')
  })

  it('sends a friend request from the refuge, and accepts theirs', async () => {
    const user = userEvent.setup()
    const requestFriend = vi.fn(async () => 'pending' as const)
    open(fake({ refuge: async () => ({ name: 'Ana', me: false, friend: false, camp: null }), requestFriend }))
    await user.click(await screen.findByRole('button', { name: '➕ Add friend' }))
    expect(requestFriend).toHaveBeenCalledWith('Ana')
    expect(await screen.findByText('Request sent')).toBeInTheDocument()
  })

  it('accepts the runner’s own request from their refuge', async () => {
    const user = userEvent.setup()
    let relation: 'incoming' | 'friend' = 'incoming'
    const answerFriend = vi.fn(async () => {
      relation = 'friend'
      return 'friends' as const
    })
    open(
      fake({
        refuge: async () => ({ name: 'Ana', me: false, friend: false, camp: null }),
        friends: async () => [{ name: 'Ana', country: 'AR', xp: 0, relation, since: 1, mine: false }],
        answerFriend,
      }),
    )
    await user.click(await screen.findByRole('button', { name: 'Accept friend request' }))
    expect(answerFriend).toHaveBeenCalledWith('Ana', true)
    expect(await screen.findByText('✓ Friends')).toBeInTheDocument()
  })

  it('lets a friend go in and leave a message', async () => {
    const user = userEvent.setup()
    const leaveMessage = vi.fn(async () => true as const)
    open(fake({ refuge: async () => ({ name: 'Ana', me: false, friend: true, camp: null }), leaveMessage }))
    await user.click(await screen.findByRole('button', { name: 'Go in' }))
    expect(screen.getByLabelText('Your cabin\'s living room')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '✉️ Leave a message' }))
    await user.type(screen.getByLabelText('Your message'), '  Nice refuge!  ')
    expect(screen.getByText('16/140')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(leaveMessage).toHaveBeenCalledWith('Ana', 'Nice refuge!')
    expect(await screen.findByRole('status')).toHaveTextContent('Sent. It is waiting in their mailbox.')
  })

  it('keeps the door closed to someone who is not a friend', async () => {
    open(fake({ refuge: async () => ({ name: 'Ana', me: false, friend: false, camp: null }) }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana’s refuge' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Go in' })).not.toBeInTheDocument()
  })

  it('gives a runner without pieces a free refuge, always the same', () => {
    expect(defaultRefuge('Zoe')).toEqual(defaultRefuge(' zoe '))
    expect(defaultRefuge('Zoe').using).toHaveLength(1)
  })
})
