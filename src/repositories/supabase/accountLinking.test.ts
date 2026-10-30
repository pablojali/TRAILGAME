import { describe, expect, it } from 'vitest'
import { newGame } from '../../test/gameFixtures'
import { SAVE_KEY } from '../gameRepository'
import {
  createAccountService,
  PENDING_LINK_KEY,
  readAuthReturn,
  type AccountClient,
  type AccountUser,
  type AuthReturn,
} from './accountLinking'

/**
 * A fake Supabase Auth that behaves like the server for these flows: an email stays pending
 * until confirmed, an email used by another user is refused, and linkIdentity links to the
 * signed-in user. It has no sign-in method other than the existing session, so a test fails if
 * the service tried to switch users.
 */
function fakeAuth() {
  const users = new Map<string, AccountUser>()
  users.set('anon-1', { id: 'anon-1', is_anonymous: true, identities: [] })
  users.set('other', { id: 'other', is_anonymous: false, email: 'taken@example.com', identities: [{ provider: 'email' }] })
  let current: string | null = 'anon-1'
  const calls: string[] = []
  const fail: { next: { code?: string; status?: number; message?: string } | null; offline: boolean } = {
    next: null,
    offline: false,
  }
  const passwords = new Map<string, string>()

  function result(user: AccountUser | null) {
    return { data: { user: user && structuredClone(user) }, error: null }
  }
  function failure() {
    if (fail.offline) throw new TypeError('Failed to fetch')
    const error = fail.next
    fail.next = null
    return error
  }

  const client: AccountClient = {
    auth: {
      async getUser() {
        calls.push('getUser')
        if (fail.offline) return { data: { user: null }, error: { message: 'Failed to fetch' } }
        return result(current ? users.get(current)! : null)
      },
      async updateUser(attributes, options) {
        calls.push(`updateUser ${Object.keys(attributes).join(',')}${options?.emailRedirectTo ? ' redirect' : ''}`)
        const error = failure()
        if (error) return { data: { user: null }, error }
        const user = users.get(current!)!
        if (attributes.email) {
          const taken = [...users.values()].some((u) => u.id !== user.id && u.email === attributes.email)
          if (taken) return { data: { user: null }, error: { code: 'email_exists', status: 422, message: 'Email exists' } }
          user.new_email = attributes.email
        }
        if (attributes.password !== undefined) {
          if (user.is_anonymous || !user.email_confirmed_at) {
            return { data: { user: null }, error: { code: 'email_not_confirmed', status: 400 } }
          }
          if (passwords.get(user.id) === attributes.password) {
            return { data: { user: null }, error: { code: 'same_password', status: 422 } }
          }
          passwords.set(user.id, attributes.password)
        }
        return result(user)
      },
      async linkIdentity({ provider, options }) {
        calls.push(`linkIdentity ${provider} ${options?.redirectTo}`)
        const error = failure()
        if (error) return { data: null, error }
        return { data: { url: `https://accounts.example/${provider}?for=${current}` }, error: null }
      },
      async signOut() {
        calls.push('signOut')
        current = null
        return { error: null }
      },
    },
  }

  return {
    client,
    calls,
    fail,
    users,
    passwords,
    setCurrent: (id: string | null) => (current = id),
    /** The player opens the confirmation link: the same user becomes permanent. */
    confirmEmail(id = 'anon-1') {
      const user = users.get(id)!
      user.email = user.new_email
      delete user.new_email
      user.email_confirmed_at = '2026-10-30T18:00:00Z'
      user.is_anonymous = false
      user.identities = [...(user.identities ?? []), { provider: 'email' }]
    },
    /** The provider sends the player back with the identity linked to the same user. */
    linkProvider(provider: string, id = 'anon-1') {
      const user = users.get(id)!
      user.is_anonymous = false
      user.email = user.email ?? `${id}@gmail.example`
      user.identities = [...(user.identities ?? []), { provider }]
    },
  }
}

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

