import { Link } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import { Screen } from '../../components/Screen'
import { getLevel } from '../../domain/athlete/levels'
import { formatCoins } from '../../domain/economy/coins'
import { getEntryFee } from '../../domain/races/access'
import { RACE_CATEGORIES, RACE_CATEGORY_CONFIG } from '../../domain/races/categories'
import { RACES } from '../../domain/races/races'
import { getPendingEntry } from '../../game-engine/races'
import { courseText, feeText } from './raceText'
import styles from './Races.module.css'

/** Race Hub (Game Design Bible §10.11): every race, grouped by category, with the fee that applies. */
export function RacesScreen() {
  const { state } = useCareer()
  const level = getLevel(state.athlete.xp)

  return (
    <Screen
      title="Races"
      description="Pick a race to see its course, fees and prizes. Races below your level are never locked: enter early for a higher fee."
    >
      <p className={styles.balance}>
        <span>Level {level}</span>
        <span aria-hidden="true">·</span>
        <span>{formatCoins(state.coins)}</span>
      </p>

      {RACE_CATEGORIES.map((category) => {
        const races = RACES.filter((race) => race.category === category)
        const config = RACE_CATEGORY_CONFIG[category]
        return (
          <section key={category} className={styles.group} aria-labelledby={`races-${category}`}>
            <h2 id={`races-${category}`} className={styles.groupTitle}>
              {config.label}
            </h2>
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
          </section>
        )
      })}
    </Screen>
  )
}
