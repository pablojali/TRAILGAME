import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { newGame } from '../../test/gameFixtures'
import { renderApp, seedCareer } from '../../test/renderApp'

const { fetchRanking } = vi.hoisted(() => ({ fetchRanking: vi.fn() }))
vi.mock('../../repositories/supabase/rankingClient', () => ({ getRankingService: () => ({ fetch: fetchRanking }) }))

describe('Inbox: top 10 notifications (owner request, 7 November 2026)', () => {
  it('tells the player they entered the country top 10, from the ranking the server returns', async () => {
    vi.setSystemTime(Date.UTC(2026, 10, 8, 12))
    fetchRanking.mockImplementation(async (query: { country?: string }) => [
      { rank: query.country ? 3 : 42, name: 'PJ88', country: 'AR', sex: null, xp: 1000, points: 300, isMe: true },
    ])
    const user = userEvent.setup()
    seedCareer({ ...newGame(), athlete: { ...newGame().athlete, country: 'AR' } })
    await renderApp('/')
    await waitFor(() => expect(fetchRanking).toHaveBeenCalledWith(expect.objectContaining({ mode: 'season', season: 202611, country: 'AR', limit: 10 })))
    await user.click(await screen.findByRole('button', { name: /^Notifications, \d+ new$/ }))
    const inbox = screen.getByRole('dialog', { name: 'Inbox' })
    expect(within(inbox).getByText(/You're in the top 10: Argentina/)).toBeInTheDocument()
    expect(within(inbox).getByText("You're #3 this season.")).toBeInTheDocument()
    // The world ranking (42nd) is outside the top 10: no notification for it.
    expect(within(inbox).queryByText(/top 10: World/)).not.toBeInTheDocument()
  })
})
