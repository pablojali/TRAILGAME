import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { LEVEL_THRESHOLDS } from '../../domain/athlete/levels'
import { newGame, withAthlete } from '../../test/gameFixtures'
import { readSave, renderApp, seedCareer } from '../../test/renderApp'

describe('Base Camp (V1)', () => {
  it('opens outside the cabin, goes in, and the gear zone leads to Equipment and back', async () => {
    const user = userEvent.setup()
    // The free mailbox and gear stand, put in by the player (free objects show once put in).
    seedCareer({ ...newGame(), camp: { owned: [], using: ['mailbox', 'gear-stand'] } })
    await renderApp('/')
    // The main navigation: Base Camp in Equipment's place.
    await user.click(screen.getByRole('link', { name: 'Base Camp' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Base Camp' })).toBeInTheDocument()
    expect(screen.getByLabelText('Your cabin, outside')).toBeInTheDocument()

    // The mailbox (a free piece with its own action) says what will arrive there.
    await user.click(screen.getByRole('button', { name: 'Mailbox' }))
    expect(screen.getByRole('dialog', { name: 'Mailbox' })).toHaveTextContent('The mailbox needs a connection.')
    await user.click(screen.getByRole('button', { name: 'Close' }))

    // The door takes the player inside; the switch shows where they are.
    await user.click(screen.getByRole('button', { name: 'Go in' }))
    expect(screen.getByLabelText("Your cabin's living room")).toBeInTheDocument()

    // The gear zone opens Equipment, unchanged; its back link returns inside.
    await user.click(screen.getByRole('link', { name: 'Gear' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Equipment' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: '← Base Camp' }))
    expect(screen.getByLabelText("Your cabin's living room")).toBeInTheDocument()

    // And back out.
    await user.click(screen.getByRole('button', { name: '← Go out' }))
    expect(screen.getByLabelText('Your cabin, outside')).toBeInTheDocument()
  })

  it('customizes the cabin in tabs: buying an object puts it in the scene; coins are exchanged in the wallet', async () => {
    const user = userEvent.setup()
    const level = LEVEL_THRESHOLDS.find((t) => t.level === 2)!.minXp
    seedCareer({ ...withAthlete(newGame(), { xp: level }), coins: 300 })
    await renderApp('/base-camp')
    await user.click(screen.getByRole('button', { name: 'Customize' }))
    const shop = screen.getByRole('dialog', { name: 'Customize your cabin' })

    // Tabs per kind: backgrounds, cabins and decorations.
    expect(within(shop).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Backgrounds', 'Upgrades', 'Cabins', 'Decorations'])
    expect(within(shop).getByText('Level 5')).toBeInTheDocument()
    await user.click(within(shop).getByRole('tab', { name: 'Decorations' }))
    // Buying the bench puts it in the scene and closes the sheet.
    await user.click(within(shop).getByRole('button', { name: 'Buy Bench' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(readSave()?.state).toMatchObject({ coins: 280, camp: { owned: ['bench'], using: ['bench'] } })

    // Taking it out: the sheet stays open.
    await user.click(screen.getByRole('button', { name: 'Customize' }))
    await user.click(screen.getByRole('tab', { name: 'Decorations' }))
    await user.click(screen.getByRole('button', { name: /Remove.*Bench|Take out.*Bench/ }))
    expect(readSave()?.state.camp?.using).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Close' }))

    // The wallet, from the coins in the top bar: 2 Premium Coins for 200 coins.
    await user.click(screen.getByRole('button', { name: 'Coins and Premium Coins: exchange' }))
    const wallet = screen.getByRole('dialog', { name: 'Your wallet' })
    const amount = within(wallet).getByLabelText('Premium Coins to get')
    await user.clear(amount)
    await user.type(amount, '2')
    expect(within(wallet).getByText('Costs 200 coins')).toBeInTheDocument()
    await user.click(within(wallet).getByRole('button', { name: 'Exchange' }))
    expect(within(wallet).getByRole('status')).toHaveTextContent('You got 2 Premium Coins.')
    expect(readSave()?.state).toMatchObject({ coins: 80, premiumCoins: 2 })
  })
})
