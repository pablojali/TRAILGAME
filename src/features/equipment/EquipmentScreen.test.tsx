import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { newGame } from '../../test/gameFixtures'
import { readSave, renderApp, seedCareer } from '../../test/renderApp'

function layers(name: RegExp) {
  return [...screen.getByRole('img', { name }).querySelectorAll('svg image')].map((i) => i.getAttribute('data-layer'))
}

describe('Equipment', () => {
  it('lists the starter shoes, equips them on the avatar and takes them off, saving each change', async () => {
    const user = userEvent.setup()
    seedCareer()
    const view = renderApp('/equipment')
    expect(screen.getByRole('heading', { level: 1, name: 'Equipment' })).toBeInTheDocument()
    expect(screen.getByText('Starter shoes')).toBeInTheDocument()
    expect(screen.getByText('Not equipped')).toBeInTheDocument()
    expect(layers(/with the equipment worn/)).toEqual(['body'])

    await user.click(screen.getByRole('button', { name: 'Equip starter shoes' }))
    expect(screen.getByText('Equipped')).toBeInTheDocument()
    expect(screen.getByText('Starter shoes equipped.')).toHaveAttribute('role', 'status')
    expect(layers(/with the equipment worn/)).toEqual(['body', 'starter-shoes'])
    expect(readSave()!.state.equipment).toEqual(['starter-shoes'])
    view.unmount()

    renderApp('/')
    expect(screen.getByRole('img', { name: /wearing starter shoes/ })).toBeInTheDocument()
  })

  it('takes the shoes off', async () => {
    const user = userEvent.setup()
    seedCareer({ ...newGame(), equipment: ['starter-shoes'] })
    renderApp('/equipment')
    await user.click(screen.getByRole('button', { name: 'Take off starter shoes' }))
    expect(readSave()!.state.equipment).toEqual([])
    expect(screen.getByText('Starter shoes taken off.')).toHaveAttribute('role', 'status')
  })

  it('buys from the shop with a confirmation, then the item can be equipped', async () => {
    const user = userEvent.setup()
    seedCareer({ ...newGame(), coins: 60 })
    renderApp('/equipment')
    expect(screen.getByText('Balance').parentElement).toHaveTextContent('Balance 60 coins')
    expect(screen.getByRole('heading', { name: 'Shop' })).toBeInTheDocument()
    // Each item says what it does in races, with its level.
    expect(screen.getByText('Races: Climbing +2, but flats 1% slower.')).toBeInTheDocument()
    expect(screen.getByText('Races: Speed +3, descents 2% faster, but technical descents 30% harder.')).toBeInTheDocument()
    expect(screen.getByText('Races: Endurance +2, 15% less wear over distance.')).toBeInTheDocument()
    // The price is next to the name, with the coin symbol.
    expect(screen.getByText('Poles · Lvl 2').parentElement).toHaveTextContent('Poles · Lvl 2 50 coins')
    expect(screen.getByText('Poles · Lvl 2').parentElement!.querySelector('svg')).toBeInTheDocument()
    // Not enough for the backpack lvl 2 (90): the button is inactive and says why.
    const pack = screen.getByRole('button', { name: 'Buy hydration backpack · lvl 2' })
    expect(pack).toHaveAttribute('aria-disabled', 'true')
    expect(pack).toHaveAccessibleDescription('You need 30 coins more.')

    await user.click(screen.getByRole('button', { name: 'Buy poles · lvl 2' }))
    expect(screen.getByText('Balance 60 coins → 10 coins.')).toBeInTheDocument()
    expect(readSave()!.state.coins).toBe(60)
    await user.dblClick(screen.getByRole('button', { name: 'Pay 50 coins' }))
    expect(readSave()!.state).toMatchObject({ coins: 10, ownedEquipment: ['starter-shoes', 'poles-2'], equipment: [] })
    expect(screen.getByText('Poles · Lvl 2 bought for 50 coins.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Equip poles · lvl 2' }))
    expect(readSave()!.state.equipment).toEqual(['poles-2'])
  })

})
