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
    expect(screen.getByRole('tab', { name: 'Equipped' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Put on an item you own')).toBeInTheDocument()
    expect(layers(/with the equipment worn/)).toEqual(['body'])

    const change = screen.getByRole('button', { name: 'Change shoes' })
    await user.click(change)
    expect(change).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: 'Equip starter shoes' }))
    expect(screen.getByText('Starter shoes', { selector: 'strong' })).toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: 'Change shoes' }))
    await user.click(screen.getByRole('button', { name: 'Take off starter shoes' }))
    expect(readSave()!.state.equipment).toEqual([])
    expect(screen.getByText('Starter shoes taken off.')).toHaveAttribute('role', 'status')
  })

  it('buys from the shop with a confirmation, then the item can be equipped', async () => {
    const user = userEvent.setup()
    seedCareer({ ...newGame(), coins: 60 })
    renderApp('/equipment')
    expect(screen.getByText('Balance').parentElement).toHaveTextContent('Balance 60 coins')
    // Poles: nothing owned yet, so the row offers the shop for that slot.
    await user.click(screen.getByRole('button', { name: 'Shop poles' }))
    expect(screen.getByRole('tab', { name: 'Shop' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Poles' })).toHaveAttribute('aria-pressed', 'true')
    // Each item says what it does in races, with its level.
    expect(screen.getByText('Races: Climbing +2, but flats 1% slower.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Shoes' }))
    expect(screen.getByText('Races: Speed +3, descents 2% faster, but technical descents 30% harder.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Backpack' }))
    expect(screen.getByText('Races: Endurance +2, 15% less wear over distance.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Poles' }))
    // The price is next to the name, with the coin symbol.
    expect(screen.getByText('Poles · Lvl 2').parentElement).toHaveTextContent('Poles · Lvl 2 50 coins')
    expect(screen.getByText('Poles · Lvl 2').parentElement!.querySelector('svg')).toBeInTheDocument()
    // Not enough for the backpack lvl 2 (90): the button is inactive and says why.
    await user.click(screen.getByRole('button', { name: 'Backpack' }))
    const pack = screen.getByRole('button', { name: 'Buy hydration backpack · lvl 2' })
    expect(pack).toHaveAttribute('aria-disabled', 'true')
    expect(pack).toHaveAccessibleDescription('You need 30 coins more.')

    await user.click(screen.getByRole('button', { name: 'Poles' }))
    await user.click(screen.getByRole('button', { name: 'Buy poles · lvl 2' }))
    expect(screen.getByText('Balance 60 coins → 10 coins.')).toBeInTheDocument()
    expect(readSave()!.state.coins).toBe(60)
    await user.dblClick(screen.getByRole('button', { name: 'Pay 50 coins' }))
    expect(readSave()!.state).toMatchObject({ coins: 10, ownedEquipment: ['starter-shoes', 'poles-2'], equipment: [] })
    expect(screen.getByText('Poles · Lvl 2 bought for 50 coins.')).toBeInTheDocument()

    // Bought items leave the shop; they are put on in Equipped.
    expect(screen.queryByRole('button', { name: 'Buy poles · lvl 2' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Equipped' }))
    await user.click(screen.getByRole('button', { name: 'Change poles' }))
    await user.click(screen.getByRole('button', { name: 'Equip poles · lvl 2' }))
    expect(readSave()!.state.equipment).toEqual(['poles-2'])
  })

})