function service(
  auth: ReturnType<typeof fakeAuth>,
  { storage = memoryStorage(), authReturn = null as AuthReturn | null } = {},
) {
  const navigations: string[] = []
  const accounts = createAccountService(async () => auth.client, {
    redirectTo: 'https://trailgame.example/settings',
    authReturn,
    storage,
    navigate: (url) => navigations.push(url),
  })
  return { accounts, navigations, storage }
}

describe('account status', () => {
  it('identifies anonymous, pending and linked accounts', async () => {
    const auth = fakeAuth()
    const { accounts } = service(auth)
    await expect(accounts.status()).resolves.toEqual({ kind: 'anonymous', userId: 'anon-1' })
    await accounts.linkEmail('ana@example.com')
    await expect(accounts.status()).resolves.toEqual({ kind: 'email-pending', userId: 'anon-1', email: 'ana@example.com' })
    auth.confirmEmail()
    await expect(accounts.status()).resolves.toEqual({
      kind: 'linked',
      userId: 'anon-1',
      email: 'ana@example.com',
      providers: ['email'],
    })
  })

  it('is unavailable without a session or connection, and the anonymous session stays valid', async () => {
    const auth = fakeAuth()
    const { accounts } = service(auth)
    auth.fail.offline = true
    await expect(accounts.status()).resolves.toEqual({ kind: 'unavailable' })
    auth.fail.offline = false
    await expect(accounts.status()).resolves.toEqual({ kind: 'anonymous', userId: 'anon-1' })
  })
})

describe('email linking', () => {
  it('links the email to the same user: no new user, the id is preserved', async () => {
    const auth = fakeAuth()
    const { accounts } = service(auth)
    const result = await accounts.linkEmail('  ana@example.com ')
    expect(result).toEqual({ ok: true, status: { kind: 'email-pending', userId: 'anon-1', email: 'ana@example.com' } })
    expect(auth.calls).toContain('updateUser email redirect')
    auth.confirmEmail()
    await expect(accounts.status()).resolves.toMatchObject({ kind: 'linked', userId: 'anon-1' })
    expect(auth.users.size).toBe(2)
  })

  it('refuses an email that belongs to another account, leaving both accounts unchanged', async () => {
    const auth = fakeAuth()
    const { accounts } = service(auth)
    const result = await accounts.linkEmail('taken@example.com')
    expect(result).toEqual({ ok: false, error: 'email-in-use', status: { kind: 'anonymous', userId: 'anon-1' } })
    expect(auth.users.get('other')).toMatchObject({ email: 'taken@example.com' })
    expect(auth.calls).not.toContain('signOut')
  })

  it('handles invalid emails, rate limits and server validation', async () => {
    const auth = fakeAuth()
    const { accounts } = service(auth)
    await expect(accounts.linkEmail('not-an-email')).resolves.toMatchObject({ ok: false, error: 'invalid-email' })
    expect(auth.calls.filter((c) => c.startsWith('updateUser'))).toEqual([])
    auth.fail.next = { code: 'email_address_invalid', status: 400 }
    await expect(accounts.linkEmail('ana@example.invalid')).resolves.toMatchObject({ ok: false, error: 'invalid-email' })
    auth.fail.next = { code: 'email_address_not_authorized', status: 400 }
    await expect(accounts.linkEmail('ana@example.com')).resolves.toMatchObject({ ok: false, error: 'email-unavailable' })
    auth.fail.next = { code: 'over_email_send_rate_limit', status: 429 }
    await expect(accounts.linkEmail('ana@example.com')).resolves.toMatchObject({ ok: false, error: 'rate-limited' })
  })

  it('reports a network failure as offline and keeps the anonymous account', async () => {
    const auth = fakeAuth()
    const { accounts } = service(auth)
    auth.fail.offline = true
    await expect(accounts.linkEmail('ana@example.com')).resolves.toMatchObject({ ok: false, error: 'offline' })
    auth.fail.offline = false
    await expect(accounts.status()).resolves.toEqual({ kind: 'anonymous', userId: 'anon-1' })
  })

  it('does not offer email linking to an account that is already permanent', async () => {
    const auth = fakeAuth()
    auth.setCurrent('other')
    const { accounts } = service(auth)
    await expect(accounts.linkEmail('new@example.com')).resolves.toMatchObject({ ok: false, error: 'not-anonymous' })
  })

  it('refuses a second submission while the first is running', async () => {
    const auth = fakeAuth()
    const { accounts } = service(auth)
    const [first, second] = await Promise.all([accounts.linkEmail('ana@example.com'), accounts.linkEmail('ana@example.com')])
    expect(first.ok).toBe(true)
    expect(second).toMatchObject({ ok: false, error: 'busy' })
    expect(auth.calls.filter((c) => c.startsWith('updateUser'))).toHaveLength(1)
  })
})

