import { describe, expect, it } from 'vitest'
import { detectLocale, MESSAGES, translate, type Locale } from './i18n'

const placeholders = (message: unknown): string[] =>
  [...JSON.stringify(message).matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).filter((v, i, a) => a.indexOf(v) === i).sort()

describe('languages (owner request, 4 November 2026)', () => {
  it('every language has every English text, with the same placeholders, and nothing extra', () => {
    for (const locale of Object.keys(MESSAGES) as Locale[]) {
      const messages = MESSAGES[locale]
      expect(Object.keys(messages).sort(), locale).toEqual(Object.keys(MESSAGES.en).sort())
      for (const [key, english] of Object.entries(MESSAGES.en)) {
        expect(placeholders(messages[key]), `${locale} ${key}`).toEqual(placeholders(english))
        expect(typeof messages[key], `${locale} ${key}`).toBe(typeof english)
      }
    }
  })

  it('fills placeholders, picks plural forms and formats numbers per language', () => {
    expect(translate('en', 'common.coins', { count: 1 })).toBe('1 coin')
    expect(translate('en', 'common.coins', { count: 1240 })).toBe('1,240 coins')
    expect(translate('es', 'common.coins', { count: 1240 })).toBe('1240 monedas')
    expect(translate('de', 'common.coins', { count: 12400 })).toBe('12.400 Münzen')
    expect(translate('fr', 'equipment.youNeed', { coins: translate('fr', 'common.coins', { count: 5 }) })).toContain('5 pièces')
  })

  it('takes the first browser language the game has, else English', () => {
    expect(detectLocale(['es-AR', 'en'])).toBe('es')
    expect(detectLocale(['pt-BR', 'it-IT'])).toBe('it')
    expect(detectLocale(['ja'])).toBe('en')
  })
})
