import { useEffect, useId, useRef, useState } from 'react'
import { CountrySelect } from '../../components/CountrySelect'
import { isLocale, LOCALES, useI18n } from '../../i18n/i18n'
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
  const { t } = useI18n()
  return (
    <Screen title={t('settings.title')} description={t('settings.description')}>
      <ScrollPanel label={t('settings.title')}>
        <LanguageCard />
        <RunnerCard />
        {accountService && <AccountCard service={accountService} />}
        <CloudSaveCard />
        <ResetDemo />
      </ScrollPanel>
    </Screen>
  )
}

/** The game's language (owner request, 4 November 2026), kept on this device. */
function LanguageCard() {
  const { locale, setLocale, t } = useI18n()
  const id = useId()
  return (
    <Card title={t('settings.languageCard')}>
      <label htmlFor={id} className={styles.label}>
        {t('settings.language')}
      </label>
      <select id={id} className={styles.select} value={locale} onChange={(event) => isLocale(event.target.value) && setLocale(event.target.value)}>
        {LOCALES.map(({ id: value, label }) => (
          <option key={value} value={value} lang={value}>
            {label}
          </option>
        ))}
      </select>
    </Card>
  )
}

/** The runner's country (owner request, 4 November 2026), also for careers started before it existed. */
function RunnerCard() {
  const { phase, setCountry } = useGame()
  const id = useId()
  const { t } = useI18n()
  if (phase.kind !== 'playing') return null
  const country = phase.state.athlete.country ?? ''
  return (
    <Card title={t('settings.runner')}>
      <label htmlFor={id} className={styles.label}>
        {t('settings.country')}
      </label>
      <CountrySelect id={id} className={styles.select} value={country} onChange={(code) => setCountry(code)} />
      {!country && <p className={styles.muted}>{t('settings.chooseCountry')}</p>}
    </Card>
  )
}

/** The cloud save's state, with a retry when it is pending. Hidden without Supabase. */
function CloudSaveCard() {
  const { cloudStatus, retrySync } = useGame()
  const { t } = useI18n()
  if (cloudStatus === 'off') return null
  return (
    <Card title={t('settings.cloud')}>
      <p className={styles.muted}>{t(CLOUD_STATUS_TEXT[cloudStatus])}.</p>
      {cloudStatus === 'pending' && (
        <div className={styles.actions}>
          <button type="button" className={`${button.button} ${button.secondary}`} onClick={retrySync}>
            {t('settings.retry')}
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
  const { t } = useI18n()

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
    <Card title={t('settings.demo')}>
      {confirming ? (
        <>
          <p className={styles.muted}>{t('settings.resetWarning')}</p>
          <div className={styles.actions}>
            <button ref={confirmButton} type="button" className={`${button.button} ${button.danger}`} onClick={resetCareer}>
              {t('settings.confirmReset')}
            </button>
            <button type="button" className={`${button.button} ${button.secondary}`} onClick={() => toggle(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.muted}>{t('settings.startOver')}</p>
          <div className={styles.actions}>
            <button ref={resetButton} type="button" className={`${button.button} ${button.secondary}`} onClick={() => toggle(true)}>
              {t('settings.reset')}
            </button>
          </div>
        </>
      )}
    </Card>
  )
}
