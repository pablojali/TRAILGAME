import { useI18n } from '../../i18n/i18n'
import { useEffect, useId, useRef, useState } from 'react'
import button from '../../components/Button.module.css'
import { getAccountService, type AccountService } from '../../repositories/supabase/accountLinking'
import { SignInPanel } from '../settings/SignInPanel'
import styles from './CareerCreation.module.css'

/**
 * On a new device the career creation is the first screen: this link lets a player who linked an
 * account elsewhere sign in and get their cloud career instead. Hidden without Supabase.
 */
export function SignInLink({ service = getAccountService() }: { service?: AccountService | null }) {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const { t } = useI18n()

  useEffect(() => {
    if (open) heading.current?.focus()
  }, [open])

  if (!service) return null
  return (
    <>
      <button type="button" className={styles.signInLink} onClick={() => setOpen(true)}>
        {t('setup.signInPrompt')}
      </button>
      {open && (
        <div className={styles.signInBackdrop}>
          <section role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.signInDialog}>
            <h2 id={titleId} ref={heading} tabIndex={-1} className={styles.signInTitle}>
              {t('setup.signIn')}
            </h2>
            <SignInPanel service={service} initiallyOpen />
            <button type="button" className={`${button.button} ${button.secondary}`} onClick={() => setOpen(false)}>
              {t('setup.close')}
            </button>
          </section>
        </div>
      )}
    </>
  )
}
