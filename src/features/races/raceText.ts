import { formatCoins } from '../../domain/economy/coins'
import type { EntryFee } from '../../domain/races/access'
import type { Race } from '../../domain/races/races'

export function courseText(race: Race): string {
  return `${race.distanceKm} km · ${race.elevationGainM.toLocaleString('en-US')} m D+`
}

/** Short fee label for the athlete's applicable fee. */
export function feeText(fee: EntryFee): string {
  if (fee.type === 'free') return 'Free'
  return `${fee.type === 'early' ? 'Early entry · ' : ''}${formatCoins(fee.fee)}`
}

export function percentText(multiplier: number): string {
  return `${Math.round(multiplier * 100)}%`
}
