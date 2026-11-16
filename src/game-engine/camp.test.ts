import { describe, expect, it } from 'vitest'
import { LEVEL_THRESHOLDS } from '../domain/athlete/levels'
import { campItems, getCampItem } from '../domain/basecamp/catalog'
import { parseGameState } from '../repositories/gameRepository'
import { newGame, T0, withAthlete } from '../test/gameFixtures'
import { buyCampItem, campScene, campSpots, exchangePremium, parseCampState, setCampItemUsed } from './camp'
import type { GameState } from './gameState'

const atLevel = (state: GameState, level: number) => withAthlete(state, { xp: LEVEL_THRESHOLDS.find((t) => t.level === level)!.minXp })
const rich = (level = 6): GameState => ({ ...atLevel(newGame(), level), coins: 1000, premiumCoins: 10 })

describe('Base Camp pieces', () => {
  it('shows the free background of each scene to a new career', () => {
    const state = newGame()
    expect(campScene(state, 'exterior')).toEqual({ background: getCampItem('lvl0-exterior'), cabin: null, decor: [getCampItem('mailbox')] })
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

  it('puts pieces in the scene: one background and one cabin, any decor', () => {
    let state = rich()
    for (const [id, price] of [['log-cabin', 150], ['lake-exterior', 200], ['flag', 40], ['bench', 20]] as const) {
      const bought = buyCampItem(state, id, { price, currency: 'coins' })
      if (!bought.ok) throw new Error(bought.error)
      state = bought.state
    }
    for (const id of ['log-cabin', 'lake-exterior', 'flag', 'bench']) {
      const used = setCampItemUsed(state, id, true)
      if (!used.ok) throw new Error(used.error)
      state = used.state
    }
    const scene = campScene(state, 'exterior')
    expect([scene.background.id, scene.cabin?.id, scene.decor.map((d) => d.id)]).toEqual(['lake-exterior', 'log-cabin', ['flag', 'bench', 'mailbox']])
    // The free background replaces the bought one; taking the flag out leaves the bench.
    const back = setCampItemUsed(state, 'lvl0-exterior', true)
    const noFlag = back.ok && setCampItemUsed(back.state, 'flag', false)
    if (!noFlag || !noFlag.ok) throw new Error('refused')
    const after = campScene(noFlag.state, 'exterior')
    expect([after.background.id, after.cabin?.id, after.decor.map((d) => d.id)]).toEqual(['lvl0-exterior', 'log-cabin', ['bench', 'mailbox']])
    expect(setCampItemUsed(rich(), 'flag', true)).toEqual({ ok: false, error: 'not-owned' })
    expect(setCampItemUsed(rich(), 'nope', true)).toEqual({ ok: false, error: 'unknown-item' })
  })

  it('gives every shown piece with an action its button, the door always there', () => {
    const fresh = campSpots(newGame(), 'exterior').map((s) => [s.item.id, s.action, s.x, s.y])
    expect(fresh).toEqual([
      ['lvl0-exterior', 'enter', 0.36, 0.52],
      ['mailbox', 'mailbox', 0.7, 0.62],
    ])
    // The lake has no door: the free background lends its own. The log cabin brings a new one.
    let state = rich()
    for (const [id, price] of [['lake-exterior', 200], ['log-cabin', 150]] as const) {
      const bought = buyCampItem(state, id, { price, currency: 'coins' })
      if (!bought.ok) throw new Error(bought.error)
      state = bought.state
    }
    const lake = setCampItemUsed(state, 'lake-exterior', true)
    if (!lake.ok) throw new Error(lake.error)
    expect(campSpots(lake.state, 'exterior').map((s) => [s.item.id, s.action])).toEqual([
      ['mailbox', 'mailbox'],
      ['lvl0-exterior', 'enter'],
    ])
    const cabin = setCampItemUsed(lake.state, 'log-cabin', true)
    if (!cabin.ok) throw new Error(cabin.error)
    expect(campSpots(cabin.state, 'exterior').map((s) => [s.item.id, s.action])).toEqual([
      ['log-cabin', 'enter'],
      ['mailbox', 'mailbox'],
    ])
    expect(campSpots(newGame(), 'interior').map((s) => s.action)).toEqual(['gear'])
  })

  it('takes a free piece out and puts it back', () => {
    const out = setCampItemUsed(newGame(), 'mailbox', false)
    if (!out.ok) throw new Error(out.error)
    expect(out.state.camp).toEqual({ owned: [], using: [], off: ['mailbox'] })
    expect(campScene(out.state, 'exterior').decor).toEqual([])
    const back = setCampItemUsed(out.state, 'mailbox', true)
    if (!back.ok) throw new Error(back.error)
    expect(campScene(back.state, 'exterior').decor.map((d) => d.id)).toEqual(['mailbox'])
    expect(parseCampState({ owned: [], using: [], off: ['mailbox', 'lvl0-exterior', 'flag', 'gone'] })).toEqual({ owned: [], using: [], off: ['mailbox'] })
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
    const saved = JSON.parse(JSON.stringify({ ...rich(), camp: { owned: ['flag'], using: ['flag'] } }))
    expect(parseGameState(saved, T0)?.camp).toEqual({ owned: ['flag'], using: ['flag'] })
    expect(parseGameState(saved, T0)?.premiumCoins).toBe(10)
    expect(parseGameState({ ...saved, premiumCoins: -1 }, T0)).toBeNull()
    expect(campItems('interior', 'decor').map((i) => i.id)).toEqual(['banner'])
  })
})
