import { Link, useSearchParams } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import { Card, Meter } from '../../components/Card'
import { MedalIcon } from '../../components/Medal'
import { Screen, ScrollPanel } from '../../components/Screen'
import { Tabs } from '../../components/Tabs'
import { RACE_CATEGORIES, RACE_CATEGORY_CONFIG } from '../../domain/races/categories'
import { WEEKS_PER_YEAR } from '../../domain/training/calendar'
import { weekdayShort } from '../../domain/training/weekdays'
import { getAchievements, getSeason, type AchievementProgress } from '../../game-engine/achievements'
import {
  getMedalTable,
  getPersonalBests,
  getRaceHistory,
  MEDAL_LABELS,
  medalFor,
  type Medal,
  type MedalCount,
} from '../../game-engine/career'
import { ordinal, raceTimeText } from '../races/raceText'
import styles from './CareerScreen.module.css'

const MEDALS: readonly Medal[] = ['gold', 'silver', 'bronze']

const CAREER_TABS = [
  { id: 'achievements', label: 'Achievements' },
  { id: 'medals', label: 'Trophies' },
  { id: 'bests', label: 'Bests' },
  { id: 'history', label: 'History' },
] as const

/** Position with its medal, e.g. "🥇 1st of 50". */
function Position({ position, fieldSize }: { position: number; fieldSize?: number }) {
  const medal = medalFor(position)
  return (
    <span className={styles.position}>
      {medal && <MedalIcon medal={medal} />}
      {ordinal(position)}
      {fieldSize !== undefined && <span className={styles.muted}> of {fieldSize}</span>}
    </span>
  )
}

/**
 * Career (owner request, 30 October 2026): the historic medal table, personal bests and every race
 * run, one tab each so the screen fits (`?tab=bests`). Read from the saved race results; nothing
 * here changes the game.
 */
