import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AccountService, AccountStatus, LinkResult } from '../../repositories/supabase/accountLinking'
import { renderApp, seedCareer } from '../../test/renderApp'
import { AccountCard } from './AccountCard'

const ANONYMOUS: AccountStatus = { kind: 'anonymous', userId: 'anon-1' }

function fakeService(overrides: Partial<AccountService> = {}): AccountService {
  return {
    status: vi.fn(async () => ANONYMOUS),
    linkEmail: vi.fn(async (email: string) => ({
      ok: true as const,
      status: { kind: 'email-pending' as const, userId: 'anon-1', email },
    })),
    setPassword: vi.fn(async (): Promise<LinkResult> => ({ ok: true, status: ANONYMOUS })),
    startOAuthLink: vi.fn(async (): Promise<LinkResult> => ({ ok: true, status: ANONYMOUS })),
    startOAuthSignIn: vi.fn(async (): Promise<LinkResult> => ({ ok: true, status: ANONYMOUS })),
    signInWithPassword: vi.fn(async (): Promise<LinkResult> => ({ ok: true, status: ANONYMOUS, signedIn: true })),
    completeRedirect: vi.fn(async () => null),
    signOut: vi.fn(async () => {}),
    ...overrides,
  }
}

describe('Account card', () => {
  it('shows a guest account with the linking options, and links an email', async () => {
    const user = userEvent.setup()
    const service = fakeService()
    render(<AccountCard service={service} />)
    expect(await screen.findByText('Guest account.')).toBeInTheDocument()
    expect(screen.getByText(/It is optional: you can keep playing as a guest/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Email'), 'ana@example.com')
    await user.click(screen.getByRole('button', { name: 'Link email' }))
    expect(service.linkEmail).toHaveBeenCalledWith('ana@example.com')
    expect(await screen.findByRole('status')).toHaveTextContent('Confirmation email sent.')
    expect(screen.getByText(/Check your inbox: we sent a confirmation link/)).toBeInTheDocument()
    expect(screen.getByText('ana@example.com', { selector: 'strong' })).toBeInTheDocument()
  })

  it('starts Google linking from the guest account', async () => {
    const user = userEvent.setup()
    const service = fakeService()
    render(<AccountCard service={service} />)
    await user.click(await screen.findByRole('button', { name: 'Link Google account' }))
    expect(service.startOAuthLink).toHaveBeenCalledWith('google')
  })

  it('shows a clear error and keeps the guest options when the email is already used', async () => {
    const user = userEvent.setup()
    const service = fakeService({
      linkEmail: vi.fn(async (): Promise<LinkResult> => ({ ok: false, error: 'email-in-use', status: ANONYMOUS })),
    })
    render(<AccountCard service={service} />)
    await user.type(await screen.findByLabelText('Email'), 'taken@example.com')
    await user.click(screen.getByRole('button', { name: 'Link email' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already belongs to another Trail Game account')
    expect(screen.getByText('Guest account.')).toBeInTheDocument()
    // Offers to sign in to that account instead: opens the sign-in form.
    await user.click(screen.getByRole('button', { name: 'Sign in to that account instead' }))
    expect(screen.getByRole('region', { name: 'Sign in to an existing account' })).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('offers to sign in with Google when that Google account belongs to another account', async () => {
    const user = userEvent.setup()
    const service = fakeService({
      startOAuthLink: vi.fn(async (): Promise<LinkResult> => ({ ok: false, error: 'identity-in-use', status: ANONYMOUS })),
    })
    render(<AccountCard service={service} />)
    await user.click(await screen.findByRole('button', { name: 'Link Google account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('sign in to it instead')
    await user.click(screen.getByRole('button', { name: 'Sign in to that account instead' }))
    expect(service.startOAuthSignIn).toHaveBeenCalledWith('google')
    expect(service.startOAuthLink).toHaveBeenCalledTimes(1)
  })

  it('shows the result of a Google link the player comes back from', async () => {
    const service = fakeService({
      completeRedirect: vi.fn(async (): Promise<LinkResult> => ({
        ok: true,
        status: { kind: 'linked', userId: 'anon-1', email: 'ana@gmail.com', providers: ['google'] },
      })),
    })
    render(<AccountCard service={service} />)
    expect(await screen.findByRole('status')).toHaveTextContent('Google account linked')
    expect(screen.getByText('Linked account.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Link Google account' })).not.toBeInTheDocument()
    // A Google-only account has no email password to set.
    expect(screen.queryByLabelText('Password (optional)')).not.toBeInTheDocument()
  })

  it('offers the password, not linking, to an account linked by email, and clears the field', async () => {
    const user = userEvent.setup()
    const linked: AccountStatus = { kind: 'linked', userId: 'anon-1', email: 'ana@example.com', providers: ['email'] }
    const service = fakeService({
      status: vi.fn(async () => linked),
      setPassword: vi.fn(async (): Promise<LinkResult> => ({ ok: true, status: linked })),
    })
    render(<AccountCard service={service} />)
    expect(await screen.findByText('Linked account.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    const field = screen.getByLabelText('Password (optional)')
    await user.type(field, 'a-good-password')
    await user.click(screen.getByRole('button', { name: 'Set password' }))
    expect(service.setPassword).toHaveBeenCalledWith('a-good-password')
    expect(field).toHaveValue('')
    expect(await screen.findByRole('status')).toHaveTextContent('Password saved')
  })

  it('stays playable when the account service is unreachable', async () => {
    const user = userEvent.setup()
    const status = vi.fn<AccountService['status']>(async () => ({ kind: 'unavailable' }))
    render(<AccountCard service={fakeService({ status })} />)
    expect(await screen.findByText(/You can keep playing/)).toBeInTheDocument()
    status.mockResolvedValueOnce(ANONYMOUS)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByText('Guest account.')).toBeInTheDocument())
  })

  it('is not shown when Supabase is not configured', async () => {
    seedCareer()
    await renderApp('/settings')
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Account' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset demo' })).toBeInTheDocument()
  })
})
