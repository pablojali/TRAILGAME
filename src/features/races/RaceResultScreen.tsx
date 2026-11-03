import { useEffect, useRef } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { formatDelta } from '../../components/format'
import { Screen, ScrollPanel } from '../../components/Screen'
import { Tabs } from '../../components/Tabs'
import { appearanceUnlocks } from '../../domain/athlete/appearance'
import { getAttributePointsBetween } from '../../domain/athlete/levels'
import { formatCoins } from '../../domain/economy/coins'
import { GROSS_PRIZES, PRIZE_BANDS, RACE_CATEGORY_CONFIG } from '../../domain/races/categories'
import { getRace, type Race } from '../../domain/races/races'
import { INJURY_REST_DAYS } from '../../domain/training/injury'
import { weekdayLong } from '../../domain/training/weekdays'
import type { FinishedRaceEntry, RaceResult } from '../../game-engine/gameState'
import { getEntry, getStandings } from '../../game-engine/races'
import { formatChange, INTENSITY_LABELS, STOP_LABELS } from './raceStrategyText'
import { durationText, ordinal, raceTimeText } from './raceText'
import styles from './Races.module.css'

/**
 * Race result (Game Design Bible §10.11). Reads the stored result only: opening or reloading it
 * never runs the race again or awards anything.
 */
export function RaceResultScreen() {
  const { entryId = '' } = useParams()
  const { state } = useCareer()
  const entry = getEntry(state, entryId)
  const race = entry && getRace(entry.raceId)

  if (!entry || !race) {
    return (
      <Screen title="Result not found" description="There is no race result with this link.">
        <Link to="/races" className={`${button.button} ${button.secondary}`}>
          Back to races
        </Link>
      </Screen>
    )
  }
  if (entry.status !== 'finished') {
    return (
      <Screen eyebrow={race.name} title="Not raced yet" description="This entry has no result yet.">
        <Link to={`/races/${race.id}`} className={`${button.button} ${button.primary}`}>
          Go to race day
        </Link>
      </Screen>
    )
  }
  return <Result race={race} entry={entry} />
}

const RESULT_TABS = [
  { id: 'result', label: 'Result' },
  { id: 'splits', label: 'Splits' },
  { id: 'standings', label: 'Full results' },
] as const

function Result({ race, entry }: { race: Race; entry: FinishedRaceEntry }) {
  const { result } = entry
  const location = useLocation()
  const levelsGained = (location.state as { levelsGained?: number } | null)?.levelsGained ?? 0
  const { athlete } = useCareer().state
  const unlocks = appearanceUnlocks(
    result.levelAtStart,
    result.levelAtStart + levelsGained,
    athlete.sex,
    athlete.appearance.skin,
  )

  const [params, setParams] = useSearchParams()
  // Results saved before Race Engine V1 have no splits.
  const tabs = result.splits ? RESULT_TABS : RESULT_TABS.filter((t) => t.id !== 'splits')
  const tab = tabs.find((t) => t.id === params.get('tab'))?.id ?? 'result'

  return (
    <Screen
      eyebrow={`${race.name} · Result`}
      title={`${ordinal(result.position)} of ${result.fieldSize}`}
      description={`${RACE_CATEGORY_CONFIG[race.category].label} race · Week ${result.week}, ${weekdayLong(result.day)}`}
      showDescription
    >
      <Tabs
        label="Race result"
        tabs={tabs}
        value={tab}
        // Keep the router state, so the level-up message survives switching tabs.
        onChange={(next) => setParams(next === 'result' ? {} : { tab: next }, { replace: true, state: location.state })}
      >
        {tab === 'result' && (
          // Tiles that fit the screen (owner request, 1 November 2026): no explanations.
          <dl className={styles.tiles} aria-label="Result">
            <div className={styles.tile}>
              <dt>Time</dt>
              <dd className={styles.time}>{raceTimeText(result.timeS)}</dd>
            </div>
            <div className={styles.tile}>
              <dt>Prize band</dt>
              <dd>{PRIZE_BANDS[result.band]!.label}</dd>
            </div>
            <div className={styles.tile}>
              <dt>Coins awarded</dt>
              <dd>{formatCoins(result.coinsAwarded)}</dd>
            </div>
            <div className={styles.tile}>
              <dt>XP awarded</dt>
              <dd>
                {result.xpAwarded} XP{result.injured ? ' (injured)' : ''}
              </dd>
            </div>
            <div className={styles.tile}>
              <dt>Fatigue</dt>
              <dd>{formatChange(result.fatigueChange)}</dd>
            </div>
            <div className={styles.tile}>
              <dt>Rewards</dt>
              <dd className={result.multiplierPct < 100 ? styles.warning : undefined}>{result.multiplierPct}%</dd>
            </div>
            {result.injured && (
              <div className={`${styles.tile} ${styles.tileWide}`}>
                <dt>Injured</dt>
                <dd className={styles.warning}>
                  Fitness {formatDelta(result.fitnessChange)} · {INJURY_REST_DAYS} forced rest days
                </dd>
              </div>
            )}
            {levelsGained > 0 && (
              <div className={`${styles.tile} ${styles.tileWide}`}>
                <dt>Level up!</dt>
                <dd role="status">
                  +{getAttributePointsBetween(result.levelAtStart, result.levelAtStart + levelsGained)} attribute points ·{' '}
                  <Link to="/attributes">Allocate points</Link>
                  {unlocks.length > 0 && (
                    <>
                      {' '}
                      · New look: {unlocks.join(', ')} · <Link to="/appearance">Change look</Link>
                    </>
                  )}
                </dd>
              </div>
            )}
          </dl>
        )}
        {tab === 'splits' && result.splits && (
          <ScrollPanel label="Splits">
            <Splits result={result} />
          </ScrollPanel>
        )}
        {tab === 'standings' && <Standings race={race} entry={entry} name={athlete.name} />}
      </Tabs>

      <div className={styles.links}>
        <Link to={`/races?category=${race.category}`} className={`${button.button} ${button.primary}`}>
          Back to races
        </Link>
        <Link to="/training" className={`${button.button} ${button.secondary}`}>
          Training
        </Link>
      </div>
    </Screen>
  )
}

