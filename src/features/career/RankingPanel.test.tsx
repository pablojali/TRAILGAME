import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RankingQuery, RankingRow } from '../../repositories/supabase/rankingClient'
import { newGame } from '../../test/gameFixtures'
import { renderApp, seedCareer } from '../../test/renderApp'

const { fetchRanking } = vi.hoisted(() => ({ fetchRanking: vi.fn() }))
vi.mock('../../repositories/supabase/rankingClient', () => ({ getRankingService: () => ({ fetch: fetchRanking }) }))
const fetch = fetchRanking as unknown as ReturnType<typeof vi.fn<(query: RankingQuery) => Promise<RankingRow[] | 'offline'>>>

describe('Career ranking (owner design, 5 November 2026)', () => {
  beforeEach(() => {
    fetch.mockReset()
  })

  it('shows the world ranking, the player’s position, and filters by country, with one general classification for everyone', async () => {
    const user = userEvent.setup()
    const base = newGame()
    seedCareer({ ...base, athlete: { ...base.athlete, name: 'PJ88', country: 'AR' } })
    fetch.mockImplementation(async (query) => [
      { rank: 1, name: 'MountainWolf', country: 'FR', sex: 'male', xp: 23200, points: 12450, isMe: false },
      { rank: 248, name: 'PJ88', country: 'AR', sex: 'female', xp: 1000, points: query.country ? 50 : 3420, isMe: true },
    ])
    await renderApp('/career?tab=ranking')
    const list = await screen.findByRole('region', { name: 'Ranked runners' })
    expect(within(list).getByText('MountainWolf')).toBeInTheDocument()
    expect(within(list).getByText('12,450 pts')).toBeInTheDocument()
    // The player's own row is not in the top list (rank 248) but shows as Your position.
    expect(within(list).queryByText('PJ88')).not.toBeInTheDocument()
    const you = screen.getByRole('region', { name: 'Your position' })
    expect(you).toHaveTextContent('#248 · PJ88')
    expect(you).toHaveTextContent('3,420 pts')
    expect(fetch).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'season', season: expect.any(Number), months: 12, country: undefined, bestResults: 10, limit: 50 }))

    await user.click(screen.getByRole('button', { name: /Country/ }))
    expect(await screen.findByRole('heading', { name: 'Argentina · season ranking' })).toBeInTheDocument()
    expect(fetch).toHaveBeenLastCalledWith(expect.objectContaining({ country: 'AR' }))
    // Men and women compete in one classification (owner decision, 5 November 2026).
    expect(screen.queryByRole('button', { name: 'Women' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Men' })).not.toBeInTheDocument()
    expect(fetch.mock.calls.every(([query]) => !('sex' in query))).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Annual' }))
    expect(await screen.findByRole('heading', { name: 'Argentina · annual ranking' })).toBeInTheDocument()
    expect(screen.getByText('Last 12 months')).toBeInTheDocument()
    expect(fetch).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'annual', season: undefined, months: 12, country: 'AR' }))
  })

  it('says so when the ranking cannot be loaded', async () => {
    seedCareer()
    fetch.mockResolvedValue('offline')
    await renderApp('/career?tab=ranking')
    expect(await screen.findByRole('alert')).toHaveTextContent('The ranking could not be loaded.')
  })
})
