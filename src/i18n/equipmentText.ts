import type { AttributeId } from '../domain/athlete/athlete'
import type { EquipmentItem, ItemLanguage, RaceEffect } from '../domain/equipment/items'
import type { Locale, Translate } from './i18n'

/**
 * The equipment table's texts in the player's language (owner request, 5 November 2026): the
 * name_xx, effect_text_xx and description_xx columns, else English. Effects without a text of
 * their own are written from the bonuses in the player's language.
 */
function texts(item: EquipmentItem, locale: Locale) {
  return locale === 'en' ? undefined : item.translations?.[locale as ItemLanguage]
}

export function itemLabel(item: EquipmentItem, locale: Locale): string {
  return texts(item, locale)?.name ?? item.label
}

/** "Poles · Lvl 2" in the player's language. */
export function itemDisplayName(item: EquipmentItem, locale: Locale, t: Translate): string {
  const label = itemLabel(item, locale)
  return item.level ? `${label} · ${t('common.lvl', { level: item.level })}` : label
}

export function itemDescription(item: EquipmentItem, locale: Locale): string {
  return texts(item, locale)?.description ?? item.description
}

/** What the item does in races, without the "Races:" prefix; undefined when it does nothing. */
export function itemEffect(item: EquipmentItem, locale: Locale, t: Translate): string | undefined {
  const own = texts(item, locale)?.effectText
  if (own) return own
  if (item.customEffect || locale === 'en' || !item.raceEffect) return item.effectText?.replace(/^Races: /, '')
  return describeEffect(item.raceEffect, t)
}

function percentOf(multiplier: number): string {
  return `${Math.round(Math.abs(1 - multiplier) * 1000) / 10}%`
}

/** The same sentence as the table's English one, in the player's language. */
export function describeEffect(effect: RaceEffect, t: Translate): string | undefined {
  const good: string[] = []
  const bad: string[] = []
  const attributes = Object.entries(effect.attributes ?? {}) as [AttributeId, number][]
  for (const [id, value] of [...attributes].sort((x, y) => y[1] - x[1])) {
    ;(value >= 0 ? good : bad).push(`${t(`attr.${id}`)} ${value >= 0 ? '+' : '−'}${Math.abs(value)}`)
  }
  const phrase = (m: number | undefined, part: 'flats' | 'climbs' | 'descents' | 'technical' | 'wear') => {
    if (m === undefined || m === 1) return
    if (m < 1) good.push(t(`effect.${part}.better`, { percent: percentOf(m) }))
    else bad.push(t(`effect.${part}.worse`, { percent: percentOf(m) }))
  }
  phrase(effect.runnable, 'flats')
  phrase(effect.climb, 'climbs')
  phrase(effect.descent, 'descents')
  phrase(effect.technicalPenalty, 'technical')
  phrase(effect.slowdown, 'wear')
  if (good.length === 0 && bad.length === 0) return undefined
  const text = good.join(', ') + (bad.length ? `${good.length ? t('effect.but') : ''}${bad.join(', ')}` : '')
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`
}
