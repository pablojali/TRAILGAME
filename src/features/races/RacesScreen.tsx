import { useI18n } from '../../i18n/i18n'
import { Link, useSearchParams } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import { Screen } from '../../components/Screen'
import { Tabs } from '../../components/Tabs'
import { getLevel } from '../../domain/athlete/levels'
import { canEnterAtLevel, getMaximumLevel, getMinimumLevel } from '../../domain/races/access'
import { DIFFICULTIES, difficultyOf, isDifficulty, type Difficulty } from '../../domain/races/format'
import { getRace, RACES } from '../../domain/races/races'
import { getPendingEntry } from '../../game-engine/races'
import { RacePhoto } from './RacePhoto'
import { courseText } from './raceText'
import styles from './Races.module.css'

/** The difficulty shown first: the pending entry's, else the first with a race at or above the level. */
function defaultDifficulty(level: number, pending: Difficulty | undefined): Difficulty {
  if (pending) return pending
  const race = RACES.find((candidate) => candidate.recommendedLevel >= level)
  return race ? difficultyOf(race) : DIFFICULTIES.at(-1)!
}

/**
 * Race Hub (Game Design Bible §10.11): the races of one difficulty at a time, in tabs, so the
 * screen fits without scrolling (owner requests, 30 October and 5 November 2026: difficulty I–V
 * instead of the categories); the tab is kept in the URL (`?difficulty=`) so Back from a race
 * returns to it.
 */
export function RacesScreen() {
  const { state } = useCareer()
  const level = getLevel(state.athlete.xp)
  const [params, setParams] = useSearchParams()
  const pending = state.raceEntries.find((entry) => entry.status === 'pending')
  const asked = params.get('difficulty')
  const pendingRace = pending ? getRace(pending.raceId) : undefined
  const difficulty: Difficulty = isDifficulty(asked) ? asked : defaultDifficulty(level, pendingRace && difficultyOf(pendingRace))
  const races = RACES.filter((race) => difficultyOf(race) === difficulty)
  const { t, locale } = useI18n()

  return (
    <Screen
      title={t('races.title')}
      description={t('races.description')}
    >
      <Tabs
        label={t('races.difficulties')}
        tabs={DIFFICULTIES.map((id) => ({ id, label: id }))}
        value={difficulty}
        onChange={(next) => setParams({ difficulty: next }, { replace: true })}
      >
        <ul className={styles.raceList}>
          {races.map((race) => {
            const open = canEnterAtLevel(race, level)
            const entered = getPendingEntry(state, race.id)
            return (
              <li key={race.id}>
                {/* The race's picture fills the card (owner request, 2 November 2026). */}
                <Link to={`/races/${race.id}`} className={styles.raceCard}>
                  <RacePhoto race={race} />
                  <span className={styles.raceBody}>
                    <span className={styles.raceName}>{race.name}</span>
                    <span className={styles.raceMeta}>{courseText(race, t, locale)}</span>
                    <span className={styles.raceTags}>
                      <span className={`${styles.tag} ${open ? '' : styles.tagEarly}`}>
                        {open
                          ? t('races.free')
                          : level < getMinimumLevel(race)
                            ? t('common.lvl', { level: getMinimumLevel(race) })
                            : t('races.upToLevel', { level: getMaximumLevel(race) })}
                      </span>
                      {entered && <span className={`${styles.tag} ${styles.tagEntered}`}>{t('races.entered')}</span>}
                    </span>
                  </span>
                  <span className={styles.chevron} aria-hidden="true">
                    ›
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </Tabs>
    </Screen>
  )
}