/** Every segment as run (Race Engine V1): intensity, time, position on arrival and the stop after it. */
function Splits({ result }: { result: RaceResult }) {
  const splits = result.splits ?? []
  const nutrition = [result.nutrition?.gel && 'gel', result.nutrition?.bar && 'cereal bar'].filter(Boolean)
  return (
    <>
      <table className={`${styles.standingsTable} ${styles.splitsTable}`}>
        <caption className={styles.srOnly}>Splits by segment</caption>
        <thead>
          <tr>
            <th scope="col">Seg.</th>
            <th scope="col">Intensity</th>
            <th scope="col">Time</th>
            <th scope="col">Total</th>
            <th scope="col">Pos.</th>
            <th scope="col">Stop</th>
          </tr>
        </thead>
        <tbody>
          {splits.map((split, index) => (
            <tr key={index}>
              <td>{index + 1}</td>
              <th scope="row">{INTENSITY_LABELS[split.intensity]}</th>
              <td>{durationText(split.segmentS)}</td>
              <td>{raceTimeText(split.arrivalS)}</td>
              <td>{split.position}</td>
              <td>{split.stop ? STOP_LABELS[split.stop] : 'Finish'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.muted}>Nutrition: {nutrition.length ? nutrition.join(' and ') : 'none'}.</p>
    </>
  )
}

/** All 50 finishers, in their own tab; the table scrolls inside the screen. */
function Standings({ race, entry, name }: { race: Race; entry: FinishedRaceEntry; name: string }) {
  const rows = getStandings(race, entry.result)
  const winner = rows[0]!.timeS
  const prizes = GROSS_PRIZES[race.category]
  const you = useRef<HTMLTableRowElement>(null)
  // Open the table at the player's row.
  useEffect(() => you.current?.scrollIntoView?.({ block: 'center' }), [])
  return (
    <>
      <ScrollPanel label={`Full results · ${rows.length} runners`}>
        <table className={styles.standingsTable}>
          <caption className={styles.srOnly}>Full results of {race.name}</caption>
          <thead>
            <tr>
              <th scope="col">Pos.</th>
              <th scope="col">Runner</th>
              <th scope="col">Time</th>
              <th scope="col">Gap</th>
              <th scope="col">Prize</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const band = PRIZE_BANDS.findIndex((b) => row.position >= b.from && (b.to === null || row.position <= b.to))
              const firstOfBand = PRIZE_BANDS[band]!.from === row.position
              return (
                <tr
                  key={row.position}
                  ref={row.runner === 'you' ? you : undefined}
                  className={`${row.runner === 'you' ? styles.youRow : ''} ${firstOfBand && row.position > 1 ? styles.bandStart : ''}`}
                  aria-current={row.runner === 'you' ? 'true' : undefined}
                >
                  <td>{row.position}</td>
                  <th scope="row">{row.runner === 'you' ? `${name} (you)` : `Rival ${row.runner}`}</th>
                  <td>{raceTimeText(row.timeS)}</td>
                  <td>{row.position === 1 ? '—' : `+${durationText(row.timeS - winner)}`}</td>
                  <td>{prizes[band]}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </ScrollPanel>
      <p className={styles.standingsNote}>Prizes are gross coins by position, before the reward multiplier.</p>
    </>
  )
}
