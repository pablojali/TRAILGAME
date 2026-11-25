import { useState } from 'react'
import type { RepoFile } from './github'
import { BODY_FRAME, DECOR_SLOTS, ENGINE_ROOT, replacing, SCENE_SLOTS } from './engineArt'
import type { Workspace } from './model'
import { asUpload, layerPicture, withUploads } from './uploads'
import { useFolder } from './useFolder'

/**
 * Races › Motor (owner request, 25 November 2026): the art of the race seen from behind. Runner
 * frames, backdrops and scenery go straight to the engine's folder with the next proposal; once it
 * is published, the test screen (/race-demo) uses them. Later each race will choose its own.
 */
export function MotorPanel({ token, ws, setWs }: { token: string; ws: Workspace; setWs(ws: Workspace): void }) {
  const [error, setError] = useState('')
  const bodies = useFolder(token, `${ENGINE_ROOT}/runner/bodies`)
  const scene = useFolder(token, `${ENGINE_ROOT}/scene`)
  const decor = useFolder(token, `${ENGINE_ROOT}/decor`)

  async function addFrames(files: FileList) {
    setError('')
    let changes: Record<string, ReturnType<typeof replacing>[string]> = {}
    for (const file of Array.from(files)) {
      if (!BODY_FRAME.test(file.name)) {
        setError(`${file.name}: el nombre tiene que ser como men_body_01_tone2_f1.png (men o women, tono 1–4, fotograma f1, f2…).`)
        continue
      }
      const path = `${ENGINE_ROOT}/runner/bodies/${file.name}`
      try {
        changes = { ...changes, ...replacing(path, bodies), [path]: await layerPicture(path, file, `Race engine: runner frame ${file.name}`) }
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`)
      }
    }
    if (Object.keys(changes).length) setWs(withUploads(ws, changes))
  }

  async function addSlot(folder: string, existing: RepoFile[] | null, id: string, label: string, file: File) {
    setError('')
    if (file.type !== 'image/png') return setError(`${file.name}: solo PNG.`)
    const path = `${ENGINE_ROOT}/${folder}/${id}.png`
    setWs(withUploads(ws, { ...replacing(path, existing), [path]: await asUpload(file, `Race engine: ${label}`) }))
  }

  const pendingFrames = Object.entries(ws.uploads).filter(([path, upload]) => path.startsWith(`${ENGINE_ROOT}/runner/bodies/`) && upload.base64 !== null)

  return (
    <div className="avatars">
      <section className="editPane">
        <h2>Motor de carrera</h2>
        <p className="hint">
          El arte de la carrera vista de espaldas. Va directo a <code>{ENGINE_ROOT}</code> con la próxima propuesta y, al publicarla, la pantalla de prueba{' '}
          <code>/race-demo</code> lo usa. Más adelante cada carrera elegirá el suyo.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="editPane" aria-label="Corredores">
        <div className="majorsBar">
          <h3>Corredores (fotogramas)</h3>
          <label className="primary upload">
            Subir fotogramas
            <input
              type="file"
              accept="image/png"
              multiple
              onChange={(e) => {
                if (e.target.files?.length) void addFrames(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
        </div>
        <p className="hint">
          Cuerpo calvo, sin remera y con pantalón, de espaldas, en el lienzo de 1024 × 1536. Un PNG por fotograma, con nombre <code>men_body_01_tone2_f1.png</code> (men o
          women, tono 1–4, f1, f2, f3…). Las cabezas y la ropa de espaldas se suben en Multimedia › Avatares, con <code>_back</code> en el nombre.
        </p>
        {pendingFrames.length > 0 && (
          <>
            <h4>Sin publicar ({pendingFrames.length})</h4>
            <ul className="artGrid small">
              {pendingFrames.map(([path, upload]) => (
                <li key={path}>
                  {upload.previewUrl && <img src={upload.previewUrl} alt="" />}
                  <span>{path.slice(path.lastIndexOf('/') + 1)}</span>
                  <button
                    type="button"
                    className="link"
                    onClick={() => setWs(withUploads(ws, { [path]: undefined, ...Object.fromEntries(Object.keys(replacing(path, bodies)).map((other) => [other, undefined])) }))}
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <FileList title="En el juego" files={bodies} ws={ws} setWs={setWs} />
      </section>

      <SlotSection
        title="Fondos"
        hint="Capas del paisaje, de atrás hacia delante. PNG; el bosque lejano con fondo transparente."
        folder="scene"
        slots={SCENE_SLOTS}
        files={scene}
        ws={ws}
        setWs={setWs}
        onFile={(id, label, file) => void addSlot('scene', scene, id, label, file)}
      />
      <SlotSection
        title="Decorado del camino"
        hint="Piezas que crecen hacia los lados al acercarse. PNG con fondo transparente, la pieza apoyada en el centro de abajo de la imagen."
        folder="decor"
        slots={DECOR_SLOTS}
        files={decor}
        ws={ws}
        setWs={setWs}
        onFile={(id, label, file) => void addSlot('decor', decor, id, label, file)}
      />
    </div>
  )
}

/** The files of an engine folder on main, each with Borrar / Deshacer. */
export function FileList({ title, files, ws, setWs }: { title: string; files: RepoFile[] | null; ws: Workspace; setWs(ws: Workspace): void }) {
  const gone = (file: RepoFile) => ws.uploads[file.path]?.base64 === null
  return (
    <>
      <h4>
        {title} ({files?.length ?? '…'})
      </h4>
      <ul className="artGrid small">
        {(files ?? []).map((file) => (
          <li key={file.path} className={gone(file) ? 'removed' : undefined}>
            <img src={file.url} alt="" loading="lazy" />
            <span>{file.name}</span>
            <button
              type="button"
              className="link"
              onClick={() => setWs(withUploads(ws, { [file.path]: gone(file) ? undefined : { base64: null, label: `Race engine: ${file.name} (removed)` } }))}
            >
              {gone(file) ? 'Deshacer' : 'Borrar'}
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Fixed places for pictures (sky, mountains…): each shows its picture and takes a new one. */
function SlotSection({
  title,
  hint,
  folder,
  slots,
  files,
  ws,
  setWs,
  onFile,
}: {
  title: string
  hint: string
  folder: string
  slots: readonly { id: string; label: string }[]
  files: RepoFile[] | null
  ws: Workspace
  setWs(ws: Workspace): void
  onFile(id: string, label: string, file: File): void
}) {
  return (
    <section className="editPane" aria-label={title}>
      <h3>{title}</h3>
      <p className="hint">{hint}</p>
      <ul className="artGrid small">
        {slots.map((slot) => {
          const path = `${ENGINE_ROOT}/${folder}/${slot.id}.png`
          const pending = ws.uploads[path]
          const current = (files ?? []).find((file) => file.name.replace(/\.(png|webp)$/, '') === slot.id)
          const removed = current ? ws.uploads[current.path]?.base64 === null && !pending : false
          const shown = pending?.previewUrl ?? (current && !removed ? current.url : undefined)
          return (
            <li key={slot.id} className={removed ? 'removed' : undefined}>
              {shown ? <img src={shown} alt="" loading="lazy" /> : <span className="muted">Sin imagen</span>}
              <strong>{slot.label}</strong>
              <span>{pending ? 'Nueva, sin publicar' : current ? current.name : 'Dibujo provisional'}</span>
              <label className="link upload">
                {current || pending ? 'Cambiar' : 'Subir'}
                <input
                  type="file"
                  accept="image/png"
                  aria-label={`Subir ${slot.label}`}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) onFile(slot.id, slot.label, file)
                    e.target.value = ''
                  }}
                />
              </label>
              {pending ? (
                <button type="button" className="link" onClick={() => setWs(withUploads(ws, { [path]: undefined, ...(current ? { [current.path]: undefined } : {}) }))}>
                  Quitar
                </button>
              ) : (
                current && (
                  <button
                    type="button"
                    className="link"
                    onClick={() => setWs(withUploads(ws, { [current.path]: removed ? undefined : { base64: null, label: `Race engine: ${current.name} (removed)` } }))}
                  >
                    {removed ? 'Deshacer' : 'Borrar'}
                  </button>
                )
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
