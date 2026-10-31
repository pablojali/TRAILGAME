import { formatCoins } from '../../domain/economy/coins'
import type { Race } from '../../domain/races/races'

export function courseText(race: Race): string {
  return `${race.distanceKm} km · ${race.elevationGainM.toLocaleString('en-US')} m D+`
}

/** What an entry cost: free since 1 November 2026, the fee for older entries. */
export function feePaidText(feePaid: number): string {
  return feePaid === 0 ? 'free entry' : formatCoins(feePaid)
}

export function percentText(multiplier: number): string {
  return `${Math.round(multiplier * 100)}%`
}

/** Finishing time as h:mm:ss. */
export function raceTimeText(seconds: number): string {
  const s = Math.abs(Math.round(seconds))
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** A duration as m:ss, or h:mm:ss from one hour, without sign. */
export function durationText(seconds: number): string {
  const s = Math.abs(Math.round(seconds))
  return s >= 3600 ? raceTimeText(s) : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function ordinal(n: number): string {
  const mod100 = n % 100
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${suffix}`
}

export function signedCoins(amount: number): string {
  return `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${Math.abs(amount).toLocaleString('en-US')} ${Math.abs(amount) === 1 ? 'coin' : 'coins'}`
}
