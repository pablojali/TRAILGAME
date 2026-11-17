import { describe, expect, it } from 'vitest'
import { LEVEL_THRESHOLDS } from '../domain/athlete/levels'
import { campItems, getCampItem, parseCampCatalog } from '../domain/basecamp/catalog'
import { parseGameState } from '../repositories/gameRepository'
import { newGame, T0, withAthlete } from '../test/gameFixtures'
import { buyCampItem, campScene, campSlotOf, campSpots, exchangePremium, parseCampState, setCampItemUsed } from './camp'
import type { GameState } from './gameState'

const atLevel = (state: GameState, level: number) => withAthlete(state, { xp: LEVEL_THRESHOLDS.find((t) => t.level === level)!.minXp })
const rich = (level = 6): GameState => ({ ...atLevel(newGame(), level), coins: 1000, premiumCoins: 10 })

describe('Base Camp pieces', () => {
  it('shows the free background of each scene to a new career', () => {
    const state = newGame()
    expect(campScene(state, 'exterior')).toMatchObject({ background: getCampItem('lvl0-exterior'), cabin: null, decor: [getCampItem('mailbox')] })
    // The free mailbox stands in the first empty slot.
    expect(campScene(state, 'exterior').placed.map((p) => [p.item.id, p.slot])).toEqual([['mailbox', 1]])
    expect(campScene(state, 'interior').background.id).toBe('lvl0-interior')
  })

  it('buys a piece with coins once the level unlocks it, and never twice', () => {
    expect(buyCampItem(atLevel({ ...newGame(), coins: 1000 }, 2), 'log-cabin', { price: 150, currency: 'coins' })).toEqual({ ok: false, error: 'level-locked' })
    const bought = buyCampItem(rich(), 'log-cabin', { price: 150, currency: 'coins' })
    if (!bought.ok) throw new Error(bought.error)
    expect(bought.state.coins).toBe(850)
    expect(bought.state.camp).toEqual({ owned: ['log-cabin'], using: [] })
    expect(buyCampItem(bought.state, 'log-cabin', { price: 150, currency: 'coins' })).toEqual({ ok: false, error: 'already-owned' })
  })

  it('refuses a changed price or currency, and a balance too small', () => {
    expect(buyCampItem(rich(), 'log-cabin', { price: 100, currency: 'coins' })).toEqual({ ok: false, error: 'price-changed' })
    expect(buyCampItem(rich(), 'banner', { price: 3, currency: 'coins' })).toEqual({ ok: false, error: 'price-changed' })
    expect(buyCampItem({ ...rich(), coins: 10 }, 'log-cabin', { price: 150, currency: 'coins' })).toEqual({ ok: false, error: 'insufficient-coins' })
    expect(buyCampItem({ ...rich(), premiumCoins: 2 }, 'banner', { price: 3, currency: 'premium' })).toEqual({ ok: false, error: 'insufficient-premium' })
    expect(buyCampItem(rich(), 'lvl0-exterior', { price: 0, currency: 'coins' })).toEqual({ ok: false, error: 'already-owned' })
  })

  it('pays Premium pieces with Premium Coins', () => {
    const bought = buyCampItem(rich(), 'banner', { price: 3, currency: 'premium' })
    if (!bought.ok) throw new Error(bought.error)
    expect(bought.state.premiumCoins).toBe(7)
    expect(bought.state.coins).toBe(1000)
  })

  it('puts the background and cabin in use, and objects in the slots the player chooses', () => {
    let state = rich()
    for (const [id, price] of [['log-cabin', 150], ['lake-exterior', 200], ['flag', 40], ['bench', 20]] as const) {
      const bought = buyCampItem(state, id, { price, currency: 'coins' })
      if (!bought.ok) throw new Error(bought.error)
      state = bought.state
    }
    const step = (id: string, used: boolean, slot?: number) => {
      const next = setCampItemUsed(state, id, used, slot)
      if (!next.ok) throw new Error(next.error)
      state = next.state
    }
    const slotsOf = () => campScene(state, 'exterior').placed.map((p) => [p.item.id, p.slot])
    // The mountain background has three slots; the free mailbox stands in the first.
    step('flag', true)
    expect(slotsOf()).toEqual([['mailbox', 1], ['flag', 2]])
    step('bench', true, 1)
    // The bench takes slot 1; the free mailbox moves to the empty slot 3.
    expect(slotsOf()).toEqual([['bench', 1], ['flag', 2], ['mailbox', 3]])
    step('flag', true, 3)
    expect(slotsOf()).toEqual([['bench', 1], ['mailbox', 2], ['flag', 3]])
    expect(setCampItemUsed(state, 'bench', true, 4)).toEqual({ ok: false, error: 'bad-slot' })
    step('mailbox', false)
    expect(slotsOf()).toEqual([['bench', 1], ['flag', 3]])
    expect(campSlotOf(state, getCampItem('flag')!)).toBe(3)
    // A background without slots shows no objects; the slots come back with the mountain one.
    step('log-cabin', true)
    step('lake-exterior', true)
    expect(campScene(state, 'exterior')).toMatchObject({ background: { id: 'lake-exterior' }, cabin: { id: 'log-cabin' }, placed: [] })
    expect(setCampItemUsed(state, 'bench', true)).toEqual({ ok: false, error: 'no-slot' })
    step('lvl0-exterior', true)
    expect(slotsOf()).toEqual([['bench', 1], ['flag', 3]])
    expect(setCampItemUsed(rich(), 'flag', true)).toEqual({ ok: false, error: 'not-owned' })
    expect(setCampItemUsed(rich(), 'nope', true)).toEqual({ ok: false, error: 'unknown-item' })
  })

  it('gives every shown piece with an action its button, the door always there', () => {
    // The mailbox's button sits on the object: slot 1 (0.6, 0.8), halfway up its 0.18 height.
    const fresh = campSpots(newGame(), 'exterior').map((s) => [s.item.id, s.action, s.x, Number(s.y.toFixed(2))])
    expect(fresh).toEqual([
      ['lvl0-exterior', 'enter', 0.36, 0.52],
      ['mailbox', 'mailbox', 0.6, 0.71],
    ])
    // Each background has its own door; a cabin drawn over it moves the door.
    let state = rich()
    for (const [id, price] of [['lake-exterior', 200], ['log-cabin', 150]] as const) {
      const bought = buyCampItem(state, id, { price, currency: 'coins' })
      if (!bought.ok) throw new Error(bought.error)
      state = bought.state
    }
    const lake = setCampItemUsed(state, 'lake-exterior', true)
    if (!lake.ok) throw new Error(lake.error)
    // The lake has no slots: no mailbox there.
    expect(campSpots(lake.state, 'exterior').map((s) => [s.item.id, s.action, s.x])).toEqual([['lake-exterior', 'enter', 0.5]])
    const cabin = setCampItemUsed(lake.state, 'log-cabin', true)
    if (!cabin.ok) throw new Error(cabin.error)
    expect(campSpots(cabin.state, 'exterior').map((s) => [s.item.id, s.action])).toEqual([['log-cabin', 'enter']])
    expect(campSpots(newGame(), 'interior').map((s) => s.action)).toEqual(['gear'])
  })

  it('takes a free piece out and puts it back', () => {
    const out = setCampItemUsed(newGame(), 'mailbox', false)
    if (!out.ok) throw new Error(out.error)
    expect(out.state.camp).toEqual({ owned: [], using: [], off: ['mailbox'] })
    expect(campScene(out.state, 'exterior').decor).toEqual([])
    const back = setCampItemUsed(out.state, 'mailbox', true, 2)
    if (!back.ok) throw new Error(back.error)
    expect(campScene(back.state, 'exterior').placed.map((p) => [p.item.id, p.slot])).toEqual([['mailbox', 2]])
  })

  it('exchanges coins for Premium Coins at the confirmed rate, one way', () => {
    const exchanged = exchangePremium({ ...newGame(), coins: 350 }, 3, 100)
    if (!exchanged.ok) throw new Error(exchanged.error)
    expect([exchanged.state.coins, exchanged.state.premiumCoins]).toEqual([50, 3])
    expect(exchangePremium({ ...newGame(), coins: 350 }, 4, 100)).toEqual({ ok: false, error: 'insufficient-coins' })
    expect(exchangePremium({ ...newGame(), coins: 350 }, 1, 90)).toEqual({ ok: false, error: 'rate-changed' })
    expect(exchangePremium({ ...newGame(), coins: 350 }, 0, 100)).toEqual({ ok: false, error: 'bad-amount' })
    expect(exchangePremium({ ...newGame(), coins: 350 }, 1.5, 100)).toEqual({ ok: false, error: 'bad-amount' })
  })

  it('reads saved pieces safely: unknown ones dropped, one background per scene', () => {
    expect(parseCampState({ owned: ['log-cabin', 'gone', 'log-cabin'], using: ['log-cabin', 'lvl0-exterior', 'lake-exterior', 'gone'] })).toEqual({
      owned: ['log-cabin'],
      using: ['log-cabin', 'lvl0-exterior'],
    })
    expect(parseCampState({ owned: 'x' })).toBeNull()
    expect(parseCampState({ owned: [], using: [], off: ['mailbox', 'lvl0-exterior', 'flag', 'gone'] })).toEqual({ owned: [], using: [], off: ['mailbox'] })
    // Saved slots: known decor of that scene, owned or free, once each.
    expect(
      parseCampState({ owned: ['flag'], using: [], slots: { 'exterior:1': 'flag', 'exterior:2': 'flag', 'exterior:3': 'bench', 'interior:1': 'mailbox', 'exterior:9': 'mailbox', 'exterior:4': 'mailbox' } }),
    ).toEqual({ owned: ['flag'], using: [], slots: { 'exterior:1': 'flag', 'exterior:4': 'mailbox' } })
    const saved = JSON.parse(JSON.stringify({ ...rich(), camp: { owned: ['flag'], using: ['flag'] } }))
    expect(parseGameState(saved, T0)?.camp).toEqual({ owned: ['flag'], using: ['flag'] })
    expect(parseGameState(saved, T0)?.premiumCoins).toBe(10)
    expect(parseGameState({ ...saved, premiumCoins: -1 }, T0)).toBeNull()
    expect(campItems('interior', 'decor').map((i) => i.id)).toEqual(['banner'])
  })
})

describe('Base Camp buttons inside', () => {
  const header = 'id,scene,kind,level,price,currency,art,action,spot_x,spot_y,slots,size,name\n'
  const exterior = 'ext,exterior,background,0,0,coins,ext,enter,0.5,0.5,,,Outside\n'

  it('an interior background may have no button, or any button (owner, 17 November 2026)', () => {
    const items = parseCampCatalog(
      header + exterior + 'int-1,interior,background,0,0,coins,int_1,,,,,,Room\nint-2,interior,background,1,10,coins,int_2,mailbox,0.3,0.6,,,Room 2\n',
    )
    expect(items.find((item) => item.id === 'int-1')?.action).toBeUndefined()
    expect(items.find((item) => item.id === 'int-2')?.action).toBe('mailbox')
  })

  it('an exterior background still needs its door', () => {
    expect(() => parseCampCatalog(header + 'ext,exterior,background,0,0,coins,ext,,,,,,Outside\nint,interior,background,0,0,coins,int,,,,,,Room\n')).toThrow(/enter/)
  })
})
