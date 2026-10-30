import { Link, useSearchParams } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import { Coins } from '../../components/Coins'
import { Screen } from '../../components/Screen'
import { Tabs } from '../../components/Tabs'
import { getLevel } from '../../domain/athlete/levels'
import { getEntryFee } from '../../domain/races/access'
import { isRaceCategory, RACE_CATEGORIES, RACE_CATEGORY_CONFIG, type RaceCategory } from '../../domain/races/categories'
import { getRace, RACES } from '../../domain/races/races'
import { getPendingEntry } from '../../game-engine/races'
import { courseText, feeText } from './raceText'
import styles from './Races.module.css'

/** The category shown first: the one with the pending entry, else the first with a race at or above the level. */
function defaultCategory(level: number, pendingCategory: RaceCategory | undefined): RaceCategory {
  if (pendingCategory) return pendingCategory
  return RACES.find((race) => race.recommendedLevel >= level)?.category ?? RACE_CATEGORIES.at(-1)!
}

/**
 * Race Hub (Game Design Bible §10.11): the races of one category at a time, in tabs, so the screen
 * fits without scrolling (owner request, 30 October 2026); the tab is kept in the URL (`?category=`)
 * so Back from a race returns to it.
 */
export function RacesScreen() {
  const { state } = useCareer()
  const level = getLevel(state.athlete.xp)
  const [params, setParams] = useSearchParams()
  const pending = state.raceEntries.find((entry) => entry.status === 'pending')
  const asked = params.get('category')
  const category: RaceCategory = isRaceCategory(asked)
    ? asked
    : defaultCategory(level, pending ? getRace(pending.raceId)?.category : undefined)
  const races = RACES.filter((race) => race.category === category)

  return (
    <Screen
      title="Races"
      description="Pick a race to see its course, fees and prizes. Races below your level are never locked: enter early for a higher fee."
      aside={
        <p className={styles.balance}>
          <span>Level {level}</span>
          <span aria-hidden="true">·</span>
          <Coins amount={state.coins} />
        </p>
      }
    >
      <Tabs
        label="Race categories"
        tabs={RACE_CATEGORIES.map((id) => ({ id, label: RACE_CATEGORY_CONFIG[id].label }))}
        value={category}
        onChange={(next) => setParams({ category: next }, { replace: true })}
      >
        <ul className={styles.raceList}>
          {races.map((race) => {
            const fee = getEntryFee(race, level)
            const entered = getPendingEntry(state, race.id)
            return (
              <li key={race.id}>
                <Link to={`/races/${race.id}`} className={styles.raceCard}>
                  <span className={styles.raceName}>{race.name}</span>
                  <span className={styles.raceMeta}>
                    {courseText(race)} · Rec. Lv {race.recommendedLevel}
                  </span>
                  <span className={styles.raceTags}>
                    <span className={`${styles.tag} ${fee.type === 'early' ? styles.tagEarly : ''}`}>
                      {feeText(fee)}
                    </span>
                    {entered && <span className={`${styles.tag} ${styles.tagEntered}`}>Entered</span>}
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
