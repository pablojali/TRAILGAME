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

describe('Trail Studio · Avatares: deleting head art', () => {
  it('shows every head file, and deletes one tone with its closed eyes, then undoes it', async () => {
    const user = userEvent.setup()
    let ws: Workspace | null = null
    render(<Harness onWs={(next) => (ws = next)} />)
    const title = await screen.findByText('En el juego (4 imágenes, 2 caras)')
    const list = title.parentElement!.querySelector('ul.heads') as HTMLElement
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    const card = within(list).getByText('lvl1_men_head_01_tone1.png').closest('li')!
    expect(within(card).getByText('Hombre · nivel 1 · cara 01 · tono 1')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Borrar' }))
    expect(Object.keys(ws!.uploads).sort()).toEqual(['assets/runner/heads/lvl1_men_head_01_tone1.png', 'assets/runner/heads/lvl1_men_head_01_tone1_blink.png'])
    expect(Object.values(ws!.uploads).every((upload) => upload.base64 === null)).toBe(true)
    await user.click(within(card).getByRole('button', { name: 'Deshacer' }))
    expect(ws!.uploads).toEqual({})
  })
})
