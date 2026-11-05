import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import enCommon from './locales/en/common.json'
import enDashboard from './locales/en/dashboard.json'
import enTraining from './locales/en/training.json'
import enRaces from './locales/en/races.json'
import enRaceRun from './locales/en/raceRun.json'
import enRaceResult from './locales/en/raceResult.json'
import enCareer from './locales/en/career.json'
import enSetup from './locales/en/setup.json'
import enLooks from './locales/en/looks.json'
import enAccount from './locales/en/account.json'
import enEquipment from './locales/en/equipment.json'
import enSettings from './locales/en/settings.json'

/**
 * The game's languages (owner request, 4 November 2026): English, Spanish, French, Italian and
 * German. Texts live in src/i18n/locales/{locale}/{screen}.json by key (one file per part of the
 * game, the same files in every language); English is the reference and the
 * fallback for any missing text. A text may hold `{name}` placeholders, and plural forms as an
 * object (`{ "one": "{count} race", "other": "{count} races" }`, chosen by `count`).
 */
export type Locale = 'en' | 'es' | 'fr' | 'it' | 'de'

export const LOCALES: readonly { id: Locale; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'it', label: 'Italiano' },
  { id: 'de', label: 'Deutsch' },
]

type Message = string | Partial<Record<Intl.LDMLPluralRule, string>>
export type Messages = Record<string, Message>

/** English, the reference: its keys type `t()`. Add a new file here and in every language. */
const EN = { ...enCommon, ...enSettings, ...enEquipment, ...enDashboard, ...enTraining, ...enRaces, ...enRaceRun, ...enRaceResult, ...enCareer, ...enSetup, ...enLooks, ...enAccount }

const FILES = import.meta.glob<Messages>('./locales/*/*.json', { eager: true, import: 'default' })

function load(locale: Locale): Messages {
  const merged: Messages = {}
  for (const [path, messages] of Object.entries(FILES)) {
    if (path.startsWith(`./locales/${locale}/`)) Object.assign(merged, messages)
  }
  return merged
}

export const MESSAGES: Record<Locale, Messages> = { en: load('en'), es: load('es'), fr: load('fr'), it: load('it'), de: load('de') }

export type MessageKey = keyof typeof EN
export type Vars = Record<string, string | number>

const STORAGE_KEY = 'trailgame.locale'

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale.id === value)
}

/** The first of the browser's languages the game has, else English. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.split(/[-_]/)[0]?.toLowerCase()
    if (isLocale(base)) return base
  }
  return 'en'
}

function storedLocale(): Locale | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isLocale(value) ? value : null
  } catch {
    return null
  }
}

/** The text of `key` in `locale` with its placeholders filled; English when the locale lacks it. */
export function translate(locale: Locale, key: MessageKey, vars: Vars = {}): string {
  const message: Message = MESSAGES[locale][key] ?? MESSAGES.en[key] ?? (EN[key] as Message | undefined) ?? key
  let text: string
  if (typeof message === 'string') {
    text = message
  } else {
    const count = Number(vars.count ?? 0)
    const rule = new Intl.PluralRules(locale).select(count)
    text = message[rule] ?? message.other ?? ''
  }
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name]
    if (value === undefined) return match
    return typeof value === 'number' ? value.toLocaleString(locale) : value
  })
}

export type Translate = (key: MessageKey, vars?: Vars) => string

interface I18nValue {
  locale: Locale
  setLocale(locale: Locale): void
  t: Translate
}

const I18nContext = createContext<I18nValue | null>(null)

/** The language comes from Settings (kept on this device), else the browser's languages. */
export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(
    () => initial ?? storedLocale() ?? detectLocale(typeof navigator === 'undefined' ? [] : (navigator.languages ?? [])),
  )
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Private mode: the choice lasts for this visit.
    }
    document.documentElement.lang = next
  }, [])
  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: (key, vars) => translate(locale, key, vars) }),
    [locale, setLocale],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/** The current language and its texts. Outside a provider (some tests): English. */
export function useI18n(): I18nValue {
  return useContext(I18nContext) ?? FALLBACK
}

const FALLBACK: I18nValue = { locale: 'en', setLocale: () => {}, t: (key, vars) => translate('en', key, vars) }
