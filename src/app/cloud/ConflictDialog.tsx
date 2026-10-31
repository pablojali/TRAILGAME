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

  useEffect(() => {
    if (syncConflict) heading.current?.focus()
  }, [syncConflict])

  if (!syncConflict) return null
  const local = summarize(syncConflict.local, getLevel)
  const remote = syncConflict.remote && summarize(syncConflict.remote, getLevel)
  // Progression is kept by the server: a device career that has progressed cannot replace it.
  const keepLocal = canKeepDeviceCareer ? "Keep this device's career" : remote ? null : 'Start a new career with this runner'

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
          Choose your career
        </h2>
        <p className={styles.text}>
          This device and your account's cloud save have different careers. Choose the one to keep: it becomes your
          career on this device and in the cloud, and the other one is replaced. Careers are never mixed.
        </p>
        {!canKeepDeviceCareer && (
          <p className={styles.text}>
            {remote
              ? "Training, races and progress are confirmed by the server, so this device's career cannot replace the cloud career. A copy of it is kept on this device."
              : "Training, races and progress are confirmed by the server, so this device's progress cannot be uploaded. You can start a new career with this runner's name and look."}
          </p>
        )}
        <div className={styles.options}>
          <Option title="This device" summary={local} />
          {remote ? (
            <Option title="Cloud save" summary={remote} />
          ) : (
            <div className={styles.option}>
              <h3 className={styles.optionTitle}>Cloud save</h3>
              <p className={styles.text}>The cloud copy is damaged or from another version of the game and cannot be played.</p>
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
              Keep the cloud career
            </button>
          )}
        </div>
        {working && <p role="status" className={styles.text}>Saving your choice…</p>}
        {failed && (
          <p role="alert" className={styles.error}>
            Your choice could not be saved (no connection, or the cloud changed). Both careers are unchanged; try again.
          </p>
        )}
      </section>
    </div>
  )
}

function Option({ title, summary }: { title: string; summary: CareerSummary }) {
  return (
    <div className={styles.option}>
      <h3 className={styles.optionTitle}>{title}</h3>
      <p className={styles.runner}>{summary.name}</p>
      <dl className={styles.facts}>
        <div>
          <dt>Level</dt>
          <dd>{summary.level}</dd>
        </div>
        <div>
          <dt>Week</dt>
          <dd>{summary.week}</dd>
        </div>
        <div>
          <dt>Coins</dt>
          <dd>{summary.coins}</dd>
        </div>
        <div>
          <dt>Races</dt>
          <dd>{summary.races}</dd>
        </div>
      </dl>
    </div>
  )
}
