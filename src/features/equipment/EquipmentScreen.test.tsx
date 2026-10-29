import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { newGame } from '../../test/gameFixtures'
import { readSave, renderApp, seedCareer } from '../../test/renderApp'

function layers(name: RegExp) {
  return [...screen.getByRole('img', { name }).querySelectorAll('svg > image')].map((i) => i.getAttribute('data-layer'))
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
    seedCareer({ ...newGame(), coins: 120 })
    renderApp('/equipment')
    expect(screen.getByText('120 coins')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Shop' })).toBeInTheDocument()
    // Not enough for the trail shoes (200): the button is inactive and says why.
    const shoes = screen.getByRole('button', { name: 'Buy trail shoes' })
    expect(shoes).toHaveAttribute('aria-disabled', 'true')
    expect(shoes).toHaveAccessibleDescription('You need 80 coins more.')

    await user.click(screen.getByRole('button', { name: 'Buy poles' }))
    expect(screen.getByText('Balance 120 coins → 20 coins.')).toBeInTheDocument()
    expect(readSave()!.state.coins).toBe(120)
    await user.dblClick(screen.getByRole('button', { name: 'Pay 100 coins' }))
    expect(readSave()!.state).toMatchObject({ coins: 20, ownedEquipment: ['starter-shoes', 'poles'], equipment: [] })
    expect(screen.getByText('Poles bought for 100 coins.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Equip poles' }))
    expect(readSave()!.state.equipment).toEqual(['poles'])
  })
})
