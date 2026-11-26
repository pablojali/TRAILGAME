import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Workspace } from './model'

vi.mock('./github', () => ({
  listFolder: async (_token: string, path: string) =>
    path === 'assets/runner/Clothing'
      ? ['lvl1_men_shirt_01.png', 'lvl2_women_shirt_01.png'].map((name) => ({ name, path: `${path}/${name}`, url: `https://example.test/${name}` }))
      : path === 'assets/runner/incoming/bodies'
      ? ['men_body_tone3_f2.png'].map((name) => ({ name, path: `${path}/${name}`, url: `https://example.test/${name}` }))
      : path === 'assets/race/back-view/runner/footwear'
      ? ['lvl1_men_shoes_f1.webp'].map((name) => ({ name, path: `${path}/${name}`, url: `https://example.test/${name}` }))
      : path === 'assets/runner/heads'
      ? ['lvl1_men_head_01_tone1.png', 'lvl1_men_head_01_tone2.png', 'lvl1_men_head_01_tone1_blink.png', 'lvl2_women_head_01_tone1.png'].map((name) => ({
          name,
          path: `${path}/${name}`,
          url: `https://example.test/${name}`,
        }))
      : [],
}))

vi.mock('./media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./media')>()),
  imageSize: async () => ({ width: 1024, height: 1536 }),
  fileBase64: async () => 'AAAA',
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

describe('Trail Studio · Avatares: deleting a shirt', () => {
  it('marks one shirt for deletion and undoes it', async () => {
    const user = userEvent.setup()
    let ws: Workspace | null = null
    render(<Harness onWs={(next) => (ws = next)} />)
    const card = (await screen.findByText('lvl2_women_shirt_01.png')).closest('li')!
    await user.click(within(card).getByRole('button', { name: 'Borrar' }))
    expect(ws!.uploads).toEqual({ 'assets/runner/Clothing/lvl2_women_shirt_01.png': { base64: null, label: 'Shirt lvl2_women_shirt_01.png (removed)' } })
    await user.click(within(card).getByRole('button', { name: 'Deshacer' }))
    expect(ws!.uploads).toEqual({})
  })
})

describe('Trail Studio · Avatares: art seen from behind', () => {
  it('sends a head named …_back straight to the race engine, not to Claude', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    const user = userEvent.setup()
    let ws: Workspace | null = null
    render(<Harness onWs={(next) => (ws = next)} />)
    const heads = await screen.findByRole('region', { name: 'Heads' })
    await user.upload(within(heads).getByLabelText(/Subir heads/i), [
      new File(['x'], 'lvl1_men_head_tone2_back.png', { type: 'image/png' }),
      new File(['x'], 'lvl1_men_head_02_tone1.png', { type: 'image/png' }),
    ])
    expect(Object.keys(ws!.uploads).sort()).toEqual([
      'assets/race/back-view/runner/heads/lvl1_men_head_tone2.png',
      'assets/runner/incoming/heads/lvl1_men_head_02_tone1.png',
    ])
  })
})

describe('Trail Studio · Avatares: bodies', () => {
  it('deletes a file waiting for Claude, and sends body frames seen from behind straight to the engine', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    const user = userEvent.setup()
    let ws: Workspace | null = null
    render(<Harness onWs={(next) => (ws = next)} />)
    const bodies = await screen.findByRole('region', { name: 'Bodies' })
    const waiting = (await within(bodies).findByText('men_body_tone3_f2.png')).closest('li')!
    await user.click(within(waiting).getByRole('button', { name: 'Borrar' }))
    expect(ws!.uploads['assets/runner/incoming/bodies/men_body_tone3_f2.png']?.base64).toBeNull()
    await user.upload(within(bodies).getByLabelText(/Subir bodies/i), new File(['x'], 'women_body_tone1_f1.png', { type: 'image/png' }))
    expect(ws!.uploads['assets/race/back-view/runner/bodies/women_body_tone1_f1.png']?.base64).toBe('AAAA')
  })
})

describe('Trail Studio · Avatares: shoes seen from behind', () => {
  it('sends shoe frames to the engine (replacing a .webp of the same name), refuses other names, and lists the engine\'s shoes', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    const user = userEvent.setup({ applyAccept: false })
    let ws: Workspace | null = null
    render(<Harness onWs={(next) => (ws = next)} />)
    const shoes = await screen.findByRole('region', { name: 'Shoes seen from behind' })
    expect(await within(shoes).findByText('lvl1_men_shoes_f1.webp')).toBeInTheDocument()
    await user.upload(within(shoes).getByLabelText('Subir zapatillas'), [
      new File(['x'], 'lvl1_men_shoes_back_f1.png', { type: 'image/png' }),
      new File(['x'], 'zapas.png', { type: 'image/png' }),
    ])
    expect(screen.getByRole('alert')).toHaveTextContent('zapas.png')
    expect(ws!.uploads['assets/race/back-view/runner/footwear/lvl1_men_shoes_f1.png']?.base64).toBe('AAAA')
    expect(ws!.uploads['assets/race/back-view/runner/footwear/lvl1_men_shoes_f1.webp']?.base64).toBeNull()
    expect(Object.keys(ws!.uploads).some((path) => path.includes('incoming'))).toBe(false)
  })
})
