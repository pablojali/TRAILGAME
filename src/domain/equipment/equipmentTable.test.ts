import { describe, expect, it } from 'vitest'
import { describeRaceEffect, parseEquipment } from './items'

const HEADER =
  'id,name,type,level,price,pack,thumbnail,avatar_layer,speed,endurance,climbing,technical,recovery,consistency,flat,climb,descent,technical_penalty,wear,effect_text,description'

describe('equipment table (src/data/equipment.csv, owner request 3 November 2026)', () => {
  it('reads a row: level, price, pack, bonuses and multipliers; empty price is not for sale', () => {
    const [item] = parseEquipment(`${HEADER}\nx-shoes,X shoes,shoes,3,,,x.webp,footwear/x.webp,2,,,,,1,0.97,,,,,,"Fast, light."\n`)
    expect(item).toEqual({
      id: 'x-shoes',
      label: 'X shoes',
      slot: 'shoes',
      level: 3,
      price: null,
      description: 'Fast, light.',
      thumbnail: 'x.webp',
      avatarLayer: 'footwear/x.webp',
      raceEffect: { attributes: { speed: 2, consistency: 1 }, runnable: 0.97 },
      effectText: 'Races: Speed +2, Consistency +1, flats 3% faster.',
    })
  })

  it('refuses broken rows', () => {
    const row = (fields: string) => `${HEADER}\n${fields}\n`
    expect(() => parseEquipment(row('a,A,hat,,1,,,,,,,,,,,,,,,,'))).toThrow(/unknown type/)
    // Glasses and caps are cosmetic (owner, 15 November 2026): no race bonus.
    expect(() => parseEquipment(row('a,A,cap,,1,,,,1,,,,,,,,,,,,'))).toThrow(/cosmetic/)
    expect(() => parseEquipment(row('a,A,gel,,1,,,,,,,,,,,,,,,,'))).toThrow(/pack size/)
    expect(() => parseEquipment(row('a,A,shoes,x,1,,,,,,,,,,,,,,,,'))).toThrow(/not a whole number/)
    expect(() => parseEquipment(row('a,A,shoes,,1,,,,,,,,,,0,,,,,,'))).toThrow(/above 0/)
    expect(() => parseEquipment(`${HEADER}\na,A,shoes,,1,,,,,,,,,,,,,,,,\na,B,shoes,,1,,,,,,,,,,,,,,,,\n`)).toThrow(/twice/)
  })

  it('writes the effect from the bonuses, good first, then "but" and the costs', () => {
    expect(describeRaceEffect({ attributes: { climbing: 2 }, runnable: 1.01 })).toBe('Races: Climbing +2, but flats 1% slower.')
    expect(describeRaceEffect({ slowdown: 0.85 })).toBe('Races: 15% less wear over distance.')
    expect(describeRaceEffect({ technicalPenalty: 1.3 })).toBe('Races: Technical descents 30% harder.')
    expect(describeRaceEffect({})).toBeUndefined()
  })

  it('reads watches (with bonuses) and the glasses and caps of the look (sold in Appearance)', async () => {
    const { isLookAccessory } = await import('./items')
    const [watch, glasses, cap] = parseEquipment(
      `${HEADER}\nw,Watch,watch,5,60,,,accessories/lvl5_{sex}_watch_w.webp,,,,,,1,,,,,,,\ng,Glasses,glasses,2,40,,,,,,,,,,,,,,,,\nc,Cap,cap,3,50,,,accessories/lvl3_{sex}_cap_c_tone{tone}.webp,,,,,,,,,,,,,\n`,
    )
    expect(watch).toMatchObject({ slot: 'watch', raceEffect: { attributes: { consistency: 1 } } })
    expect(isLookAccessory(watch!)).toBe(false)
    expect([glasses, cap].map((item) => isLookAccessory(item!))).toEqual([true, true])
    expect(cap!.avatarLayer).toBe('accessories/lvl3_{sex}_cap_c_tone{tone}.webp')
  })
})
