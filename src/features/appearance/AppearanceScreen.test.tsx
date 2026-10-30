import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { newGame, withAthlete } from '../../test/gameFixtures'
import { readSave, renderApp, seedCareer } from '../../test/renderApp'

describe('Appearance', () => {
  it('is reached from Equipment', async () => {
    const user = userEvent.setup()
    seedCareer()
    await renderApp('/equipment')
    await user.click(screen.getByRole('link', { name: 'Change look' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Appearance' })).toBeInTheDocument()
  })

  it('saves each change and shows locked colours with their level', async () => {
    const user = userEvent.setup()
    // Level 3 (250 XP): red and orange are unlocked, yellow (Level 4) is not.
    seedCareer(withAthlete(newGame(), { xp: 250 }))
    await renderApp('/appearance')
    await user.click(screen.getByRole('tab', { name: 'Clothing' }))

    expect(screen.getByRole('radio', { name: 'Orange T-shirt' })).toBeEnabled()
    expect(screen.getByRole('radio', { name: 'Yellow T-shirt, unlocks at Level 4' })).toBeDisabled()
    expect(screen.getByText('Lvl 13')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Orange T-shirt' }))
    expect(readSave()?.state.athlete.appearance.outfit).toBe('tshirt-orange')
    expect(screen.getByRole('img', { name: /orange t-shirt/ })).toHaveAttribute('data-outfit', 'tshirt-orange')

    await user.click(screen.getByRole('tab', { name: 'Skin' }))
    await user.click(screen.getByRole('radio', { name: 'Skin tone 3' }))
    expect(readSave()?.state.athlete.appearance).toEqual({ hair: 'natural', skin: 'tone-3', outfit: 'tshirt-orange' })
  })

  it('offers the hairstyles of the runner and saves the chosen one', async () => {
    const user = userEvent.setup()
    seedCareer() // Women, tone 2, Level 1.
    await renderApp('/appearance')
    await user.click(screen.getByRole('tab', { name: 'Hair' }))
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual(['natural', 'head-l1-01'])
    await user.click(screen.getByRole('radio', { name: 'Hairstyle 1' }))
    await waitFor(() => expect(readSave()?.state.athlete.appearance.hair).toBe('head-l1-01'))
    expect(screen.getByRole('img', { name: /hairstyle 1/ }).querySelector('image[data-layer="head"]')).not.toBeNull()
  })

  it('zooms in on the face while choosing a hairstyle', async () => {
    const user = userEvent.setup()
    seedCareer()
    await renderApp('/appearance')
    const preview = () => screen.getByRole('img', { name: /avatar preview/i })
    expect(preview()).not.toHaveAttribute('data-focus')
    await user.click(screen.getByRole('tab', { name: 'Hair' }))
    expect(preview()).toHaveAttribute('data-focus', 'face')
    await user.click(screen.getByRole('tab', { name: 'Clothing' }))
    expect(preview()).not.toHaveAttribute('data-focus')
  })
})
