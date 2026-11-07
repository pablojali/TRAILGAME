import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { newGame } from '../../test/gameFixtures'
import { readSave, renderApp, seedCareer, settled } from '../../test/renderApp'

function layers(name: RegExp) {
  return [...screen.getByRole('img', { name }).querySelectorAll('svg image')].map((i) => i.getAttribute('data-layer'))
}

describe('Equipment', () => {
  it('shows the runner on the left and one box per slot on the right, gels and cereal bars included', async () => {
    seedCareer({ ...newGame(), ownedEquipment: ['starter-shoes', 'poles-2'], equipment: ['poles-2'], consumables: { gel: 2, bar: 0 } })
    await renderApp('/equipment')
    expect(screen.getByRole('heading', { level: 1, name: 'Equipment' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Equipped' })).toHaveAttribute('aria-selected', 'true')
    expect(layers(/with the equipment worn/)).toEqual(['body'])
    const boxes = within(screen.getByRole('list', { name: 'Equipped items' })).getAllByRole('button')
    // Owner's order: gels and bars (one box), shoes, backpack, poles.
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual([
      // Gels and cereal bars are counted, not worn.
      'Gels & bars: 2 gels, 0 bars in stock. Show gels and bars cards',
      'Shoes: empty. Show shoes cards',
      'Backpack: empty. Show backpack cards',
      'Poles: Poles · Lvl 2. Show poles cards',
    ])
    // Only the slot name, with the level or the stock in the corner (owner request, 4 November 2026).
    expect(boxes[0]).toHaveTextContent('Gels & bars×2 / ×0')
    expect(boxes[3]).toHaveTextContent(/^PolesLvl 2$/)
    expect(screen.queryByText(/Race attributes/)).not.toBeInTheDocument()
    // The balance is in the top bar, not on the screen (owner request, 3 November 2026).
    expect(screen.queryByText('Balance')).not.toBeInTheDocument()
  })

  it('opens the cards of a slot, then a card, and equips and takes it off, saving each change', async () => {
    const user = userEvent.setup()
    seedCareer()
    const view = await renderApp('/equipment')
    expect(layers(/with the equipment worn/)).toEqual(['body'])

    await user.click(screen.getByRole('button', { name: /^Shoes: empty/ }))
    expect(screen.getByRole('heading', { level: 2, name: 'Shoes' })).toHaveFocus()
    const cards = within(screen.getByRole('region', { name: 'Shoes cards' })).getAllByRole('button')
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual([
      'Starter shoes, free, Owned',
      'Trail shoes · Lvl 1, 35 coins, Need 10 coins more',
      'Technical trail shoes · Lvl 2, 70 coins, Need 45 coins more',
      'Light trail shoes · Lvl 2, 70 coins, Need 45 coins more',
    ])
    await user.click(cards[0]!)
    expect(screen.getByRole('heading', { level: 2, name: 'Starter shoes' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Equip starter shoes' }))
    await settled()
    expect(screen.getByText('Starter shoes equipped.')).toHaveAttribute('role', 'status')
    expect(readSave()!.state.equipment).toEqual(['starter-shoes'])
    await user.click(screen.getByRole('button', { name: 'Take off starter shoes' }))
    await settled()
    expect(readSave()!.state.equipment).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Equip starter shoes' }))
    await settled()

    // Back to the slot's cards, then to the runner, wearing the shoes.
    await user.click(screen.getByRole('button', { name: '← Shoes' }))
    expect(within(screen.getByRole('region', { name: 'Shoes cards' })).getByRole('button', { name: 'Starter shoes, free, Equipped' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '← Equipped' }))
    expect(layers(/with the equipment worn/)).toEqual(['body', 'starter-shoes'])
    expect(screen.getByRole('button', { name: 'Shoes: Starter shoes. Show shoes cards' })).toBeInTheDocument()
    view.unmount()

    await renderApp('/')
    expect(screen.getByRole('img', { name: /wearing starter shoes/ })).toBeInTheDocument()
  })

  it('shows the shop as cards, opens a large card and buys in one tap, then equips', async () => {
    const user = userEvent.setup()
    seedCareer({ ...newGame(), coins: 60 })
    await renderApp('/equipment')
    expect(within(screen.getAllByRole('banner')[0]!).getByText('60').parentElement).toHaveTextContent('60 coins')
    await user.click(screen.getByRole('tab', { name: 'Shop' }))
    await user.click(screen.getByRole('button', { name: 'Poles' }))
    expect(screen.getByRole('button', { name: 'Poles' })).toHaveAttribute('aria-pressed', 'true')
    const grid = () => screen.getByRole('region', { name: 'Shop items' })
    expect(within(grid()).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Poles · Lvl 1, 25 coins, Buy',
      'Poles · Lvl 2, 50 coins, Buy',
    ])
    // Every item is in the grid under All, gels and cereal bars included, without invented values.
    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(within(grid()).getAllByRole('button')).toHaveLength(11)
    // Shop order: shoes, backpack, poles, then gels and bars last (owner request, 4 November 2026).
    expect(within(grid()).getAllByRole('button')[0]).toHaveAccessibleName(/^Starter shoes/)
    expect(within(grid()).getAllByRole('button')[10]).toHaveAccessibleName(/^Gels & bars/)
    // Gels and bars filter: every gel, bar and gels-and-bars pack.
    await user.click(screen.getByRole('button', { name: 'Gels & bars' }))
    expect(within(grid()).getAllByRole('button').map((b) => b.getAttribute('aria-label')?.split(',')[0])).toEqual([
      'Energy gel',
      'Cereal bar',
      'Gels & bars',
    ])
    await user.click(screen.getByRole('button', { name: 'All' }))
    // One pack of gels and bars together (owner decision, 3 November 2026).
    expect(within(grid()).getByRole('button', { name: 'Gels & bars, 10 coins, 0 gels, 0 bars in stock, Buy pack of 3' })).toBeInTheDocument()
    expect(within(grid()).getByRole('button', { name: 'Energy gel, 10 coins, 0 in stock, Buy pack of 3' })).toBeInTheDocument()
    expect(within(grid()).getByRole('button', { name: 'Hydration backpack · Lvl 2, 90 coins, Need 30 coins more' })).toBeInTheDocument()

    // Cereal bars: a pack of 3 for 10 coins, bought in one tap (owner request, 7 November 2026), never equipped.
    await user.click(within(grid()).getByRole('button', { name: /^Cereal bar,/ }))
    expect(screen.getByRole('heading', { level: 2, name: 'Cereal bar' })).toHaveFocus()
    expect(screen.getByText('Pack').nextElementSibling).toHaveTextContent('3 units')
    expect(screen.getByText('In stock').nextElementSibling).toHaveTextContent('0')
    expect(screen.getByText('Race effect').nextElementSibling).toHaveTextContent('1.5% less fatigue for the whole race.')
    // A double tap still buys once.
    await user.dblClick(screen.getByRole('button', { name: 'Buy pack of 3 cereal bar' }))
    await settled()
    expect(readSave()!.state).toMatchObject({ coins: 50, consumables: { gel: 0, bar: 3 }, ownedEquipment: ['starter-shoes'] })
    expect(screen.getByText('Cereal bar pack of 3 bought for 10 coins.')).toBeInTheDocument()
    expect(screen.getByText('In stock').nextElementSibling).toHaveTextContent('3')
    expect(screen.queryByRole('button', { name: /^Equip/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '← Back to shop' }))
    await user.click(screen.getByRole('button', { name: 'Poles' }))

    // Poles lvl 2: large card with its details, then Buy charges at once.
    await user.click(within(grid()).getByRole('button', { name: /^Poles · Lvl 2/ }))
    expect(screen.getByRole('heading', { level: 2, name: 'Poles' })).toBeInTheDocument()
    expect(screen.getByText('Level').nextElementSibling).toHaveTextContent('2')
    expect(screen.getByText('Race effect').nextElementSibling).toHaveTextContent('Climbing +3, Endurance +1, but flats 1% slower.')
    expect(readSave()!.state.coins).toBe(50)
    await user.click(screen.getByRole('button', { name: 'Buy poles · lvl 2' }))
    await settled()
    expect(readSave()!.state).toMatchObject({ coins: 0, ownedEquipment: ['starter-shoes', 'poles-2'], equipment: [] })
    expect(screen.getByText('Poles · Lvl 2 bought for 50 coins.')).toBeInTheDocument()

    // Owned: the large card now offers Equip.
    await user.click(screen.getByRole('button', { name: 'Equip poles · lvl 2' }))
    await settled()
    expect(readSave()!.state.equipment).toEqual(['poles-2'])
    await user.click(screen.getByRole('button', { name: '← Back to shop' }))
    expect(within(grid()).getByRole('button', { name: 'Poles · Lvl 2, 50 coins, Equipped' })).toBeInTheDocument()
  })

  it('cannot start buying an item the balance does not cover', async () => {
    const user = userEvent.setup()
    seedCareer({ ...newGame(), coins: 60 })
    await renderApp('/equipment?tab=shop&item=hydration-backpack-2')
    const buy = screen.getByRole('button', { name: 'Buy hydration backpack · lvl 2' })
    expect(buy).toHaveAttribute('aria-disabled', 'true')
    expect(buy).toHaveAccessibleDescription('You need 30 coins more.')
    await user.click(buy)
    expect(readSave()?.state.coins ?? 60).toBe(60)
  })
})
