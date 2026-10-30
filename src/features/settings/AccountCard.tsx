import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import button from '../../components/Button.module.css'
import { Card } from '../../components/Card'
import {
  ACCOUNT_ERROR_TEXT,
  MIN_PASSWORD_LENGTH,
  type AccountService,
  type AccountStatus,
  type LinkResult,
} from '../../repositories/supabase/accountLinking'
import styles from './SettingsScreen.module.css'

const PROVIDER_NAMES: Record<string, string> = { email: 'Email', google: 'Google', apple: 'Apple' }

type Message = { kind: 'success' | 'error'; text: string } | null

/**
 * Account (Phase 2B): shows whether the player is a guest (anonymous) or has a linked account, and
 * links an email or Google to the same account. Never required to play: the game, its local save
 * and the career are unchanged by anything here.
 */
export function AccountCard({ service }: { service: AccountService }) {
  const [status, setStatus] = useState<AccountStatus | null>(null)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState<Message>(null)

  const show = useCallback((result: LinkResult, success: string) => {
    setStatus(result.status)
    setMessage(result.ok ? { kind: 'success', text: success } : { kind: 'error', text: ACCOUNT_ERROR_TEXT[result.error] })
  }, [])

  // On opening: finish a Google link the player is coming back from, else read the account.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const returned = await service.completeRedirect()
      if (cancelled) return
      if (returned) show(returned, 'Google account linked. Your career and progress are unchanged.')
      else setStatus(await service.status())
    })()
    return () => {
      cancelled = true
    }
  }, [service, show])

  // The email may be confirmed in another tab or app: read the account again when coming back.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') void service.status().then(setStatus)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [service])

  async function run(action: () => Promise<LinkResult>, success: string) {
    if (working) return
    setWorking(true)
    setMessage(null)
    try {
      show(await action(), success)
    } finally {
      setWorking(false)
    }
  }

  return (
    <Card title="Account">
      {status === null && <p className={styles.muted}>Checking your account…</p>}
      {status?.kind === 'unavailable' && (
        <>
          <p className={styles.muted}>
            The account service is not reachable right now. You can keep playing; your career is saved on this device.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={`${button.button} ${button.secondary}`}
              onClick={() => void service.status().then(setStatus)}
            >
              Try again
            </button>
          </div>
        </>
      )}
      {(status?.kind === 'anonymous' || status?.kind === 'email-pending') && (
        <>
          <p>
            <strong>Guest account.</strong>{' '}
            <span className={styles.muted}>
              Your career is saved on this device. Link an email or a Google account to keep access to your account
              if you change or lose your phone. It is optional: you can keep playing as a guest.
            </span>
          </p>
          {status.kind === 'email-pending' && (
            <p className={styles.notice}>
              Check your inbox: we sent a confirmation link to <strong>{status.email}</strong>. Open it to finish
              linking.
            </p>
          )}
          <EmailForm
            key={status.kind === 'email-pending' ? status.email : 'new'}
            label={status.kind === 'email-pending' ? 'Use another email, or send the link again' : 'Email'}
            initial={status.kind === 'email-pending' ? status.email : ''}
            working={working}
            onSubmit={(email) =>
              run(() => service.linkEmail(email), 'Confirmation email sent.')
            }
          />
          <p className={styles.or}>or</p>
          <div className={styles.actions}>
            <button
              type="button"
              className={`${button.button} ${button.secondary}`}
              aria-disabled={working || undefined}
              onClick={() => run(() => service.startOAuthLink('google'), 'Opening Google…')}
            >
              Link Google account
            </button>
          </div>
        </>
      )}
      {status?.kind === 'linked' && (
        <>
          <p>
            <strong>Linked account.</strong>{' '}
            <span className={styles.muted}>
              {[status.email, status.providers.map((p) => PROVIDER_NAMES[p] ?? p).join(', ')].filter(Boolean).join(' · ')}.
              Your account and career are protected.
            </span>
          </p>
          {status.email && status.providers.includes('email') && (
            <PasswordForm
              working={working}
              onSubmit={(password) =>
                run(() => service.setPassword(password), 'Password saved. You can sign in with your email and password.')
              }
            />
          )}
        </>
      )}
      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? styles.error : styles.success}>
          {message.text}
        </p>
      )}
    </Card>
  )
}

function EmailForm({
  label,
  initial,
  working,
  onSubmit,
}: {
  label: string
  initial: string
  working: boolean
  onSubmit(email: string): void
}) {
  const id = useId()
  const [email, setEmail] = useState(initial)
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!working) onSubmit(email)
  }
  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.row}>
        <input
          id={id}
          className={styles.input}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button type="submit" className={`${button.button} ${button.primary}`} aria-disabled={working || undefined}>
          Link email
        </button>
      </div>
    </form>
  )
}

function PasswordForm({ working, onSubmit }: { working: boolean; onSubmit(password: string): void }) {
  const id = useId()
  const hintId = useId()
  const [password, setPassword] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    if (working) return
    onSubmit(password)
    // The password is not kept once it has been sent.
    setPassword('')
  }
  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label htmlFor={id} className={styles.label}>
        Password (optional)
      </label>
      <div className={styles.row}>
        <input
          id={id}
          className={styles.input}
          type="password"
          autoComplete="new-password"
          aria-describedby={hintId}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" className={`${button.button} ${button.primary}`} aria-disabled={working || undefined}>
          Set password
        </button>
      </div>
      <p id={hintId} className={styles.hint}>
        At least {MIN_PASSWORD_LENGTH} characters. Lets you sign in with your email and password.
      </p>
    </form>
  )
}
