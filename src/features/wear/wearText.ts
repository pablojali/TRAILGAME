import { WEAR, type WearBand } from '../../domain/equipment/wear'
import type { MessageKey, Translate } from '../../i18n/i18n'

const BAND_KEYS: readonly MessageKey[] = ['wear.band.normal', 'wear.band.slight', 'wear.band.heavy', 'wear.band.risk', 'wear.band.wornOut']

/**
 * A band's name in the player's language (A-5). The owner's table has five bands, from the most
 * durability left to the least; a table with another number of bands shows its own English label.
 */
export function bandText(band: WearBand, t: Translate): string {
  const index = WEAR.bands.indexOf(band)
  return WEAR.bands.length === BAND_KEYS.length && index >= 0 ? t(BAND_KEYS[index]!) : band.label
}

/** Km with at most one decimal, in the player's format. */
export function kmText(km: number, locale: string): string {
  return km.toLocaleString(locale, { maximumFractionDigits: 1 })
}
