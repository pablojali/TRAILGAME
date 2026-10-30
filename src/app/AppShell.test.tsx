import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { NAV_ITEMS } from './navigation'
import { seedCareer } from '../test/renderApp'
import { routes } from './routes'

async function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  await waitFor(() => expect(screen.queryByText('Loading your career…')).not.toBeInTheDocument())
  return router
}

describe('AppShell', () => {
  beforeEach(() => {
    seedCareer()
  })

  it('renders the five main navigation links in order', async () => {
    await renderAt('/')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent)
    expect(labels).toEqual(['Dashboard', 'Training', 'Equipment', 'Races', 'Career'])
  })

  it('shows the Dashboard at the root route and marks it active', async () => {
    await renderAt('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
  })

  it.each(NAV_ITEMS.map((item) => [item.label, item.path] as const))(
    'renders the %s placeholder at %s',
    async (label, path) => {
      await renderAt(path)
      expect(screen.getByRole('heading', { level: 1, name: label })).toBeInTheDocument()
    },
  )

  it('navigates between screens when a nav link is clicked', async () => {
    const user = userEvent.setup()
    const router = await renderAt('/')
    const nav = screen.getByRole('navigation', { name: 'Main' })

    await user.click(within(nav).getByRole('link', { name: 'Races' }))

    expect(router.state.location.pathname).toBe('/races')
    expect(screen.getByRole('heading', { level: 1, name: 'Races' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Races' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
  })

  it('shows a not-found screen inside the shell for unknown routes', async () => {
    await renderAt('/does-not-exist')
    expect(screen.getByRole('heading', { level: 1, name: 'Off trail' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Dashboard' })).toHaveAttribute('href', '/')
  })
})
