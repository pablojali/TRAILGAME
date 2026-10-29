import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { Card } from '../../components/Card'
import { Screen } from '../../components/Screen'
import { getLevel } from '../../domain/athlete/levels'
import { formatCoins } from '../../domain/economy/coins'
import { getEntryFee, getGrossPrizes, getRewardMultiplier, getShortfall } from '../../domain/races/access'
import { PRIZE_BANDS, RACE_CATEGORY_CONFIG, REWARD_MULTIPLIERS } from '../../domain/races/categories'
import { getRace, type Race } from '../../domain/races/races'
import { getPendingEntry, type RaceEntryError } from '../../game-engine/races'
import { courseText, feeText, percentText } from './raceText'
import styles from './Races.module.css'

const ERRORS: Record<RaceEntryError, string> = {
  'unknown-race': 'This race does not exist.',
  'already-entered': 'You have already entered this race.',
  'insufficient-coins': 'You do not have enough coins for this entry.',
  'fee-changed': 'The entry fee changed. Check the new fee and confirm again.',
}

export function RaceDetailScreen() {
  const { raceId = '' } = useParams()
  const race = getRace(raceId)
  if (!race) {
    return (
      <Screen title="Race not found" description="This race is not in the catalog.">
        <Link to="/races" className={`${button.button} ${button.secondary}`}>
          Back to races
        </Link>
      </Screen>
    )
  }
  return <RaceDetail race={race} />
}