export function CareerScreen() {
  const { state } = useCareer()
  const table = getMedalTable(state)
  const bests = getPersonalBests(state)
  const history = getRaceHistory(state)
  const season = getSeason(state)
  const achievements = getAchievements(state)
  const [params, setParams] = useSearchParams()
  const tab = CAREER_TABS.find((t) => t.id === params.get('tab'))?.id ?? 'achievements'

  return (
    <Screen title="Career" description="Small steps. Big goals." showDescription>
      {/* Room for the summit in the background picture (owner mockup). */}
      <div className={styles.hero} aria-hidden="true" />
      <section className={styles.season} aria-labelledby="season-title">
        <div className={styles.seasonMain}>
          <h2 id="season-title" className={styles.seasonTitle}>
            Season {season.year}
          </h2>
          <Meter
            label={`Season ${season.year} progress`}
            value={season.weekOfYear}
            max={WEEKS_PER_YEAR}
            valueText={`Week ${season.weekOfYear} of ${WEEKS_PER_YEAR}`}
            className={styles.seasonMeter}
          />
          <p className={styles.seasonLine}>
            Week {season.weekOfYear} / {WEEKS_PER_YEAR} · {season.races} {season.races === 1 ? 'race' : 'races'} ·{' '}
            {season.medals} {season.medals === 1 ? 'medal' : 'medals'}
          </p>
        </div>
        <div className={styles.rank}>
          <span className={styles.rankBadge} aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8l-1-3H9z" />
            </svg>
          </span>
          <span className={styles.rankText}>
            <span className={styles.rankLabel}>Best finish</span>
            <span className={styles.rankValue}>{season.bestFinish === null ? '—' : `#${season.bestFinish}`}</span>
          </span>
        </div>
      </section>

      {history.length === 0 && (
        <p className={styles.muted}>
          No races yet. Your medals and results appear here after your first race.{' '}
          <Link to="/races">Go to races</Link>
        </p>
      )}

      <Tabs
        label="Career"
        tabs={CAREER_TABS}
        value={tab}
        onChange={(next) => setParams(next === 'achievements' ? {} : { tab: next }, { replace: true })}
      >
        <ScrollPanel label={CAREER_TABS.find((t) => t.id === tab)!.label}>
          {tab === 'achievements' && (
            <ul className={styles.achievements}>
              {achievements.map((achievement) => (
                <Achievement key={achievement.definition.id} progress={achievement} />
              ))}
            </ul>
          )}
          {tab === 'medals' && (
            <Card title="Medal table">
              <table className={styles.medalTable}>
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    {MEDALS.map((medal) => (
                      <th scope="col" key={medal} className={styles.num}>
                        <MedalIcon medal={medal} label={MEDAL_LABELS[medal]} />
                      </th>
                    ))}
                    <th scope="col" className={styles.num}>
                      Races
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {RACE_CATEGORIES.map((category) => (
                    <MedalRow key={category} label={RACE_CATEGORY_CONFIG[category].label} count={table.byCategory[category]} />
                  ))}
                </tbody>
                <tfoot>
                  <MedalRow label="Total" count={table.total} />
                </tfoot>
              </table>
            </Card>
          )}
          {tab === 'bests' && (
            <Card title="Personal bests">
              {bests.length === 0 ? (
                <p className={styles.muted}>Your best position and best time on each race appear here.</p>
              ) : (
                <ul className={styles.list}>
                  {bests.map((best) => (
                    <li key={best.race.id} className={styles.bestRow}>
                      <span className={styles.raceName}>
                        {best.race.name}
                        <span className={styles.muted}>
                          {' '}
                          · {RACE_CATEGORY_CONFIG[best.race.category].label} · {best.runs} {best.runs === 1 ? 'run' : 'runs'}
                        </span>
                      </span>
                      <span className={styles.bestValues}>
                        <Link to={`/races/results/${best.bestPositionEntry.id}`} aria-label={`Best position in ${best.race.name}: ${ordinal(best.bestPosition)}`}>
                          <Position position={best.bestPosition} />
                        </Link>
                        <Link to={`/races/results/${best.bestTimeEntry.id}`} aria-label={`Best time in ${best.race.name}: ${raceTimeText(best.bestTimeS)}`}>
                          {raceTimeText(best.bestTimeS)}
                        </Link>
                      </span>
                    </li>
                  ))}
                </ul>
            )}
          </Card>
          )}
          {tab === 'history' && (
            <Card title="Race history">
              {history.length === 0 ? (
                <p className={styles.muted}>Every race you run appears here, newest first.</p>
              ) : (
                <ul className={styles.list}>
                  {history.map(({ entry, race }) => (
                    <li key={entry.id}>
                      <Link to={`/races/results/${entry.id}`} className={styles.historyRow}>
                        <span className={styles.when}>
                          Week {entry.result.week} · {weekdayShort(entry.result.day)}
                        </span>
                        <span className={styles.raceName}>{race.name}</span>
                        <Position position={entry.result.position} fieldSize={entry.result.fieldSize} />
                        <span className={styles.time}>{raceTimeText(entry.result.timeS)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
            )}
          </Card>
          )}
        </ScrollPanel>
      </Tabs>
    </Screen>
  )
}

/** Badge pictogram by achievement. */
const ACHIEVEMENT_ICONS: Record<string, string> = {
  'first-steps': 'M5 20V5l9 3-9 3',
  'trail-explorer': 'M12 3l5 7h-3l4 5h-4l3 4H7l3-4H6l4-5H7zM12 19v2',
  'first-summit': 'M3 20l6-10 3 5 3-4 6 9zM9 10l1.5 2.5L12 11',
  elite: 'M4 18l2-10 4 4 2-6 2 6 4-4 2 10z',
  podium: 'M9 13V4h6v9M3 20v-5h6v5M15 20v-7h6v7M9 20v-7h6',
  champion: 'M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8l-1-3H9z',
  'rising-star': 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z',
  level: 'M4 20l5-6 4 3 7-10M15 7h5v5',
  dedicated: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h3v3H8z',
}

function Achievement({ progress }: { progress: AchievementProgress }) {
  const { definition, level, target, value, complete, reached } = progress
  return (
    <li className={`${styles.achievement} ${reached > 0 ? styles.achievementEarned : ''}`}>
      <span className={styles.badge} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d={ACHIEVEMENT_ICONS[definition.id]} />
        </svg>
      </span>
      <span className={styles.achievementText}>
        <span className={styles.achievementTitle}>{definition.title}</span>
        <span className={styles.achievementLevel}>
          Level {level}
          {complete && ' · Complete'}
        </span>
        <span className={styles.muted}>{definition.describe(target)}</span>
        <Meter
          label={`${definition.title}, level ${level}`}
          value={value}
          max={target}
          valueText={`${value.toLocaleString('en-US')} of ${target.toLocaleString('en-US')}`}
          className={styles.achievementMeter}
        />
      </span>
      <span className={styles.achievementCount}>
        {complete && (
          <span className={styles.check} aria-label="Complete">
            ✓
          </span>
        )}
        <span aria-hidden="true">
          {value.toLocaleString('en-US')}/{target.toLocaleString('en-US')}
        </span>
      </span>
    </li>
  )
}

function MedalRow({ label, count }: { label: string; count: MedalCount }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {MEDALS.map((medal) => (
        <td key={medal} className={styles.num}>
          {count[medal]}
        </td>
      ))}
      <td className={`${styles.num} ${styles.muted}`}>{count.races}</td>
    </tr>
  )
}
