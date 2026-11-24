import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RaceDemoScreen } from './RaceDemoScreen'

describe('RaceDemoScreen', () => {
  beforeEach(() => {
    // The test browser has no canvas drawing: the view simply does not start.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  })

  it('shows the view and a debug panel that adds and removes rivals', async () => {
    const user = userEvent.setup()
    render(<RaceDemoScreen />)
    expect(screen.getByRole('img', { name: 'Race seen from behind the runner' })).toBeInTheDocument()
    expect(screen.getByText('4 rivals')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '+ rival' }))
    expect(screen.getByText('5 rivals')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '− rival' }))
    await user.click(screen.getByRole('button', { name: '− rival' }))
    expect(screen.getByText('3 rivals')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hide' }))
    expect(screen.queryByRole('button', { name: '+ rival' })).not.toBeInTheDocument()
  })
})
