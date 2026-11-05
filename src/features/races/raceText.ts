import type { Locale, Translate } from '../../i18n/i18n'
import type { Race } from '../../domain/races/races'

export function courseText(race: Race, t: Translate, locale: Locale): string {
  return t('races.course', { km: race.distanceKm, gain: race.elevationGainM.toLocaleString(locale) })
}

/** What an entry cost: free since 1 November 2026, the fee for older entries. */
export function feePaidText(feePaid: number, t: Translate): string {
  return feePaid === 0 ? t('races.freeEntryLower') : t('common.coins', { count: feePaid })
}

/** A prize band's positions: "1st", "4th–10th", "11th+". */
export function bandLabel(band: { from: number; to: number | null }, locale: Locale): string {
  if (band.to === null) return `${ordinal(band.from, locale)}+`
  return band.to === band.from ? ordinal(band.from, locale) : `${ordinal(band.from, locale)}–${ordinal(band.to, locale)}`
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

/** A finishing position, e.g. 1st, 1.º, 1er, 1º, 1. (by language). */
export function ordinal(n: number, locale = 'en'): string {
  if (locale === 'es') return `${n}.º`
  if (locale === 'it') return `${n}º`
  if (locale === 'fr') return n === 1 ? '1er' : `${n}e`
  if (locale === 'de') return `${n}.`
  const mod100 = n % 100
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${suffix}`
}

export function signedCoins(amount: number): string {
  return `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${Math.abs(amount).toLocaleString('en-US')} ${Math.abs(amount) === 1 ? 'coin' : 'coins'}`
}