describe('password', () => {
  it('is set only on a linked account with a confirmed email, and never kept', async () => {
    const auth = fakeAuth()
    const { accounts, storage } = service(auth)
    await expect(accounts.setPassword('a-good-password')).resolves.toMatchObject({ ok: false, error: 'not-linked' })
    await accounts.linkEmail('ana@example.com')
    auth.confirmEmail()
    await expect(accounts.setPassword('short')).resolves.toMatchObject({ ok: false, error: 'weak-password' })
    await expect(accounts.setPassword('a-good-password')).resolves.toMatchObject({ ok: true, status: { userId: 'anon-1' } })
    await expect(accounts.setPassword('a-good-password')).resolves.toMatchObject({ ok: false, error: 'same-password' })
    expect([...storage.data.values()].join()).not.toContain('a-good-password')
    expect(JSON.stringify(localStorage)).not.toContain('a-good-password')
  })
})

describe('Google linking', () => {
  it('links from the current anonymous session with linkIdentity, then verifies the same user', async () => {
    const auth = fakeAuth()
    const storage = memoryStorage()
    const before = service(auth, { storage })
    await expect(before.accounts.startOAuthLink('google')).resolves.toMatchObject({ ok: true })
    expect(auth.calls).toContain('linkIdentity google https://trailgame.example/settings')
    expect(before.navigations).toEqual(['https://accounts.example/google?for=anon-1'])
    expect(JSON.parse(storage.data.get(PENDING_LINK_KEY)!)).toEqual({ userId: 'anon-1', provider: 'google' })

    // Back from Google: a new page load with the session restored by the Supabase client.
    auth.linkProvider('google')
    const after = service(auth, { storage, authReturn: { error: null, errorCode: null } })
    await expect(after.accounts.completeRedirect()).resolves.toEqual({
      ok: true,
      status: { kind: 'linked', userId: 'anon-1', email: 'anon-1@gmail.example', providers: ['google'] },
    })
    expect(storage.data.has(PENDING_LINK_KEY)).toBe(false)
    expect(auth.users.size).toBe(2)
  })

  it('does not take a redirect alone as proof: the identity must be on the same user', async () => {
    const auth = fakeAuth()
    const storage = memoryStorage()
    await service(auth, { storage }).accounts.startOAuthLink('google')
    // Back without an error, but the Auth server shows no Google identity.
    const after = service(auth, { storage, authReturn: { error: null, errorCode: null } })
    await expect(after.accounts.completeRedirect()).resolves.toMatchObject({ ok: false, error: 'not-linked' })
  })

  it('refuses a different account after the redirect, never adopting it', async () => {
    const auth = fakeAuth()
    const storage = memoryStorage()
    await service(auth, { storage }).accounts.startOAuthLink('google')
    auth.setCurrent('other')
    const after = service(auth, { storage, authReturn: { error: null, errorCode: null } })
    await expect(after.accounts.completeRedirect()).resolves.toMatchObject({ ok: false, error: 'different-account' })
  })

  it('reports a Google account already used by another player, keeping the guest account', async () => {
    const auth = fakeAuth()
    const storage = memoryStorage()
    await service(auth, { storage }).accounts.startOAuthLink('google')
    const after = service(auth, { storage, authReturn: { error: 'server_error', errorCode: 'identity_already_exists' } })
    await expect(after.accounts.completeRedirect()).resolves.toEqual({
      ok: false,
      error: 'identity-in-use',
      status: { kind: 'anonymous', userId: 'anon-1' },
    })
  })

  it('reports a cancelled sign-in, keeping the guest account', async () => {
    const auth = fakeAuth()
    const storage = memoryStorage()
    await service(auth, { storage }).accounts.startOAuthLink('google')
    const after = service(auth, { storage, authReturn: { error: 'access_denied', errorCode: null } })
    await expect(after.accounts.completeRedirect()).resolves.toMatchObject({
      ok: false,
      error: 'cancelled',
      status: { kind: 'anonymous', userId: 'anon-1' },
    })
  })

  it('reports linking disabled in the project or Google not enabled, without leaving', async () => {
    const auth = fakeAuth()
    const { accounts, navigations, storage } = service(auth)
    auth.fail.next = { code: 'manual_linking_disabled', status: 404 }
    await expect(accounts.startOAuthLink('google')).resolves.toMatchObject({ ok: false, error: 'linking-disabled' })
    auth.fail.next = { status: 400, message: 'Unsupported provider: provider is not enabled' }
    await expect(accounts.startOAuthLink('google')).resolves.toMatchObject({ ok: false, error: 'provider-disabled' })
    expect(navigations).toEqual([])
    expect(storage.data.has(PENDING_LINK_KEY)).toBe(false)
  })

  it('does nothing on a page load without a pending link', async () => {
    const { accounts } = service(fakeAuth(), { authReturn: { error: null, errorCode: null } })
    await expect(accounts.completeRedirect()).resolves.toBeNull()
  })
})

