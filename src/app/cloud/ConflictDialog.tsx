import { useI18n } from '../../i18n/i18n'
import { useEffect, useId, useRef, useState } from 'react'
import button from '../../components/Button.module.css'
import { getLevel } from '../../domain/athlete/levels'
import { summarize, type CareerSummary } from '../../repositories/cloudSync'
import { useGame } from '../game/gameContext'
import styles from './Cloud.module.css'

/**
 * Shown when this device and the player's cloud save hold different careers (Phase 2C). Nothing
 * is replaced until the player chooses; the career not chosen is replaced by the other one (a copy
 * of this device's career is kept on the device when the cloud one is chosen). Careers are never
 * mixed.
 */
export function ConflictDialog() {
  const { syncConflict, resolveSyncConflict, canKeepDeviceCareer } = useGame()
  const titleId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const [working, setWorking] = useState(false)
  const [failed, setFailed] = useState(false)
  const { t } = useI18n()

  useEffect(() => {
    if (syncConflict) heading.current?.focus()
  }, [syncConflict])

  if (!syncConflict) return null
  const local = summarize(syncConflict.local, getLevel)
  const remote = syncConflict.remote && summarize(syncConflict.remote, getLevel)
  // Progression is kept by the server: a device career that has progressed cannot replace it.
  const keepLocal = canKeepDeviceCareer ? t('conflict.keepLocal') : remote ? null : t('conflict.startNew')

  async function choose(choice: 'local' | 'cloud') {
    if (working) return
    setWorking(true)
    setFailed(false)
    const ok = await resolveSyncConflict(choice)
    setWorking(false)
    setFailed(!ok)
  }

  return (
    <div className={styles.backdrop}>
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.dialog}>
        <h2 id={titleId} ref={heading} tabIndex={-1} className={styles.title}>
          {t('conflict.title')}
        </h2>
        <p className={styles.text}>{t('conflict.text')}</p>
        {!canKeepDeviceCareer && (
          <p className={styles.text}>
            {remote ? t('conflict.serverRemote') : t('conflict.serverNoRemote')}
          </p>
        )}
        <div className={styles.options}>
          <Option title={t('conflict.device')} summary={local} />
          {remote ? (
            <Option title={t('conflict.cloud')} summary={remote} />
          ) : (
            <div className={styles.option}>
              <h3 className={styles.optionTitle}>{t('conflict.cloud')}</h3>
              <p className={styles.text}>{t('conflict.damaged')}</p>
            </div>
          )}
        </div>
        <div className={styles.actions}>
          {keepLocal && (
            <button
              type="button"
              className={`${button.button} ${remote ? button.secondary : button.primary}`}
              aria-disabled={working || undefined}
              onClick={() => choose('local')}
            >
              {keepLocal}
            </button>
          )}
          {remote && (
            <button
              type="button"
              className={`${button.button} ${button.primary}`}
              aria-disabled={working || undefined}
              onClick={() => choose('cloud')}
            >
              {t('conflict.keepCloud')}
            </button>
          )}
        </div>
        {working && (
          <p role="status" className={styles.text}>
            {t('conflict.saving')}
          </p>
        )}
        {failed && (
          <p role="alert" className={styles.error}>
            {t('conflict.failed')}
          </p>
        )}
      </section>
    </div>
  )
}

function Option({ title, summary }: { title: string; summary: CareerSummary }) {
  const { t } = useI18n()
  return (
    <div className={styles.option}>
      <h3 className={styles.optionTitle}>{title}</h3>
      <p className={styles.runner}>{summary.name}</p>
      <dl className={styles.facts}>
        <div>
          <dt>{t('conflict.level')}</dt>
          <dd>{summary.level}</dd>
        </div>
        <div>
          <dt>{t('conflict.week')}</dt>
          <dd>{summary.week}</dd>
        </div>
        <div>
          <dt>{t('conflict.coins')}</dt>
          <dd>{summary.coins}</dd>
        </div>
        <div>
          <dt>{t('conflict.races')}</dt>
          <dd>{summary.races}</dd>
        </div>
      </dl>
    </div>
  )
}
