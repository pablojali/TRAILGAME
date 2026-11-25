import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Workspace } from './model'

vi.mock('./github', () => ({
  listFolder: async (_token: string, path: string) =>
    path.endsWith('/runner/bodies')
      ? ['men_body_01_tone2_f1.webp'].map((name) => ({ name, path: `${path}/${name}`, url: `https://example.test/${name}` }))
      : [],
}))
vi.mock('./media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./media')>()),
  imageSize: async () => ({ width: 1024, height: 1536 }),
  fileBase64: async () => 'AAAA',
}))

const { MotorPanel } = await import('./MotorPanel')

function Harness({ onWs }: { onWs(ws: Workspace): void }) {
  const [ws, setWs] = useState({ uploads: {} } as unknown as Workspace)
  return (
    <MotorPanel
      token="t"
      ws={ws}
      setWs={(next) => {
        setWs(next)
        onWs(next)
      }}
    />
  )
}

const png = (name: string) => new File(['x'], name, { type: 'image/png' })

describe('Trail Studio · Races › Motor', () => {
  it('uploads runner frames straight to the engine (replacing the .webp of the same name) and refuses a wrong name', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn()
    const user = userEvent.setup({ applyAccept: false })
    let ws: Workspace | null = null
    render(<Harness onWs={(next) => (ws = next)} />)
    expect(await screen.findByText('men_body_01_tone2_f1.webp')).toBeInTheDocument()
    const runners = screen.getByRole('region', { name: 'Corredores' })
    await user.upload(within(runners).getByLabelText('Subir fotogramas'), [png('men_body_01_tone2_f1.png'), png('cuerpo.png')])
    expect(screen.getByRole('alert')).toHaveTextContent('cuerpo.png')
    expect(ws!.uploads['assets/race/back-view/runner/bodies/men_body_01_tone2_f1.png']?.base64).toBe('AAAA')
    expect(ws!.uploads['assets/race/back-view/runner/bodies/men_body_01_tone2_f1.webp']?.base64).toBeNull()
  })

  it('puts a backdrop in its slot', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    const user = userEvent.setup()
    let ws: Workspace | null = null
    render(<Harness onWs={(next) => (ws = next)} />)
    await user.upload(screen.getByLabelText('Subir Montañas'), png('mis_montanas.png'))
    expect(Object.keys(ws!.uploads)).toEqual(['assets/race/back-view/scene/mountains.png'])
  })
})
