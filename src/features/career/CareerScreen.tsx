import { Link, useSearchParams } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import { Card } from '../../components/Card'
import { MedalIcon } from '../../components/Medal'
import { Screen, ScrollPanel } from '../../components/Screen'
import { Tabs } from '../../components/Tabs'
import { RACE_CATEGORIES, RACE_CATEGORY_CONFIG } from '../../domain/races/categories'
import { weekdayShort } from '../../domain/training/weekdays'
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
  { id: 'medals', label: 'Medals' },
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
  const [params, setParams] = useSearchParams()
  const tab = CAREER_TABS.find((t) => t.id === params.get('tab'))?.id ?? 'medals'

  return (
    <Screen title="Career" description="Your medals, personal bests and every race you have run.">
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
        onChange={(next) => setParams(next === 'medals' ? {} : { tab: next }, { replace: true })}
      >
        <ScrollPanel label={CAREER_TABS.find((t) => t.id === tab)!.label}>
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
