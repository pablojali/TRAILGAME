import { useEffect, useId, useRef } from 'react'
import button from '../../components/Button.module.css'
import { ACHIEVEMENTS } from '../../game-engine/achievements'
import { useI18n, type MessageKey } from '../../i18n/i18n'
import { achievementTitleKey, type AchievementKeyId } from '../../i18n/labels'
import { useGame } from './gameContext'
import styles from './LevelUpDialog.module.css'

/**
 * "Challenge completed!" (owner design, 5 November 2026): shown when a training day or a race
 * reaches an achievement level, one at a time, after any level-up celebration. The coins and XP
 * are already paid by the game; the dialog only tells the player.
 */
export function ChallengeDialog() {
  const { phase, levelUp, challengeDone, dismissChallenge } = useGame()
  const { t, locale } = useI18n()
  const titleId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const shown = phase.kind === 'playing' && !levelUp && challengeDone !== null

  useEffect(() => {
    if (shown) heading.current?.focus()
  }, [shown, challengeDone])

  useEffect(() => {
    if (!shown) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') dismissChallenge()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shown, dismissChallenge])

  if (!shown || !challengeDone) return null
  const id = challengeDone.id as AchievementKeyId
  const target = ACHIEVEMENTS.find((a) => a.id === id)?.targets[challengeDone.level - 1] ?? 0
  const number = (n: number) => n.toLocaleString(locale)

  return (
    <div className={styles.backdrop}>
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.dialog}>
        <span className={styles.trophy} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8l-1-3H9z" />
          </svg>
        </span>
        <h2 id={titleId} ref={heading} tabIndex={-1} className={`${styles.title} ${styles.challengeTitle}`}>
          {t('challenge.title')}
        </h2>
        <p className={styles.challengeName}>
          {t(achievementTitleKey(id))} · {t('career.level', { level: challengeDone.level })}
        </p>
        <p className={styles.challengeText}>
          {t(`achievement.done.${id}` as MessageKey, { count: target, number: number(target) })} {t('challenge.milestone')}
        </p>
        <ul className={styles.challengeRewards}>
          {challengeDone.coins > 0 && (
            <li>
              <span className={styles.rewardIconCoin} aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="9" cy="9" r="6" />
                  <path d="M15.5 9.5a6 6 0 1 1-6 6M9 6.5v5" />
                </svg>
              </span>
              <span className={styles.rewardValue}>{number(challengeDone.coins)}</span>
              <span className={styles.rewardLabel}>{t('challenge.coins')}</span>
            </li>
          )}
          {challengeDone.xp > 0 && (
            <li>
              <span className={styles.rewardIconCoin} aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
                </svg>
              </span>
              <span className={styles.rewardValue}>{number(challengeDone.xp)}</span>
              <span className={styles.rewardLabel}>XP</span>
            </li>
          )}
        </ul>
        <p className={styles.claimed}>{t('challenge.claimed')}</p>
        <div className={styles.actions}>
          <button type="button" className={`${button.button} ${button.primary}`} onClick={dismissChallenge}>
            {t('common.continue')}
          </button>
        </div>
      </section>
    </div>
  )
}
