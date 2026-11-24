import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Workspace } from './model'

vi.mock('./github', () => ({
  listFolder: async (_token: string, path: string) =>
    path === 'assets/runner/heads'
      ? ['lvl1_men_head_01_tone1.png', 'lvl1_men_head_01_tone2.png', 'lvl1_men_head_01_tone1_blink.png', 'lvl2_women_head_01_tone1.png'].map((name) => ({
          name,
          path: `${path}/${name}`,
          url: `https://example.test/${name}`,
        }))
      : [],
}))

const { AvatarsPanel } = await import('./AvatarsPanel')

function Harness({ onWs }: { onWs(ws: Workspace): void }) {
  const [ws, setWs] = useState({ uploads: {} } as unknown as Workspace)
  return (
    <AvatarsPanel
      token="t"
      ws={ws}
      setWs={(next) => {
        setWs(next)
        onWs(next)
      }}
    />
  )
}

describe('Trail Studio · Avatares: deleting a head', () => {
  it('marks every file of a head for deletion, and undoes it', async () => {
    const user = userEvent.setup()
    let ws: Workspace | null = null
    render(<Harness onWs={(next) => (ws = next)} />)
    const heads = await screen.findByText('En el juego (2 caras)')
    const list = heads.parentElement!.querySelector('ul.heads') as HTMLElement
    const card = within(list).getByText(/Hombre · nivel 1 · cara 01 \(2 tonos\)/).closest('li')!
    await user.click(within(card).getByRole('button', { name: 'Borrar' }))
    expect(Object.keys(ws!.uploads).sort()).toEqual([
      'assets/runner/heads/lvl1_men_head_01_tone1.png',
      'assets/runner/heads/lvl1_men_head_01_tone1_blink.png',
      'assets/runner/heads/lvl1_men_head_01_tone2.png',
    ])
    expect(Object.values(ws!.uploads).every((upload) => upload.base64 === null)).toBe(true)
    await user.click(within(card).getByRole('button', { name: 'Deshacer' }))
    expect(ws!.uploads).toEqual({})
  })
})
