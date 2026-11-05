import { useI18n, type MessageKey } from '../../i18n/i18n'
import { useId, useState, type FormEvent } from 'react'
import button from '../../components/Button.module.css'
import type { AccountService, LinkResult } from '../../repositories/supabase/accountLinking'
import styles from './SettingsScreen.module.css'

/**
 * Sign in to an account linked on another device (Phase 2C), to play its cloud career here.
 * Collapsed by default. If this device already has a career, the game then asks which one to keep;
 * nothing is replaced without that choice.
 */
export function SignInPanel({ service, initiallyOpen = false }: { service: AccountService; initiallyOpen?: boolean }) {
  const emailId = useId()
  const passwordId = useId()
  const [open, setOpen] = useState(initiallyOpen)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const { t } = useI18n()

  async function run(action: () => Promise<LinkResult>) {
    if (working) return
    setWorking(true)
    setError('')
    const result = await action()
    setWorking(false)
    if (!result.ok) setError(t(`account.error.${result.error}` as MessageKey))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const sent = password
    // The password is not kept once it has been sent.
    setPassword('')
    void run(() => service.signInWithPassword(email, sent))
  }

  if (!open) {
    return (
      <div className={styles.actions}>
        <button type="button" className={`${button.button} ${button.secondary}`} onClick={() => setOpen(true)}>
          {t('account.signInExisting')}
        </button>
      </div>
    )
  }

  return (
    <section className={styles.form} aria-label={t('account.signInExisting')}>
      <p className={styles.hint}>{t('account.signInHint')}</p>
      <div className={styles.actions}>
        <button
          type="button"
          className={`${button.button} ${button.secondary}`}
          aria-disabled={working || undefined}
          onClick={() => run(() => service.startOAuthSignIn('google'))}
        >
          {t('account.signInGoogle')}
        </button>
      </div>
      <form className={styles.form} onSubmit={submit} noValidate>
        <label htmlFor={emailId} className={styles.label}>
          {t('account.email')}
        </label>
        <input
          id={emailId}
          className={styles.input}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor={passwordId} className={styles.label}>
          {t('account.password')}
        </label>
        <div className={styles.row}>
          <input
            id={passwordId}
            className={styles.input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button type="submit" className={`${button.button} ${button.primary}`} aria-disabled={working || undefined}>
            {t('account.signIn')}
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  )
}
