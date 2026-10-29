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
})
