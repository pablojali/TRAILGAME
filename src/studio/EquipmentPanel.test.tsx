import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { parseDoc, rows } from './csvDoc'
import type { Workspace } from './model'

vi.mock('./media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./media')>()),
  imageSize: async () => ({ width: 1024, height: 1536 }),
  fileBase64: async () => 'AAAA',
}))

const { EquipmentPanel } = await import('./EquipmentPanel')

const CSV = `id,name,type,level,price,pack,thumbnail,avatar_layer,life_km
starter-shoes,Starter shoes,shoes,,20,,,footwear/starter-shoes.webp,150
new-shoes,Fast shoes,shoes,3,90,,,,200
`

function Harness({ onWs, initial }: { onWs(ws: Workspace): void; initial: string }) {
  const doc = parseDoc(CSV)
  const [ws, setWs] = useState({ uploads: {}, docs: { equipment: doc }, docsBase: { equipment: doc } } as unknown as Workspace)
  const [selected, setSelected] = useState<string | null>(initial)
  return (
    <EquipmentPanel
      ws={ws}
      setWs={(next) => {
        setWs(next)
        onWs(next)
      }}
      selected={selected}
      select={setSelected}
    />
  )
}

describe('Trail Studio · Equipment (27 November 2026)', () => {
  it('uploads the picture of new shoes on the runner, like any other item', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    const user = userEvent.setup()
    let ws: Workspace | null = null
    render(<Harness initial="new-shoes" onWs={(next) => (ws = next)} />)
    await user.upload(screen.getAllByLabelText('Upload picture').at(-1)!, new File(['x'], 'zapas.png', { type: 'image/png' }))
    expect(ws!.uploads['assets/runner/accesories/lvl3_shoes_new-shoes.png']?.base64).toBe('AAAA')
    expect(rows(ws!.docs.equipment).find((r) => r.values.id === 'new-shoes')!.values.avatar_layer).toBe('accessories/lvl3_shoes_new-shoes.webp')
  })

  it('deletes an item, but never the starting kit', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    let ws: Workspace | null = null
    const view = render(<Harness initial="new-shoes" onWs={(next) => (ws = next)} />)
    const pane = screen.getByRole('region', { name: 'Edit Fast shoes' })
    await user.click(within(pane).getByRole('button', { name: 'Delete item' }))
    expect(rows(ws!.docs.equipment).map((r) => r.values.id)).toEqual(['starter-shoes'])
    view.unmount()
    render(<Harness initial="starter-shoes" onWs={() => undefined} />)
    expect(screen.queryByRole('button', { name: 'Delete item' })).not.toBeInTheDocument()
    expect(screen.getByText("Starting kit: can't be deleted")).toBeInTheDocument()
  })
})
