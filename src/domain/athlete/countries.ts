/**
 * The runner's country (owner request, 4 November 2026: a future trail world championship with the
 * best runners of each country). Cosmetic for now. ISO 3166-1 alpha-2 codes; the names come from
 * the browser in the player's language (`Intl.DisplayNames`), the flag from the code.
 */
export const COUNTRY_CODES: readonly string[] = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS ' +
  'BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE ' +
  'EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM ' +
  'HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC ' +
  'LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA ' +
  'NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO ' +
  'TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ')

const CODES = new Set(COUNTRY_CODES)

export function isCountryCode(value: unknown): value is string {
  return typeof value === 'string' && CODES.has(value)
}

/** The country's name in `locale` (English by default), or its code when the browser has no name. */
export function countryName(code: string, locale = 'en'): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/** The flag emoji of a country code (two regional indicator letters). */
export function countryFlag(code: string): string {
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

/** Every country, sorted by name in `locale`. */
export function countriesByName(locale = 'en'): { code: string; name: string }[] {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code, locale) })).sort((a, b) =>
    a.name.localeCompare(b.name, locale),
  )
}

/** A first guess from the browser's language, e.g. `es-AR` → `AR`; undefined when it names no country. */
export function guessCountry(languages: readonly string[]): string | undefined {
  for (const language of languages) {
    const region = language.split(/[-_]/)[1]?.toUpperCase()
    if (isCountryCode(region)) return region
  }
  return undefined
}
