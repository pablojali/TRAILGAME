import { describe, expect, it } from 'vitest'
import { describeRaceEffect, parseEquipment } from '../domain/equipment/items'
import { describeEffect, itemDescription, itemDisplayName, itemEffect, itemLabel } from './equipmentText'
import { translate, type Locale } from './i18n'

const TABLE = `id,name,type,level,price,pack,climbing,flat,effect_text,description,name_es,description_es
poles,Poles,poles,2,50,,3,1.01,,Light poles.,Bastones,Bastones ligeros.
pack,Gels,nutrition,,5,3,,,Gel: faster.,Gels.,,`

const t = (locale: Locale) => (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) => translate(locale, key, vars)

describe('equipment texts by language (owner request, 5 November 2026)', () => {
  const [poles, gels] = parseEquipment(TABLE)

  it("uses the table's columns for the language, else English", () => {
    expect(itemLabel(poles!, 'es')).toBe('Bastones')
    expect(itemDisplayName(poles!, 'es', t('es'))).toBe('Bastones · Nv 2')
    expect(itemDescription(poles!, 'es')).toBe('Bastones ligeros.')
    expect(itemLabel(poles!, 'fr')).toBe('Poles')
    expect(itemDescription(poles!, 'de')).toBe('Light poles.')
  })

  it('writes effects from the bonuses in the language, the same sentence as the English one', () => {
    expect(itemEffect(poles!, 'en', t('en'))).toBe('Climbing +3, but flats 1% slower.')
    expect(describeEffect(poles!.raceEffect!, t('en'))).toBe(describeRaceEffect(poles!.raceEffect!)!.replace(/^Races: /, ''))
    expect(itemEffect(poles!, 'es', t('es'))).toBe('Subida +3, pero llano 1% más lento.')
    // An effect text of the table's own stays English without a translation.
    expect(itemEffect(gels!, 'es', t('es'))).toBe('Gel: faster.')
  })
})
