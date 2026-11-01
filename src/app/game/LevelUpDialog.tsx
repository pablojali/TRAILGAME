import { useEffect, useId, useRef } from 'react'
import { useNavigate } from 'react-router'
import button from '../../components/Button.module.css'
import { RACE_CATEGORY_CONFIG } from '../../domain/races/categories'
import { getLevelRewards } from '../../game-engine/levelRewards'
import { useGame } from './gameContext'
import styles from './LevelUpDialog.module.css'

/**
 * Celebration when the runner levels up (owner request, 1 November 2026), shown over any screen as
 * soon as the server (or the device, without one) confirms the day or race: the new level and what
 * it brings (attribute points, looks unlocked, races that open).
 */
export function LevelUpDialog() {
  const { phase, levelUp, dismissLevelUp } = useGame()
  const navigate = useNavigate()
  const titleId = useId()
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (levelUp) heading.current?.focus()
  }, [levelUp])

  useEffect(() => {
    if (!levelUp) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') dismissLevelUp()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [levelUp, dismissLevelUp])

  if (!levelUp || phase.kind !== 'playing') return null
  const { athlete } = phase.state
  const rewards = getLevelRewards(levelUp.from, levelUp.to, athlete.sex, athlete.appearance.skin)

  function go(path: string) {
    dismissLevelUp()
    navigate(path)
  }

  return (
    <div className={styles.backdrop}>
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.dialog}>
        <div className={styles.burst} aria-hidden="true">
          <svg viewBox="0 0 120 120">
            {Array.from({ length: 12 }, (_, i) => (
              <line key={i} x1="60" y1="10" x2="60" y2="24" transform={`rotate(${i * 30} 60 60)`} />
            ))}
            <path d="M60 30 l8.8 18.6 20.4 2.4 -15 14 4 20.2 -18.2 -10.2 -18.2 10.2 4 -20.2 -15 -14 20.4 -2.4 z" />
          </svg>
        </div>
        <h2 id={titleId} ref={heading} tabIndex={-1} className={styles.title}>
          Level up!
        </h2>
        <p className={styles.level}>
          Level {levelUp.from} <span aria-hidden="true">→</span>
          <span className={styles.srOnly}> to </span> <strong>Level {levelUp.to}</strong>
        </p>

        <ul className={styles.rewards} aria-label="Rewards">
          <li>
            <span className={styles.rewardIcon} aria-hidden="true">
              +
            </span>
            <span>
              <strong>{rewards.attributePoints} attribute points</strong> to spend
            </span>
          </li>
          {rewards.looks.length > 0 && (
            <li>
              <span className={styles.rewardIcon} aria-hidden="true">
                ★
              </span>
              <span>
                <strong>New look:</strong> {rewards.looks.join(', ')}
              </span>
            </li>
          )}
          {rewards.races.length > 0 && (
            <li>
              <span className={styles.rewardIcon} aria-hidden="true">
                ⚑
              </span>
              <span>
                <strong>Races open:</strong>{' '}
                {rewards.races.map((race) => `${race.name} (${RACE_CATEGORY_CONFIG[race.category].label})`).join(', ')}
              </span>
            </li>
          )}
        </ul>

        <div className={styles.actions}>
          <button type="button" className={`${button.button} ${button.primary}`} onClick={() => go('/attributes')}>
            Spend points
          </button>
          {rewards.looks.length > 0 && (
            <button type="button" className={`${button.button} ${button.secondary}`} onClick={() => go('/appearance')}>
              Change look
            </button>
          )}
          <button type="button" className={`${button.button} ${button.secondary}`} onClick={dismissLevelUp}>
            Continue
          </button>
        </div>
      </section>
    </div>
  )
}
