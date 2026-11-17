import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n/i18n'
import type { CampService, FriendEntry } from '../../repositories/supabase/campClient'
import { FriendsSheet } from './Friends'

const entry = (name: string, relation: FriendEntry['relation']): FriendEntry => ({ name, country: 'AR', xp: 0, relation, since: 1, mine: false })

describe('the friends list (owner design, 17 November 2026)', () => {
  it('shows requests, friends and sent requests, and answers them', async () => {
    const user = userEvent.setup()
    let list = [entry('Bo', 'incoming'), entry('Ana', 'friend'), entry('Cy', 'outgoing')]
    const answerFriend = vi.fn(async (name: string) => {
      list = list.map((e) => (e.name === name ? { ...e, relation: 'friend' as const } : e))
      return 'friends' as const
    })
    const removeFriend = vi.fn(async () => true)
    const service: CampService = {
      refuge: async () => 'offline',
      visit: async () => 'offline',
      mailbox: async () => [],
      friends: async () => list,
      requestFriend: async () => 'pending',
      answerFriend,
      removeFriend,
    }
    render(
      <I18nProvider>
        <MemoryRouter>
          <FriendsSheet service={service} onClose={() => {}} />
        </MemoryRouter>
      </I18nProvider>,
    )
    const requests = await screen.findByRole('region', { name: 'Requests' })
    expect(within(requests).getByRole('button', { name: 'Decline Bo' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Friends (1)' })).getByRole('link', { name: 'Visit Ana' })).toHaveAttribute('href', '/base-camp/visit/Ana')
    await user.click(within(screen.getByRole('region', { name: 'Sent, waiting for an answer' })).getByRole('button', { name: 'Cancel Cy' }))
    expect(removeFriend).toHaveBeenCalledWith('Cy')
    await user.click(within(requests).getByRole('button', { name: 'Accept Bo' }))
    expect(answerFriend).toHaveBeenCalledWith('Bo', true)
    expect(await screen.findByRole('region', { name: 'Friends (2)' })).toBeInTheDocument()
  })
})
