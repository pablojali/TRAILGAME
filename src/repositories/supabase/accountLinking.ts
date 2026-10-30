import { getPlayerIdentity } from './playerIdentity'
import { supabaseConfigFromEnv } from './supabaseEnv'
import { loadSupabaseClient } from './supabaseLoader'

/**
 * Account linking (Phase 2B): turns the player's anonymous Supabase user into a permanent one by
 * linking an identity to THE SAME user (email with `updateUser`, Google with `linkIdentity`), so
 * the user id, the profile and the career stay the same. It never signs in as another user, never
 * creates a career, and never reads or changes the local save. Passwords and tokens are passed
 * straight to Supabase: never stored, logged or kept here.
 */

/** The parts of a Supabase user used here. */
export interface AccountUser {
  id: string
  is_anonymous?: boolean
  email?: string
  /** An email linked but not confirmed yet. */
  new_email?: string
  email_confirmed_at?: string
  identities?: { provider: string }[]
}

interface AuthError {
  code?: string
  status?: number
  message?: string
}

type UserResult = Promise<{ data: { user: AccountUser | null }; error: AuthError | null }>

/** The parts of the Supabase client used here (the real client fits; tests pass a fake). */
export interface AccountClient {
  auth: {
    /** The user as the Auth server sees it now (verifies the session, unlike the cached one). */
    getUser(): UserResult
    updateUser(attributes: { email?: string; password?: string }, options?: { emailRedirectTo?: string }): UserResult
    linkIdentity(credentials: {
      provider: 'google' | 'apple'
      options?: { redirectTo?: string }
    }): Promise<{ data: { url?: string | null } | null; error: AuthError | null }>
    signOut(): Promise<{ error: AuthError | null }>
    /** Signs in to another (permanent) account, replacing this device's session. */
    signInWithOAuth(credentials: {
      provider: 'google' | 'apple'
      options?: { redirectTo?: string }
    }): Promise<{ data: { url?: string | null } | null; error: AuthError | null }>
    signInWithPassword(credentials: { email: string; password: string }): UserResult
  }
}

export type LinkProvider = 'google' | 'apple'

export type AccountStatus =
  /** No session yet (the anonymous sign-in is still starting) or Supabase unreachable. */
  | { kind: 'unavailable' }
  | { kind: 'anonymous'; userId: string }
  /** Anonymous, with an email waiting for the player to confirm it from their inbox. */
  | { kind: 'email-pending'; userId: string; email: string }
  /** A permanent account: the same user id, now with one or more identities. */
  | { kind: 'linked'; userId: string; email: string | null; providers: string[] }

export type AccountError =
  | 'offline'
  | 'invalid-email'
  | 'email-unavailable'
  | 'email-in-use'
  | 'identity-in-use'
  | 'weak-password'
  | 'same-password'
  | 'rate-limited'
  | 'linking-disabled'
  | 'provider-disabled'
  | 'not-anonymous'
  | 'not-linked'
  | 'cancelled'
  | 'different-account'
  | 'busy'
  | 'wrong-credentials'
  | 'email-not-confirmed'
  | 'failed'

export type LinkResult =
  /** `signedIn`: the device now uses another, existing account (sign-in, not linking). */
  | { ok: true; status: AccountStatus; signedIn?: true }
  | { ok: false; error: AccountError; status: AccountStatus }

/** Player-facing explanations; the account and the career are unchanged by every failure. */
export const ACCOUNT_ERROR_TEXT: Record<AccountError, string> = {
  offline: 'No connection to the account service. Your game is not affected; try again later.',
  'invalid-email': 'That email address is not valid.',
  'email-unavailable': 'Emails cannot be sent to that address yet. Your guest account keeps working; try Google instead.',
  'email-in-use':
    'That email already belongs to another Trail Game account, so it cannot be added to this one. To play that account here, sign in to it instead.',
  'identity-in-use':
    'That Google account already belongs to another Trail Game account, so it cannot be added to this one. To play that account here, sign in to it instead.',
  'weak-password': 'Choose a longer, stronger password (at least 8 characters).',
  'same-password': 'That is already your password.',
  'rate-limited': 'Too many attempts. Wait a few minutes and try again.',
  'linking-disabled': 'Account linking is not enabled yet. Your guest account keeps working.',
  'provider-disabled': 'This sign-in option is not available yet. Your guest account keeps working.',
  'not-anonymous': 'This account is already linked.',
  'not-linked': 'Linking did not finish. Your guest account is unchanged; you can try again.',
  cancelled: 'Linking was cancelled. Your guest account is unchanged.',
  'different-account':
    'The sign-in returned a different account, so it was not used. Your career on this device is unchanged.',
  busy: 'Already working on it.',
  'wrong-credentials': 'Wrong email or password.',
  'email-not-confirmed': 'Confirm your email first: open the link we sent you.',
  failed: 'Something went wrong. Your guest account is unchanged; try again.',
}

