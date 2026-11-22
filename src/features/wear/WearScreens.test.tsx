import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WEAR } from '../../domain/equipment/wear'
import { buildInbox } from '../../app/inbox/inbox'
import type { GameState } from '../../game-engine/gameState'
import { raceCurrentDay } from '../../game-engine/races'
import { currentRef, newGame, onSunday, T0, withEntry } from '../../test/gameFixtures'
import { readSave, renderApp, seedCareer, settled } from '../../test/renderApp'

// The simulated rewarded ad, instantly: it moves the clock past the ad's length and completes.
vi.mock('../../app/game/ads', () => ({
  simulatedAdProvider: () => ({
    async show() {
      vi.setSystemTime(Date.now() + 6000)
      return { completed: true }
    },
  }),
}))

/**
 * Equipment wear screens (brief A-5) and the rewarded-ad offer (B-6d). The tables ship with wear off;
 * these tests turn it on (wear_speed 1). Test table: starter shoes 150 km and 20 coins, trail shoes
 * 300 km.
 */
beforeEach(() => {
  WEAR.speed = 1
})
afterEach(() => {
  WEAR.speed = 0
})

function shod(used: number, extra: Partial<GameState> = {}): GameState {
  return { ...newGame(), ownedEquipment: ['starter-shoes'], equipment: ['starter-shoes'], wear: { 'starter-shoes': used }, ...extra }
}

describe('Equipment with wear', () => {
  it('shows the durability, band and km left, and replaces a worn pair after a confirmation', async () => {
    const user = userEvent.setup()
    seedCareer(shod(0.28, { coins: 50 }))
    await renderApp('/equipment?slot=shoes')
    const card = within(screen.getByRole('region', { name: 'Shoes cards' })).getAllByRole('button')[0]!
    expect(card).toHaveAccessibleName('Starter shoes, 20 coins, Equipped, 72% · Normal')
    await user.click(card)
    expect(screen.getByRole('meter', { name: '72% durability left, Normal' })).toHaveAttribute('aria-valuenow', '72')
    expect(screen.getByLabelText('Durability left: 108 km of 150 km')).toHaveTextContent('108 / 150 km left')
    await user.click(screen.getByRole('button', { name: 'Replace · 20 coins' }))
    expect(screen.getByText('Replace Starter shoes for 20 coins? Your balance after: 30 coins.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm replacement' }))
    await settled()
    await waitFor(() => expect(readSave()!.state.coins).toBe(30))
    expect(readSave()!.state.wear).toEqual({})
    expect(screen.getByText('Starter shoes replaced: as good as new.')).toBeInTheDocument()
  })

  it('offers the rewarded ad to a runner stuck with no shoes that can race and no coins, and says what it gave', async () => {
    const user = userEvent.setup()
    seedCareer(shod(1, { coins: 5 }))
    await renderApp('/equipment?tab=shop')
    expect(screen.getByText('2 coin ads left today')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Watch an ad for 20 coins' }))
    await waitFor(() => expect(screen.getByText('+20 coins: buy a pair in Equipment.')).toBeInTheDocument())
    expect(readSave()!.state.coins).toBe(25)
  })
})

describe('Races with wear', () => {
  it('blocks the entry with no shoes on, says why and links to Equipment', async () => {
    seedCareer({ ...newGame(), equipment: [] })
    await renderApp('/races/RACE-001')
    expect(screen.getByRole('button', { name: 'Enter race' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getAllByText('You need shoes on to race. Put on a pair in Equipment.').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Go to Equipment' })).toHaveAttribute('href', '/equipment?slot=shoes')
  })

  it('warns where the shoes will break and needs an explicit confirmation to enter', async () => {
    const user = userEvent.setup()
    seedCareer(shod(1 - 2 / 150))
    await renderApp('/races/RACE-002')
    await user.click(screen.getByRole('button', { name: 'Enter race' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/Your shoes will break at aid station 1, about km [\d.]+: DNF, no prize or ranking points\./)
    expect(readSave()!.state.raceEntries).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Enter anyway' }))
    await settled()
    await waitFor(() => expect(readSave()!.state.raceEntries).toHaveLength(1))
  })

  it('on race day with worn-out shoes, lets the runner withdraw (the day becomes Rest)', async () => {
    const user = userEvent.setup()
    const { state } = withEntry(onSunday(shod(1)), 'RACE-001')
    seedCareer(state)
    await renderApp('/races/RACE-001')
    await user.click(screen.getByRole('button', { name: 'Withdraw from the race' }))
    await waitFor(() => expect(readSave()!.state.raceEntries).toEqual([]))
    expect(readSave()!.state.week.number).toBe(state.week.number + 1)
  })

  it('shows a DNF in the result and the standings, with what the worn shoes cost', async () => {
    const user = userEvent.setup()
    const { state, entry } = withEntry(onSunday(shod(1 - 2 / 150)), 'RACE-002')
    const raced = raceCurrentDay(state, currentRef(state), entry.id, T0)
    if (!raced.ok) throw new Error(raced.error)
    seedCareer(raced.value.state)
    await renderApp(`/races/results/${entry.id}`)
    expect(screen.getByRole('heading', { level: 1, name: 'DNF at aid station 1' })).toBeInTheDocument()
    expect(screen.getByText(/Your shoes broke at km [\d.]+\. No prize or ranking points/)).toBeInTheDocument()
    expect(screen.getByText(/Your shoes \(2% at the start\) cost you no time\.|Worn shoes \(2% at the start\) cost you/)).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Full results' }))
    const you = screen.getByRole('row', { current: true })
    expect(within(you).getAllByText('DNF')).toHaveLength(2)
  })
})

describe('Training and Inbox with wear', () => {
  it('warns of the injury risk when the shoes are almost worn out', async () => {
    seedCareer(shod(0.95))
    await renderApp('/training')
    expect(screen.getByText(/Your shoes are almost worn out: each session carries a risk of injury\./)).toBeInTheDocument()
  })

  it('notifies each threshold once per pair, and again for a replaced pair', () => {
    const ids = (state: GameState) => buildInbox(state, T0).filter((i) => i.kind === 'gear').map((i) => i.id)
    expect(ids(shod(0.5))).toEqual([])
    expect(ids(shod(0.65))).toEqual(['gear:starter-shoes:0:40'])
    expect(ids(shod(0.95))).toEqual(['gear:starter-shoes:0:40', 'gear:starter-shoes:0:20', 'gear:starter-shoes:0:10', 'gear:starter-shoes:0:9'])
    expect(ids(shod(0.65, { replacements: { 'starter-shoes': 1 } }))).toEqual(['gear:starter-shoes:1:40'])
  })
})
