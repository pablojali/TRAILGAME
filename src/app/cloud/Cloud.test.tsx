import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { SyncConflict, SyncStatus } from '../../repositories/cloudSync'
import type { AccountService, LinkResult } from '../../repositories/supabase/accountLinking'
import { SignInPanel } from '../../features/settings/SignInPanel'
import { newGame, withAthlete } from '../../test/gameFixtures'
import { GameContext, type GameContextValue } from '../game/gameContext'
import { ConflictDialog } from './ConflictDialog'
import { SyncIndicator } from './SyncIndicator'

/** Renders a component with a game context holding only what the cloud UI reads. */
function renderWith(ui: React.ReactNode, value: Partial<GameContextValue>) {
  const router = createMemoryRouter([{ path: '*', element: <GameContext value={value as GameContextValue}>{ui}</GameContext> }])
  return render(<RouterProvider router={router} />)
}

const CONFLICT: SyncConflict = {
  local: { ...withAthlete(newGame(), { xp: 300 }), coins: 40 },
  remote: { ...withAthlete(newGame('climber', undefined, { name: 'Leo', sex: 'male' }), { xp: 1000 }), coins: 210 },
  remoteVersion: 7,
  remoteUpdatedAt: 0,
}

describe('conflict dialog', () => {
  it('shows both careers and keeps the one the player chooses', async () => {
    const user = userEvent.setup()
    const resolve = vi.fn(async () => true)
    renderWith(<ConflictDialog />, { syncConflict: CONFLICT, resolveSyncConflict: resolve, canKeepDeviceCareer: true })
    const dialog = screen.getByRole('dialog', { name: 'Choose your career' })
    expect(within(dialog).getByRole('heading', { name: 'Choose your career' })).toHaveFocus()
    expect(dialog).toHaveTextContent('Careers are never mixed')
    expect(within(dialog).getByText('Demo Runner')).toBeInTheDocument()
    expect(within(dialog).getByText('Leo')).toBeInTheDocument()
    expect(within(dialog).getByText('210')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep the cloud career' }))
    expect(resolve).toHaveBeenCalledWith('cloud')
  })

  it('says both careers are unchanged when the choice cannot be saved', async () => {
    const user = userEvent.setup()
    renderWith(<ConflictDialog />, { syncConflict: CONFLICT, resolveSyncConflict: vi.fn(async () => false), canKeepDeviceCareer: true })
    await user.click(screen.getByRole('button', { name: "Keep this device's career" }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Both careers are unchanged')
  })

  it('with server progression, a progressed device career cannot replace the cloud career', () => {
    renderWith(<ConflictDialog />, { syncConflict: CONFLICT, resolveSyncConflict: vi.fn(), canKeepDeviceCareer: false })
    expect(screen.getByText(/confirmed by the server/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "Keep this device's career" })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep the cloud career' })).toBeInTheDocument()
  })

  it('with server progression and a damaged cloud copy, offers a new career for this runner', async () => {
    const user = userEvent.setup()
    const resolve = vi.fn(async () => true)
    renderWith(<ConflictDialog />, { syncConflict: { ...CONFLICT, remote: null }, resolveSyncConflict: resolve, canKeepDeviceCareer: false })
    await user.click(screen.getByRole('button', { name: 'Start a new career with this runner' }))
    expect(resolve).toHaveBeenCalledWith('local')
  })

  it('offers only this device when the cloud copy cannot be read', () => {
    renderWith(<ConflictDialog />, { syncConflict: { ...CONFLICT, remote: null }, resolveSyncConflict: vi.fn(), canKeepDeviceCareer: true })
    expect(screen.getByText(/damaged or from another version/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Keep the cloud career' })).not.toBeInTheDocument()
  })

  it('is not shown without a conflict', () => {
    renderWith(<ConflictDialog />, { syncConflict: null, resolveSyncConflict: vi.fn() })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('cloud indicator', () => {
  it.each<[SyncStatus, RegExp]>([
    ['synced', /on this device and in the cloud/],
    ['pending', /cloud save pending/],
    ['conflict', /choose one/],
  ])('describes the %s state and opens Settings', (status, text) => {
    renderWith(<SyncIndicator />, { cloudStatus: status })
    const link = screen.getByRole('link', { name: text })
    expect(link).toHaveAttribute('href', '/settings')
  })

  it('is hidden without cloud saves', () => {
    renderWith(<SyncIndicator />, { cloudStatus: 'off' })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('sign-in panel', () => {
  it('signs in with email and password, clearing the password, and shows errors', async () => {
    const user = userEvent.setup()
    const signInWithPassword = vi.fn(async (): Promise<LinkResult> => ({
      ok: false,
      error: 'wrong-credentials',
      status: { kind: 'anonymous', userId: 'a' },
    }))
    const service = { signInWithPassword, startOAuthSignIn: vi.fn() } as unknown as AccountService
    render(<SignInPanel service={service} />)
    await user.click(screen.getByRole('button', { name: 'Sign in to an existing account' }))
    expect(screen.getByText(/you will choose which one to keep/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Email'), 'ana@example.com')
    const password = screen.getByLabelText('Password')
    await user.type(password, 'secret-pass')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(signInWithPassword).toHaveBeenCalledWith('ana@example.com', 'secret-pass')
    expect(password).toHaveValue('')
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.')
  })

  it('signs in with Google', async () => {
    const user = userEvent.setup()
    const startOAuthSignIn = vi.fn(async (): Promise<LinkResult> => ({ ok: true, status: { kind: 'anonymous', userId: 'a' } }))
    render(<SignInPanel service={{ startOAuthSignIn } as unknown as AccountService} initiallyOpen />)
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(startOAuthSignIn).toHaveBeenCalledWith('google')
  })
})