export const MIN_PASSWORD_LENGTH = 8

/** Remembered across the OAuth redirect (no secrets): who started linking, and with what. */
export const PENDING_LINK_KEY = 'trailgame.pendingLink'

interface PendingLink {
  userId: string
  provider: LinkProvider
  /** 'link' (default): add the identity to this user. 'signin': switch to the account that has it. */
  mode?: 'link' | 'signin'
}

/** What an auth redirect brought back in the URL: error codes only, never tokens. */
export interface AuthReturn {
  error: string | null
  errorCode: string | null
}

/**
 * Reads an auth redirect's outcome from a URL (query and hash). Taken when the app starts, before
 * the Supabase client consumes and clears the URL. Tokens are not copied.
 */
export function readAuthReturn(url: string): AuthReturn | null {
  const parsed = new URL(url)
  const params = new URLSearchParams(parsed.search)
  new URLSearchParams(parsed.hash.replace(/^#/, '')).forEach((value, key) => params.set(key, value))
  const error = params.get('error')
  const errorCode = params.get('error_code')
  if (!error && !errorCode && !params.has('access_token') && !params.has('code')) return null
  return { error, errorCode }
}

function statusOf(user: AccountUser | null): AccountStatus {
  if (!user) return { kind: 'unavailable' }
  if (user.is_anonymous) {
    return user.new_email ? { kind: 'email-pending', userId: user.id, email: user.new_email } : { kind: 'anonymous', userId: user.id }
  }
  const providers = [...new Set((user.identities ?? []).map((identity) => identity.provider))]
  return { kind: 'linked', userId: user.id, email: user.email ?? null, providers }
}

function errorOf(error: AuthError | null | undefined): AccountError {
  switch (error?.code) {
    case 'email_exists':
    case 'user_already_exists':
    case 'email_conflict_identity_not_deletable':
      return 'email-in-use'
    case 'identity_already_exists':
      return 'identity-in-use'
    case 'email_address_invalid':
      return 'invalid-email'
    // The project's built-in email service only sends to its team (no custom SMTP yet).
    case 'email_address_not_authorized':
      return 'email-unavailable'
    case 'weak_password':
      return 'weak-password'
    case 'same_password':
      return 'same-password'
    case 'invalid_credentials':
      return 'wrong-credentials'
    case 'email_not_confirmed':
      return 'email-not-confirmed'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'rate-limited'
    case 'manual_linking_disabled':
      return 'linking-disabled'
    case 'email_provider_disabled':
    case 'provider_disabled':
    case 'oauth_provider_not_supported':
      return 'provider-disabled'
  }
  // fetch() failures carry no code and no HTTP status.
  if (!error?.status) return 'offline'
  if (/provider is not enabled|unsupported provider/i.test(error.message ?? '')) return 'provider-disabled'
  return 'failed'
}

export interface AccountService {
  /** The account as the Auth server sees it now. */
  status(): Promise<AccountStatus>
  /** Links an email to the anonymous account; Supabase sends a confirmation link to it. */
  linkEmail(email: string): Promise<LinkResult>
  /** Sets or changes the password of a linked account whose email is confirmed. */
  setPassword(password: string): Promise<LinkResult>
  /**
   * Starts linking an OAuth identity to the CURRENT user: the browser leaves for the provider and
   * comes back to `redirectTo`, where `completeRedirect` checks the result.
   */
  startOAuthLink(provider: LinkProvider): Promise<LinkResult>
  /**
   * After an OAuth redirect: verifies with the Auth server that the user is the same one that
   * started linking and now has the identity. Null when no linking was in progress.
   */
  completeRedirect(): Promise<LinkResult | null>
  /**
   * Signs this device in to an account linked before (on another device), replacing the guest
   * session. The browser leaves for the provider; `completeRedirect` checks the result.
   */
  startOAuthSignIn(provider: LinkProvider): Promise<LinkResult>
  /** Signs in with email and password; on success the app restarts as that account. */
  signInWithPassword(email: string, password: string): Promise<LinkResult>
  /** Signs out, only when the player asks (not offered in the UI yet). */
  signOut(): Promise<void>
}

interface AccountServiceOptions {
  /** Where Supabase sends the player back (email confirmation, OAuth). */
  redirectTo: string
  /** The auth redirect read from the URL when the app started, if any. */
  authReturn: AuthReturn | null
  /** Holds the pending link across the redirect (sessionStorage in the app). */
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  /** Sends the browser to the provider (tests record it instead). */
  navigate(url: string): void
  /** Restarts the app after switching accounts, so every part starts as the new user. */
  reload?(): void
  /**
   * Waits for the player's session (the shared anonymous sign-in, which never signs in twice), so
   * opening Settings right at startup does not read the account before it exists.
   */
  ensureSession?(): Promise<unknown>
}

export function createAccountService(load: () => Promise<AccountClient>, options: AccountServiceOptions): AccountService {
  /** One linking operation at a time (double taps, repeated submits). */
  let busy = false

  async function currentUser(): Promise<{ user: AccountUser | null; error: AuthError | null }> {
    try {
      await options.ensureSession?.()
      const client = await load()
      const { data, error } = await client.auth.getUser()
      return { user: error ? null : data.user, error }
    } catch (error) {
      return { user: null, error: { message: String(error) } }
    }
  }

  async function status(): Promise<AccountStatus> {
    return statusOf((await currentUser()).user)
  }

  /** Runs one linking operation, refusing a second one while it runs. */
  async function exclusive(run: () => Promise<LinkResult>): Promise<LinkResult> {
    if (busy) return { ok: false, error: 'busy', status: await status() }
    busy = true
    try {
      return await run()
    } catch (error) {
      return { ok: false, error: errorOf(error as AuthError), status: await status() }
    } finally {
      busy = false
    }
  }

  function readPending(): PendingLink | null {
    try {
      const raw = options.storage?.getItem(PENDING_LINK_KEY)
      return raw ? (JSON.parse(raw) as PendingLink) : null
    } catch {
      return null
    }
  }

  function clearPending() {
    try {
      options.storage?.removeItem(PENDING_LINK_KEY)
    } catch {
      // Nothing to clear.
    }
  }

  return {
    status,

    linkEmail(email) {
      return exclusive(async () => {
        const trimmed = email.trim()
        const before = await currentUser()
        const start = statusOf(before.user)
        if (!before.user) return { ok: false, error: errorOf(before.error), status: start }
        if (start.kind === 'linked') return { ok: false, error: 'not-anonymous', status: start }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { ok: false, error: 'invalid-email', status: start }
        const client = await load()
        const { data, error } = await client.auth.updateUser({ email: trimmed }, { emailRedirectTo: options.redirectTo })
        if (error || !data.user) return { ok: false, error: errorOf(error), status: start }
        // updateUser acts on the signed-in user; anything else is refused, never adopted.
        if (data.user.id !== before.user.id) return { ok: false, error: 'different-account', status: start }
        return { ok: true, status: statusOf(data.user) }
      })
    },

    setPassword(password) {
      return exclusive(async () => {
        const before = await currentUser()
        const start = statusOf(before.user)
        if (!before.user) return { ok: false, error: errorOf(before.error), status: start }
        if (start.kind !== 'linked' || !start.email) return { ok: false, error: 'not-linked', status: start }
        if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: 'weak-password', status: start }
        const client = await load()
        const { data, error } = await client.auth.updateUser({ password })
        if (error || !data.user) return { ok: false, error: errorOf(error), status: start }
        if (data.user.id !== before.user.id) return { ok: false, error: 'different-account', status: start }
        return { ok: true, status: statusOf(data.user) }
      })
    },

    startOAuthLink(provider) {
      return exclusive(async () => {
        const before = await currentUser()
        const start = statusOf(before.user)
        if (!before.user) return { ok: false, error: errorOf(before.error), status: start }
        if (start.kind === 'linked' && start.providers.includes(provider)) {
          return { ok: false, error: 'not-anonymous', status: start }
        }
        const client = await load()
        try {
          options.storage?.setItem(PENDING_LINK_KEY, JSON.stringify({ userId: before.user.id, provider } satisfies PendingLink))
        } catch {
          // Without sessionStorage the return is still checked against the provider list.
        }
        const { data, error } = await client.auth.linkIdentity({ provider, options: { redirectTo: options.redirectTo } })
        if (error || !data?.url) {
          clearPending()
          return { ok: false, error: errorOf(error), status: start }
        }
        options.navigate(data.url)
        return { ok: true, status: start }
      })
    },

    startOAuthSignIn(provider) {
      return exclusive(async () => {
        const before = await currentUser()
        const start = statusOf(before.user)
        const client = await load()
        try {
          options.storage?.setItem(
            PENDING_LINK_KEY,
            JSON.stringify({ userId: before.user?.id ?? '', provider, mode: 'signin' } satisfies PendingLink),
          )
        } catch {
          // The return is still checked with the Auth server.
        }
        const { data, error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: options.redirectTo } })
        if (error || !data?.url) {
          clearPending()
          return { ok: false, error: errorOf(error), status: start }
        }
        options.navigate(data.url)
        return { ok: true, status: start }
      })
    },

    signInWithPassword(email, password) {
      return exclusive(async () => {
        const start = await status()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password) {
          return { ok: false, error: 'wrong-credentials', status: start }
        }
        const client = await load()
        const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password })
        if (error || !data.user) return { ok: false, error: errorOf(error), status: start }
        const now = statusOf(data.user)
        options.reload?.()
        return { ok: true, status: now, signedIn: true }
      })
    },

    async completeRedirect() {
      const pending = readPending()
      if (!pending) return null
      clearPending()
      const after = await currentUser()
      const now = statusOf(after.user)
      const returned = options.authReturn
      if (returned?.error || returned?.errorCode) {
        const error: AccountError =
          returned.errorCode === 'identity_already_exists'
            ? 'identity-in-use'
            : returned.error === 'access_denied'
              ? 'cancelled'
              : errorOf({ code: returned.errorCode ?? undefined, status: 400 })
        return { ok: false, error, status: now }
      }
      if (!after.user) return { ok: false, error: errorOf(after.error), status: now }
      if (pending.mode === 'signin') {
        // Signing in switches accounts: proof is a permanent account with that identity.
        if (now.kind !== 'linked' || !now.providers.includes(pending.provider)) {
          return { ok: false, error: 'not-linked', status: now }
        }
        return { ok: true, status: now, signedIn: true }
      }
      // Proof of linking is the Auth server's user: the same id, now with the identity.
      if (after.user.id !== pending.userId) return { ok: false, error: 'different-account', status: now }
      if (now.kind !== 'linked' || !now.providers.includes(pending.provider)) {
        return { ok: false, error: 'not-linked', status: now }
      }
      return { ok: true, status: now }
    },

    async signOut() {
      const client = await load()
      await client.auth.signOut()
    },
  }
}

/** The auth redirect in the address bar when the app started (read once, before the client). */
const startupReturn = typeof window === 'undefined' ? null : readAuthReturn(window.location.href)

let shared: AccountService | null | undefined

/** The app's account service, or null when Supabase is not configured. */
export function getAccountService(): AccountService | null {
  if (shared === undefined) {
    shared =
      supabaseConfigFromEnv().status === 'configured'
        ? createAccountService(async () => (await loadSupabaseClient()) as unknown as AccountClient, {
            redirectTo: `${window.location.origin}/settings`,
            authReturn: startupReturn,
            storage: safeSessionStorage(),
            navigate: (url) => window.location.assign(url),
            reload: () => window.location.reload(),
            ensureSession: () => getPlayerIdentity()?.start() ?? Promise.resolve(null),
          })
        : null
  }
  return shared
}

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}
