import { describe, expect, it } from 'vitest'
import { LEVEL_THRESHOLDS } from '../domain/athlete/levels'
import { campItems, getCampItem, parseCampCatalog } from '../domain/basecamp/catalog'
import { parseGameState } from '../repositories/gameRepository'
import { newGame, T0, withAthlete } from '../test/gameFixtures'
import { buyCampItem, campScene, campSpots, exchangePremium, missingRequired, parseCampState, setCampItemUsed } from './camp'
import type { GameState } from './gameState'

const atLevel = (state: GameState, level: number) => withAthlete(state, { xp: LEVEL_THRESHOLDS.find((t) => t.level === level)!.minXp })
const rich = (level = 6): GameState => ({ ...atLevel(newGame(), level), coins: 1000, premiumCoins: 10 })

describe('Base Camp pieces', () => {
  it('shows the free background of each scene to a new career', () => {
    const state = newGame()
    // Free decor (the mailbox) is the player's but only shows once placed (owner request, 19 November 2026).
    expect(campScene(state, 'exterior')).toMatchObject({ background: getCampItem('lvl0-exterior'), cabin: null, decor: [] })
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

  it('puts the background and cabin in use, and any number of objects (owner design, 20 November 2026: no places)', () => {
    let state = rich()
    for (const [id, price] of [['log-cabin', 150], ['lake-exterior', 200], ['flag', 40], ['bench', 20]] as const) {
      const bought = buyCampItem(state, id, { price, currency: 'coins' })
      if (!bought.ok) throw new Error(bought.error)
      state = bought.state
    }
    const step = (id: string, used: boolean) => {
      const next = setCampItemUsed(state, id, used)
      if (!next.ok) throw new Error(next.error)
      state = next.state
    }
    const decor = () => campScene(state, 'exterior').decor.map((item) => item.id)
    // Objects are whole-canvas pictures over the background: all of them at once, in the table's order.
    step('mailbox', true)
    step('flag', true)
    step('bench', true)
    expect(decor()).toEqual(['flag', 'bench', 'mailbox'])
    step('mailbox', false)
    expect(decor()).toEqual(['flag', 'bench'])
    // They stay with any background or cabin.
    step('log-cabin', true)
    step('lake-exterior', true)
    expect(campScene(state, 'exterior')).toMatchObject({ background: { id: 'lake-exterior' }, cabin: { id: 'log-cabin' } })
    expect(decor()).toEqual(['flag', 'bench'])
    expect(setCampItemUsed(rich(), 'flag', true)).toEqual({ ok: false, error: 'not-owned' })
    expect(setCampItemUsed(rich(), 'nope', true)).toEqual({ ok: false, error: 'unknown-item' })
  })

  it('gives every shown piece with an action its button, the door always there', () => {
    // The mailbox's button sits at its focus, on the object.
    const placed = setCampItemUsed(newGame(), 'mailbox', true)
    if (!placed.ok) throw new Error(placed.error)
    const fresh = campSpots(placed.state, 'exterior').map((s) => [s.item.id, s.action, s.x, Number(s.y.toFixed(2))])
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
    // Inside, the gear button is the gear stand's, once placed in point 1 (owner design, 19 November 2026).
    expect(campSpots(newGame(), 'interior')).toEqual([])
    const stand = setCampItemUsed(newGame(), 'gear-stand', true)
    if (!stand.ok) throw new Error(stand.error)
    expect(campSpots(stand.state, 'interior').map((s) => [s.item.id, s.action])).toEqual([['gear-stand', 'gear']])
  })

  it('evolutions: one level of a family in use, and a level that needs other pieces first (owner design, 20 November 2026)', () => {
    let state = rich()
    const buy = (id: string, price: number) => {
      const bought = buyCampItem(state, id, { price, currency: 'coins' })
      if (!bought.ok) return bought.error
      state = bought.state
      return null
    }
    const use = (id: string) => {
      const next = setCampItemUsed(state, id, true)
      if (!next.ok) throw new Error(next.error)
      state = next.state
    }
    // The big firepit needs the firepit and the log cabin first.
    expect(buy('fire-2', 30)).toBe('needs-piece')
    expect(missingRequired(state, getCampItem('fire-2')!).map((item) => item.id)).toEqual(['fire-1', 'log-cabin'])
    expect(buy('fire-1', 10)).toBeNull()
    expect(buy('log-cabin', 150)).toBeNull()
    expect(buy('fire-2', 30)).toBeNull()
    use('fire-1')
    use('fire-2')
    // The new level replaces the old one.
    expect(campScene(state, 'exterior').decor.map((item) => item.id)).toEqual(['fire-2'])
    expect(parseCampState({ owned: ['fire-1', 'fire-2'], using: ['fire-1', 'fire-2'] })).toEqual({ owned: ['fire-1', 'fire-2'], using: ['fire-1'] })
    expect(() => parseCampCatalog('id,scene,kind,level,price,currency,art,action,spot_x,spot_y,name,family,requires\next,exterior,background,0,0,coins,ext,enter,0.5,0.5,Out,,nope\nint,interior,background,0,0,coins,int,,,,In,,\n')).toThrow(/unknown piece nope/)
  })

  it('a free object is the player\'s from the start but shows once put in', () => {
    expect(campScene(newGame(), 'exterior').decor).toEqual([])
    const shown = setCampItemUsed(newGame(), 'mailbox', true)
    if (!shown.ok) throw new Error(shown.error)
    expect(shown.state.camp).toEqual({ owned: [], using: ['mailbox'] })
    const out = setCampItemUsed(shown.state, 'mailbox', false)
    if (!out.ok) throw new Error(out.error)
    expect(out.state.camp).toEqual({ owned: [], using: [] })
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
    expect(parseCampState({ owned: [], using: [], off: ['mailbox', 'lvl0-exterior', 'flag', 'gone'] })).toEqual({ owned: [], using: [] })
    // Saves from when objects stood in places: the placed objects (owned or free) stay in use.
    expect(
      parseCampState({ owned: ['flag'], using: [], slots: { 'exterior:1': 'flag', 'exterior:2': 'flag', 'exterior:3': 'bench', 'interior:1': 'gear-stand', 'exterior:4': 'mailbox' } }),
    ).toEqual({ owned: ['flag'], using: ['flag', 'gear-stand', 'mailbox'] })
    const saved = JSON.parse(JSON.stringify({ ...rich(), camp: { owned: ['flag'], using: ['flag'] } }))
    expect(parseGameState(saved, T0)?.camp).toEqual({ owned: ['flag'], using: ['flag'] })
    expect(parseGameState(saved, T0)?.premiumCoins).toBe(10)
    expect(parseGameState({ ...saved, premiumCoins: -1 }, T0)).toBeNull()
    expect(campItems('interior', 'decor').map((i) => i.id)).toEqual(['banner', 'gear-stand'])
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

describe('Base Camp upgrades (owner design, 17 November 2026)', () => {
  const ok = <T,>(result: { ok: true; state: T } | { ok: false; error: string }): T => {
    if (!result.ok) throw new Error(result.error)
    return result.state
  }

  it('redraws its background with another picture, keeping the background’s button and slots', () => {
    const state = ok(setCampItemUsed(ok(setCampItemUsed(ok(buyCampItem(rich(), 'stove', { price: 30, currency: 'coins' })), 'stove', true)), 'gear-stand', true))
    const shown = campScene(state, 'interior')
    expect(shown.background.id).toBe('lvl0-interior')
    expect(shown.picture.id).toBe('stove')
    // The gear stand keeps its button (its focus) under the upgrade.
    expect(campSpots(state, 'interior').map((s) => [s.item.id, s.action, s.x])).toEqual([['gear-stand', 'gear', 0.3]])
    // Taken out, the background's own picture is back.
    expect(campScene(ok(setCampItemUsed(state, 'stove', false)), 'interior').picture.id).toBe('lvl0-interior')
  })

  it('needs its background, and brings it into the scene when chosen', () => {
    expect(buyCampItem(rich(6), 'boat', { price: 2, currency: 'premium' })).toEqual({ ok: false, error: 'needs-base' })
    let state = ok(buyCampItem(rich(6), 'lake-exterior', { price: 200, currency: 'coins' }))
    state = ok(buyCampItem(state, 'boat', { price: 2, currency: 'premium' }))
    expect(campScene(state, 'exterior').picture.id).toBe('lvl0-exterior')
    state = ok(setCampItemUsed(state, 'boat', true))
    expect(campScene(state, 'exterior')).toMatchObject({ background: getCampItem('lake-exterior'), picture: getCampItem('boat') })
    // Another background hides it; coming back to the lake shows it again.
    state = ok(setCampItemUsed(state, 'lvl0-exterior', true))
    expect(campScene(state, 'exterior').picture.id).toBe('lvl0-exterior')
    state = ok(setCampItemUsed(state, 'lake-exterior', true))
    expect(campScene(state, 'exterior').picture.id).toBe('boat')
  })

  it('keeps one upgrade per background in a saved camp', () => {
    expect(parseCampState({ owned: ['stove'], using: ['stove', 'stove'] })).toEqual({ owned: ['stove'], using: ['stove'] })
  })

  it('is a whole picture with a base and an optional shop focus in the table', () => {
    const header = 'id,scene,kind,level,price,currency,art,action,spot_x,spot_y,slots,size,base,focus,name\n'
    const ext = 'ext,exterior,background,0,0,coins,ext,enter,0.5,0.5,,,,,Outside\nint,interior,background,0,0,coins,int,,,,,,,,Room\n'
    const [, , up] = parseCampCatalog(header + ext + 'up,exterior,upgrade,1,5,coins,up,,,,,,ext,0.2:0.7:4,Up\n')
    expect(up).toMatchObject({ kind: 'upgrade', base: 'ext', focus: { x: 0.2, y: 0.7, zoom: 4 } })
    expect(() => parseCampCatalog(header + ext + 'up,exterior,upgrade,1,5,coins,up,,,,,,nope,,Up\n')).toThrow(/base/)
    expect(() => parseCampCatalog(header + ext + 'up,exterior,upgrade,1,5,coins,up,mailbox,0.1,0.1,,,ext,,Up\n')).toThrow(/keeps its background/)
    expect(() => parseCampCatalog(header + ext + 'up,exterior,upgrade,1,5,coins,up,,,,,,ext,0.2:0.7:9,Up\n')).toThrow(/focus/)
  })
})