describe('auth redirect in the URL', () => {
  it('reads errors from the query or the hash, and never copies tokens', () => {
    expect(readAuthReturn('https://t.example/settings')).toBeNull()
    expect(readAuthReturn('https://t.example/settings#access_token=secret&refresh_token=secret2&type=bearer')).toEqual({
      error: null,
      errorCode: null,
    })
    expect(
      readAuthReturn('https://t.example/settings?error=server_error&error_code=identity_already_exists&error_description=x'),
    ).toEqual({ error: 'server_error', errorCode: 'identity_already_exists' })
    expect(readAuthReturn('https://t.example/settings#error=access_denied')).toEqual({ error: 'access_denied', errorCode: null })
    expect(JSON.stringify(readAuthReturn('https://t.example/#access_token=secret'))).not.toContain('secret')
  })
})

describe('regression', () => {
  it('never touches the local save and has no way to create a career', async () => {
    const raw = JSON.stringify({ schemaVersion: 2, savedAt: 'x', state: newGame() })
    localStorage.setItem(SAVE_KEY, raw)
    const auth = fakeAuth()
    const { accounts } = service(auth)
    await accounts.linkEmail('ana@example.com')
    auth.confirmEmail()
    await accounts.setPassword('a-good-password')
    await accounts.startOAuthLink('google')
    expect(localStorage.getItem(SAVE_KEY)).toBe(raw)
    // The client given to the service has no rpc or table access at all.
    expect('rpc' in auth.client).toBe(false)
  })
})

describe('startup', () => {
  it('waits for the shared anonymous sign-in before reading the account', async () => {
    const auth = fakeAuth()
    auth.setCurrent(null)
    const accounts = createAccountService(async () => auth.client, {
      redirectTo: 'https://trailgame.example/settings',
      authReturn: null,
      storage: null,
      navigate: () => {},
      // The identity finishes signing in only now.
      ensureSession: async () => auth.setCurrent('anon-1'),
    })
    await expect(accounts.status()).resolves.toEqual({ kind: 'anonymous', userId: 'anon-1' })
  })
})
