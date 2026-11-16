import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { LEVEL_THRESHOLDS } from '../../domain/athlete/levels'
import { newGame, withAthlete } from '../../test/gameFixtures'
import { readSave, renderApp, seedCareer } from '../../test/renderApp'

describe('Base Camp (V1)', () => {
  it('opens outside the cabin, goes in, and the gear zone leads to Equipment and back', async () => {
    const user = userEvent.setup()
    seedCareer()
    await renderApp('/')
    // The main navigation: Base Camp in Equipment's place.
    await user.click(screen.getByRole('link', { name: 'Base Camp' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Base Camp' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Outside' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Your cabin, outside')).toBeInTheDocument()

    // The door takes the player inside; the switch shows where they are.
    await user.click(screen.getByRole('button', { name: 'Go in' }))
    expect(screen.getByRole('button', { name: 'Inside' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText("Your cabin's living room")).toBeInTheDocument()

    // The gear zone opens Equipment, unchanged; its back link returns inside.
    await user.click(screen.getByRole('link', { name: 'Gear' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Equipment' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: '← Base Camp' }))
    expect(screen.getByRole('button', { name: 'Inside' })).toHaveAttribute('aria-pressed', 'true')

    // And back out.
    await user.click(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.getByLabelText('Your cabin, outside')).toBeInTheDocument()
  })

  it('customizes the cabin: exchanges coins, buys a piece and places it', async () => {
    const user = userEvent.setup()
    const level = LEVEL_THRESHOLDS.find((t) => t.level === 2)!.minXp
    seedCareer({ ...withAthlete(newGame(), { xp: level }), coins: 300 })
    await renderApp('/base-camp')
    await user.click(screen.getByRole('button', { name: 'Customize' }))
    const shop = screen.getByRole('dialog', { name: 'Customize your cabin' })
    expect(shop).toBeInTheDocument()

    // Level 2: the bench and the flag are for sale; the log cabin (level 3) is still locked.
    expect(screen.getByText('Level 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Buy Bench' }))
    expect(within(shop).getByRole('status')).toHaveTextContent('Bench is yours.')
    await user.click(screen.getByRole('button', { name: 'Place Bench' }))
    expect(screen.getByRole('button', { name: 'Remove Bench' })).toHaveAttribute('aria-pressed', 'true')

    // Coins for Premium Coins: 2 × 100.
    const amount = screen.getByLabelText('Premium Coins to get')
    await user.clear(amount)
    await user.type(amount, '2')
    expect(screen.getByText('Costs 200 coins')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Exchange' }))
    expect(within(shop).getByRole('status')).toHaveTextContent('You got 2 Premium Coins.')
    expect(readSave()?.state).toMatchObject({ coins: 80, premiumCoins: 2, camp: { owned: ['bench'], using: ['bench'] } })

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