function RaceDetail({ race }: { race: Race }) {
  const { state } = useCareer()
  const level = getLevel(state.athlete.xp)
  const category = RACE_CATEGORY_CONFIG[race.category]
  const fee = getEntryFee(race, level)
  const multiplier = getRewardMultiplier(race, level)
  const prizes = getGrossPrizes(race)

  return (
    <Screen eyebrow={`${category.label} race`} title={race.name} description={courseText(race)}>
      <Link to="/races" className={styles.back}>
        ← All races
      </Link>

      <dl className={styles.facts}>
        <div>
          <dt>Distance</dt>
          <dd>{race.distanceKm} km</dd>
        </div>
        <div>
          <dt>Elevation gain</dt>
          <dd>{race.elevationGainM.toLocaleString('en-US')} m</dd>
        </div>
        <div>
          <dt>Terrain</dt>
          <dd>{race.terrain}</dd>
        </div>
        <div>
          <dt>Recommended level</dt>
          <dd>
            {race.recommendedLevel} <span className={styles.muted}>(you: {level})</span>
          </dd>
        </div>
      </dl>

      <Card title="Entry fee">
        <ul className={styles.fees}>
          <FeeRow
            label={`Standard (level ${race.recommendedLevel} or higher)`}
            amount={category.standardFee}
            applies={fee.type !== 'early'}
          />
          <FeeRow
            label={`Early entry (below level ${race.recommendedLevel})`}
            amount={category.earlyEntryFee}
            applies={fee.type === 'early'}
          />
        </ul>
      </Card>

      <Card title="Potential prizes">
        <table className={styles.prizes}>
          <caption className={styles.srOnly}>Gross coin prizes by finishing position</caption>
          <thead>
            <tr>
              <th scope="col">Position</th>
              <th scope="col">Gross prize</th>
            </tr>
          </thead>
          <tbody>
            {PRIZE_BANDS.map((band, i) => (
              <tr key={band.label}>
                <th scope="row">{band.label}</th>
                <td>{formatCoins(prizes[i]!)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.muted}>
          Prizes are before the entry fee. XP and prizes are reduced when your level is above the
          recommended level:{' '}
          {REWARD_MULTIPLIERS.slice(1)
            .map((row, i, rows) => `+${row.levelDifference}${i === rows.length - 1 ? ' or more' : ''} → ${percentText(row.coins)}`)
            .join(', ')}
          .
        </p>
        <p className={multiplier.coins < 1 ? styles.warning : styles.muted}>
          At your level: {percentText(multiplier.coins)} of prizes and XP
          {multiplier.coins === 0 ? ' — this race is too easy for your level.' : '.'}
        </p>
      </Card>

      <EntryPanel race={race} />
    </Screen>
  )
}

function FeeRow({ label, amount, applies }: { label: string; amount: number; applies: boolean }) {
  return (
    <li className={applies ? styles.feeApplies : undefined}>
      <span>{label}</span>
      <span className={styles.feeAmount}>
        {amount === 0 ? 'Free' : formatCoins(amount)}
        {applies && <span className={styles.appliesTag}>Your fee</span>}
      </span>
    </li>
  )
}

/** Entry with an explicit confirmation; the fee is charged once, only on confirm. */
function EntryPanel({ race }: { race: Race }) {
  const { state, enterRace } = useCareer()
  const level = getLevel(state.athlete.xp)
  const fee = getEntryFee(race, level)
  const shortfall = getShortfall(fee.fee, state.coins)
  const entry = getPendingEntry(state, race.id)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState('')
  const [justEntered, setJustEntered] = useState(false)
  const panel = useRef<HTMLHeadingElement>(null)

  // Move focus to the confirmation, and to the result of confirming.
  useEffect(() => {
    if (confirming || justEntered) panel.current?.focus()
  }, [confirming, justEntered])

  if (entry) {
    return (
      <Card title="Entered">
        <h2 ref={panel} tabIndex={-1} className={styles.srOnly}>
          Race entry confirmed
        </h2>
        <p role="status">
          {justEntered ? 'Entry confirmed. ' : ''}
          Entry fee paid: {entry.feePaid === 0 ? 'free entry' : formatCoins(entry.feePaid)}.
        </p>
        <p className={styles.muted}>
          Result pending: races are run once race simulation is added in a later update.
        </p>
      </Card>
    )
  }

  if (!confirming) {
    return (
      <Card title="Enter this race">
        <p>
          {feeText(fee)}
          {fee.type === 'early' && <span className={styles.muted}> (your level is below {race.recommendedLevel})</span>}
        </p>
        {shortfall > 0 && (
          <p className={styles.warning} id="race-shortfall">
            Not enough coins: you need {formatCoins(shortfall)} more (balance {formatCoins(state.coins)}).
          </p>
        )}
        <button
          type="button"
          className={`${button.button} ${button.primary} ${button.block}`}
          aria-disabled={shortfall > 0 || undefined}
          aria-describedby={shortfall > 0 ? 'race-shortfall' : undefined}
          onClick={() => {
            if (shortfall > 0) return
            setMessage('')
            setConfirming(true)
          }}
        >
          Enter race
        </button>
      </Card>
    )
  }

  return (
    <Card title="Confirm entry">
      <h2 ref={panel} tabIndex={-1} className={styles.srOnly}>
        Confirm entry to {race.name}
      </h2>
      <dl className={styles.confirm}>
        <div>
          <dt>Entry fee</dt>
          <dd>{fee.fee === 0 ? 'Free' : formatCoins(fee.fee)}</dd>
        </div>
        <div>
          <dt>Your balance</dt>
          <dd>{formatCoins(state.coins)}</dd>
        </div>
        <div>
          <dt>Balance after entry</dt>
          <dd>{formatCoins(state.coins - fee.fee)}</dd>
        </div>
      </dl>
      <p className={styles.muted}>Entry fees are not refunded.</p>
      {message && (
        <p role="alert" className={styles.warning}>
          {message}
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className={`${button.button} ${button.secondary}`} onClick={() => setConfirming(false)}>
          Cancel
        </button>
        <button
          type="button"
          className={`${button.button} ${button.primary} ${styles.grow}`}
          onClick={() => {
            const error = enterRace(race.id, fee.fee)
            if (error) {
              setMessage(ERRORS[error])
              return
            }
            setJustEntered(true)
            setConfirming(false)
          }}
        >
          {fee.fee === 0 ? 'Confirm free entry' : `Pay ${formatCoins(fee.fee)} and enter`}
        </button>
      </div>
    </Card>
  )
}
