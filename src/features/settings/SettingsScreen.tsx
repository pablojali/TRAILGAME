import { useEffect, useRef, useState } from 'react'
import { useGame } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { Card } from '../../components/Card'
import { Screen, ScrollPanel } from '../../components/Screen'
import { getAccountService, type AccountService } from '../../repositories/supabase/accountLinking'
import { CLOUD_STATUS_TEXT } from '../../app/cloud/cloudText'
import { AccountCard } from './AccountCard'
import styles from './SettingsScreen.module.css'

/**
 * Settings, behind the top bar's icon: the account (Phase 2B, when Supabase is configured) and the
 * demo reset. `accountService` is for tests; the app uses the configured one.
 */
export function SettingsScreen({ accountService = getAccountService() }: { accountService?: AccountService | null }) {
  return (
    <Screen title="Settings" description="Game options.">
      <ScrollPanel label="Settings">
        {accountService && <AccountCard service={accountService} />}
        <CloudSaveCard />
        <ResetDemo />
      </ScrollPanel>
    </Screen>
  )
}

/** The cloud save's state, with a retry when it is pending. Hidden without Supabase. */
function CloudSaveCard() {
  const { cloudStatus, retrySync } = useGame()
  if (cloudStatus === 'off') return null
  return (
    <Card title="Cloud save">
      <p className={styles.muted}>{CLOUD_STATUS_TEXT[cloudStatus]}.</p>
      {cloudStatus === 'pending' && (
        <div className={styles.actions}>
          <button type="button" className={`${button.button} ${button.secondary}`} onClick={retrySync}>
            Retry now
          </button>
        </div>
      )}
    </Card>
  )
}

function ResetDemo() {
  const { resetCareer } = useGame()
  const [confirming, setConfirming] = useState(false)
  const resetButton = useRef<HTMLButtonElement>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)
  // Keeps keyboard focus on the visible control when the buttons swap.
  const focusTarget = useRef<'reset' | 'confirm' | null>(null)

  useEffect(() => {
    if (focusTarget.current === 'reset') resetButton.current?.focus()
    if (focusTarget.current === 'confirm') confirmButton.current?.focus()
    focusTarget.current = null
  }, [confirming])

  function toggle(next: boolean) {
    focusTarget.current = next ? 'confirm' : 'reset'
    setConfirming(next)
  }

  return (
    <Card title="Demo">
      {confirming ? (
        <>
          <p className={styles.muted}>
            This erases all saved progress. You will then choose a new starting profile; with cloud save on, the new
            career replaces the one in your cloud save.
          </p>
          <div className={styles.actions}>
            <button ref={confirmButton} type="button" className={`${button.button} ${button.danger}`} onClick={resetCareer}>
              Confirm reset
            </button>
            <button type="button" className={`${button.button} ${button.secondary}`} onClick={() => toggle(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.muted}>Start over with a new career and starting profile.</p>
          <div className={styles.actions}>
            <button ref={resetButton} type="button" className={`${button.button} ${button.secondary}`} onClick={() => toggle(true)}>
              Reset demo
            </button>
          </div>
        </>
      )}
    </Card>
  )
}
