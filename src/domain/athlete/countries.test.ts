import { describe, expect, it } from 'vitest'
import { parseGameState } from '../../repositories/gameRepository'
import { mergeClientFields } from '../../server/careerOps'
import { newGame, T0 } from '../../test/gameFixtures'
import { COUNTRY_CODES, countriesByName, countryFlag, countryName, guessCountry, isCountryCode } from './countries'

describe('countries (owner request, 4 November 2026)', () => {
  it('lists every ISO 3166-1 alpha-2 code once, with a name and a flag', () => {
    expect(COUNTRY_CODES.length).toBeGreaterThanOrEqual(249)
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length)
    expect(countryName('AR')).toBe('Argentina')
    expect(countryName('AR', 'es')).toBe('Argentina')
    expect(countryName('ES', 'es')).toBe('España')
    expect(countryFlag('AR')).toBe('🇦🇷')
    expect(countriesByName()[0]!.name).toBe('Afghanistan')
    expect(isCountryCode('AR')).toBe(true)
    expect(isCountryCode('XX')).toBe(false)
  })

  it('guesses the country from the browser languages', () => {
    expect(guessCountry(['es-AR', 'en'])).toBe('AR')
    expect(guessCountry(['en', 'fr_CA'])).toBe('CA')
    expect(guessCountry(['es'])).toBeUndefined()
  })

  it('is kept in saves when known, dropped when unknown, and taken from the client by the server', () => {
    const game = newGame()
    const withCountry = { ...game, athlete: { ...game.athlete, country: 'CL' } }
    expect(parseGameState(JSON.parse(JSON.stringify(withCountry)), T0)!.athlete.country).toBe('CL')
    const unknown = { ...game, athlete: { ...game.athlete, country: 'ZZ' } }
    expect(parseGameState(JSON.parse(JSON.stringify(unknown)), T0)!.athlete).not.toHaveProperty('country')
    expect(mergeClientFields(game, withCountry, T0).athlete.country).toBe('CL')
    expect(mergeClientFields(game, unknown, T0).athlete).not.toHaveProperty('country')
  })
})
