import { lookName } from '../../i18n/looks'
import { difficultyOf } from '../../domain/races/format'
import { useI18n } from '../../i18n/i18n'
import { useEffect, useId, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import button from '../../components/Button.module.css'
import { getLevelRewards } from '../../game-engine/levelRewards'
import { useGame } from './gameContext'
import { inRace } from './inRace'
import styles from './LevelUpDialog.module.css'

/**
 * Celebration when the runner levels up (owner request, 1 November 2026), shown over any screen as
 * soon as the server (or the device, without one) confirms the day or race: the new level and what
 * it brings (attribute points, looks unlocked, races that open). Never during a race (its last
 * segment's clip is still playing): it waits for the result screen (owner report, 9 November 2026).
 */

export function LevelUpDialog() {
  const { phase, levelUp, dismissLevelUp } = useGame()
  const navigate = useNavigate()
  const titleId = useId()
  const { t, locale } = useI18n()
  const heading = useRef<HTMLHeadingElement>(null)
  const racing = inRace(useLocation().pathname)

  useEffect(() => {
    if (levelUp && !racing) heading.current?.focus()
  }, [levelUp, racing])

  useEffect(() => {
    if (!levelUp || racing) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') dismissLevelUp()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [levelUp, racing, dismissLevelUp])

  if (!levelUp || racing || phase.kind !== 'playing') return null
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
          {t('levelUp.title')}
        </h2>
        <p className={styles.level}>
          {t('levelUp.from', { level: levelUp.from })} <span aria-hidden="true">→</span>
          <span className={styles.srOnly}>{t('levelUp.to')}</span> <strong>{t('levelUp.from', { level: levelUp.to })}</strong>
        </p>

        <ul className={styles.rewards} aria-label={t('levelUp.rewards')}>
          <li>
            <span className={styles.rewardIcon} aria-hidden="true">
              +
            </span>
            <span>
              <strong>{t('levelUp.points', { count: rewards.attributePoints })}</strong>
              {t('levelUp.toSpend')}
            </span>
          </li>
          {rewards.looks.length > 0 && (
            <li>
              <span className={styles.rewardIcon} aria-hidden="true">
                ★
              </span>
              <span>
                <strong>{t('levelUp.newLook')}</strong> {rewards.looks.map((look) => lookName(look, locale, t)).join(', ')}
              </span>
            </li>
          )}
          {rewards.races.length > 0 && (
            <li>
              <span className={styles.rewardIcon} aria-hidden="true">
                ⚑
              </span>
              <span>
                <strong>{t('levelUp.racesOpen')}</strong>{' '}
                {rewards.races.map((race) => `${race.name} (${t('race.difficulty', { difficulty: difficultyOf(race) })})`).join(', ')}
              </span>
            </li>
          )}
        </ul>

        <div className={styles.actions}>
          <button type="button" className={`${button.button} ${button.primary}`} onClick={() => go('/attributes')}>
            {t('levelUp.spend')}
          </button>
          {rewards.looks.length > 0 && (
            <button type="button" className={`${button.button} ${button.secondary}`} onClick={() => go('/appearance')}>
              {t('common.changeLook')}
            </button>
          )}
          <button type="button" className={`${button.button} ${button.secondary}`} onClick={dismissLevelUp}>
            {t('common.continue')}
          </button>
        </div>
      </section>
    </div>
  )
}
