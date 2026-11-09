import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { newGame, withAthlete } from '../../test/gameFixtures'
import { renderApp, seedCareer } from '../../test/renderApp'

describe('Inbox bell (owner request, 6 November 2026)', () => {
  it('shows a red dot for new notifications, lists them, and marks them read when opened', async () => {
    vi.setSystemTime(Date.UTC(2026, 10, 8, 12))
    const user = userEvent.setup()
    seedCareer(withAthlete(newGame(), { xp: 1000 }))
    const { router } = await renderApp('/')
    // The bell replaces the cloud in the top bar.
    expect(screen.queryByRole('link', { name: /cloud/i })).not.toBeInTheDocument()
    const bell = screen.getByRole('button', { name: /^Notifications, \d+ new$/ })
    await user.click(bell)
    const inbox = screen.getByRole('dialog', { name: 'Inbox' })
    expect(within(inbox).getByText(/^Level 6!/)).toBeInTheDocument()
    expect(within(inbox).getByText(/Season 11 · 2026 is on/)).toBeInTheDocument()
    expect(within(inbox).getAllByText('New').length).toBeGreaterThan(0)
    // Everything is read now: the bell has no count any more.
    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveAttribute('aria-expanded', 'true')
    // A notification opens its screen and closes the Inbox.
    await user.click(within(inbox).getByText(/Season 11 · 2026 is on/))
    expect(router.state.location.pathname).toBe('/career')
    expect(router.state.location.search).toBe('')
    expect(screen.queryByRole('dialog', { name: 'Inbox' })).not.toBeInTheDocument()
    // Escape closes it too.
    await user.click(screen.getByRole('button', { name: 'Notifications' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Inbox' })).not.toBeInTheDocument()
  })

  it('says when there is nothing yet', async () => {
    // The test clock starts before rankings (1 January 2026): a new career has nothing yet.
    const user = userEvent.setup()
    seedCareer(newGame())
    await renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(screen.getByText('No notifications yet.')).toBeInTheDocument()
  })
})

describe('announcements in the Inbox', () => {
  it('shows a message to every player, read again from the published table, in the player\'s language', async () => {
    vi.setSystemTime(Date.UTC(2026, 10, 11, 12))
    const csv = 'id,from,until,link,title,text,title_es,text_es\nhello,2026-11-10T09:00Z,,/races,New races,Five new races are open.,,\n'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(csv)))
    const user = userEvent.setup()
    seedCareer(newGame())
    const { router } = await renderApp('/')
    await user.click(await screen.findByRole('button', { name: /^Notifications, \d+ new$/ }))
    const inbox = screen.getByRole('dialog', { name: 'Inbox' })
    expect(within(inbox).getByText('Five new races are open.')).toBeInTheDocument()
    await user.click(within(inbox).getByText('New races'))
    expect(router.state.location.pathname).toBe('/races')
    vi.unstubAllGlobals()
  })
})
