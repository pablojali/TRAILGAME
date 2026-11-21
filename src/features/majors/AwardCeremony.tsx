import { useEffect, useRef } from 'react'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { Avatar } from '../../components/avatar/Avatar'
import { countryFlag } from '../../domain/athlete/countries'
import { useI18n } from '../../i18n/i18n'
import type { LiveRace } from '../../server/majorOps'
import { ordinal, raceTimeText } from '../races/raceText'
import styles from './Majors.module.css'

/** Podium steps from left to right: 2nd, 1st, 3rd. */
const STEPS = [2, 1, 3] as const

/**
 * The awards at the end of a Major (owner request, 21 November 2026): the podium of the player's
 * category, the player's own face on it when they made the top 3, and below, their place, time and
 * what it gives. Shown over the live race once the category finishes; it closes on the standings.
 */
export function AwardCeremony({ majorName, race, onClose }: { majorName: string; race: LiveRace; onClose(): void }) {
  const { state } = useCareer()
  const { t, locale } = useI18n()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  const mine = race.standings.find((row) => row.me)
  const { athlete } = state
  const face = (label?: string) => <Avatar sex={athlete.sex} appearance={athlete.appearance} equipment={state.equipment} crop="head" label={label} />

  return (
    <section className={styles.awards} aria-labelledby="major-awards-title">
      <p className={styles.awardsEyebrow}>{majorName}</p>
      <h2 id="major-awards-title" ref={heading} tabIndex={-1} className={styles.awardsTitle}>
        {t('major.award.title', { category: race.category.name })}
      </h2>

      <ol className={styles.podium} aria-label={t('major.award.podium')}>
        {STEPS.map((place) => {
          const row = race.standings.find((r) => r.position === place)
          if (!row) return <li key={place} className={styles[`step${place}`]} />
          return (
            <li key={place} className={`${styles[`step${place}`]} ${row.me ? styles.stepMe : ''}`}>
              <span className={styles.podiumFace}>{row.me ? face() : <span className={styles.podiumInitial}>{row.name.slice(0, 1).toUpperCase()}</span>}</span>
              <span className={styles.podiumName}>
                {row.country ? `${countryFlag(row.country)} ` : ''}
                {row.me ? t('major.award.you') : row.name}
              </span>
              <span className={styles.podiumTime}>{raceTimeText(row.timeS)}</span>
              <span className={styles.podiumBlock} aria-hidden="true">
                {place}
              </span>
            </li>
          )
        })}
      </ol>

      {mine && (
        <section className={styles.awardsMine} aria-label={t('major.award.yours')}>
          <span className={styles.awardsMineFace}>{face(athlete.name)}</span>
          <div>
            <p className={styles.awardsPlace}>
              {ordinal(mine.position, locale)} <span>{t('major.award.of', { field: race.standings.length })}</span>
            </p>
            <p className={styles.awardsTime}>{raceTimeText(mine.timeS)}</p>
            {race.prize && <p className={styles.awardsPrize}>{t('major.award.prize', race.prize)}</p>}
          </div>
        </section>
      )}

      <button type="button" className={`${button.button} ${button.primary} ${button.block}`} onClick={onClose}>
        {t('major.award.close')}
      </button>
    </section>
  )
}
