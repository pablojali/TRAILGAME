import { Link, useLocation, useParams } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { Card } from '../../components/Card'
import { formatDelta } from '../../components/format'
import { Screen } from '../../components/Screen'
import { ATTRIBUTE_LABELS, isAttributeId } from '../../domain/athlete/athlete'
import { ATTRIBUTE_POINTS_PER_LEVEL } from '../../domain/athlete/levels'
import { formatCoins } from '../../domain/economy/coins'
import { PRIZE_BANDS, RACE_CATEGORY_CONFIG } from '../../domain/races/categories'
import { getRace, type Race } from '../../domain/races/races'
import { INJURY_REST_DAYS } from '../../domain/training/injury'
import { weekdayLong } from '../../domain/training/weekdays'
import type { FinishedRaceEntry, RaceResult } from '../../game-engine/gameState'
import { getEntry } from '../../game-engine/races'
import type { ExplanationFactor } from '../../game-engine/raceSimulation'
import { durationText, ordinal, raceTimeText, signedCoins } from './raceText'
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

function Result({ race, entry }: { race: Race; entry: FinishedRaceEntry }) {
  const { result } = entry
  const location = useLocation()
  const levelsGained = (location.state as { levelsGained?: number } | null)?.levelsGained ?? 0

  return (
    <Screen
      eyebrow={`${race.name} · Result`}
      title={`${ordinal(result.position)} of ${result.fieldSize}`}
      description={`${RACE_CATEGORY_CONFIG[race.category].label} race · Week ${result.week}, ${weekdayLong(result.day)}`}
    >
      <p className={styles.headline}>
        <span className={styles.time}>{raceTimeText(result.timeS)}</span>
        <span className={styles.muted}>{PRIZE_BANDS[result.band]!.label} prize band</span>
      </p>

      {levelsGained > 0 && (
        <p role="status" className={styles.warning}>
          Level up! +{levelsGained * ATTRIBUTE_POINTS_PER_LEVEL} attribute points.{' '}
          <Link to="/attributes">Allocate points</Link>
        </p>
      )}

      <Card title="What shaped your time">
        <Performance result={result} />
      </Card>

      <Card title="Rewards">
        <Rewards race={race} entry={entry} />
      </Card>

      <Card title="Condition">
        <p>
          Fatigue {formatDelta(result.fatigueChange)}
          {result.fitnessChange !== 0 && ` · Fitness ${formatDelta(result.fitnessChange)}`}
        </p>
        {result.injured ? (
          <p className={styles.warning}>
            Injured: Fatigue went above 95. No XP, Fitness lost and {INJURY_REST_DAYS} forced rest days. Your result
            and prize still count.
          </p>
        ) : (
          <p className={styles.muted}>The race took this training day and counts as training for Fitness decay.</p>
        )}
      </Card>

      <div className={styles.links}>
        <Link to="/races" className={`${button.button} ${button.primary}`}>
          Back to races
        </Link>
        <Link to="/training" className={`${button.button} ${button.secondary}`}>
          Training
        </Link>
      </div>
    </Screen>
  )
}

function factorLabel(factor: ExplanationFactor): string {
  if (factor.id === 'day-form') {
    const percent = Math.abs(factor.value * 100).toFixed(1)
    return `Day form ${factor.value < 0 ? '−' : '+'}${percent}% (${factor.value < 0 ? 'a good day' : 'an off day'})`
  }
  const name = factor.id === 'fitness' ? 'Fitness' : factor.id === 'fatigue' ? 'Fatigue' : isAttributeId(factor.id) ? ATTRIBUTE_LABELS[factor.id] : factor.id
  return `${name} ${factor.value} (typical ${Math.round(factor.reference)})`
}

/** The explanation (D10): total gap, then the largest single effects, never added up. */
function Performance({ result }: { result: RaceResult }) {
  const gap = result.gapS
  return (
    <>
      <p>
        <strong>
          {gap === 0
            ? 'The same time as a typical runner in this field.'
            : `${durationText(gap)} ${gap < 0 ? 'faster' : 'slower'} than a typical runner in this field (${raceTimeText(result.referenceTimeS)}).`}
        </strong>
      </p>
      {result.factors.length > 0 ? (
        <>
          <p className={styles.muted}>Biggest influences, each measured on its own (they don’t add up):</p>
          <ul className={styles.factors}>
            {result.factors.map((factor) => (
              <li key={factor.id}>
                <span>{factorLabel(factor)}</span>
                <span className={factor.effectS < 0 ? styles.helped : styles.hurt}>
                  {durationText(factor.effectS)} {factor.effectS < 0 ? 'faster' : 'slower'}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className={styles.muted}>No single input changed your time by more than 0.5%.</p>
      )}
      {result.dayForm !== 0 && !result.factors.some((f) => f.id === 'day-form') && (
        <p className={styles.muted}>
          {factorLabel({ id: 'day-form', value: result.dayForm, reference: 0, effectS: 0 })}: fixed for this entry,
          narrower with high Consistency.
        </p>
      )}
    </>
  )
}

function Rewards({ race, entry }: { race: Race; entry: FinishedRaceEntry }) {
  const { result } = entry
  const difference = result.levelAtStart - race.recommendedLevel
  return (
    <>
      <dl className={styles.rewards}>
        <div>
          <dt>Entry fee (paid at entry)</dt>
          <dd>{entry.feePaid === 0 ? 'Free' : formatCoins(entry.feePaid)}</dd>
        </div>
        <div>
          <dt>Gross prize ({PRIZE_BANDS[result.band]!.label})</dt>
          <dd>{formatCoins(result.grossPrize)}</dd>
        </div>
        <div>
          <dt>Reward multiplier</dt>
          <dd>{result.multiplierPct}%</dd>
        </div>
        <div>
          <dt>Coins awarded</dt>
          <dd>{formatCoins(result.coinsAwarded)}</dd>
        </div>
        <div>
          <dt>XP awarded</dt>
          <dd>{result.injured ? '0 (injured)' : `${result.xpAwarded} XP`}</dd>
        </div>
        <div className={styles.total}>
          <dt>Net coin change</dt>
          <dd>{signedCoins(result.netCoins)}</dd>
        </div>
      </dl>
      {result.multiplierPct === 0 ? (
        <p className={styles.warning}>
          This race is too easy for your level: you were level {result.levelAtStart}, {difference} above the
          recommended level {race.recommendedLevel}, so it gives no XP and no prize coins.
        </p>
      ) : result.multiplierPct < 100 ? (
        <p className={styles.warning}>
          Rewards reduced to {result.multiplierPct}%: you were level {result.levelAtStart}, {difference} above the
          recommended level {race.recommendedLevel}.
        </p>
      ) : (
        <p className={styles.muted}>
          Full rewards: your level ({result.levelAtStart}) was not above the recommended level (
          {race.recommendedLevel}).
        </p>
      )}
    </>
  )
}
