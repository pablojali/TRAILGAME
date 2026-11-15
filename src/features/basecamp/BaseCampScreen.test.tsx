import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp, seedCareer } from '../../test/renderApp'

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
})
