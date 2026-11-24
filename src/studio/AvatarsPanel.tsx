import { useEffect, useState } from 'react'
import { listFolder, type RepoFile } from './github'
import { megabytes } from './media'
import type { Workspace } from './model'
import { asUpload, folders, withUploads } from './uploads'
import { AVATAR_KINDS, headGroups, INCOMING, incomingName, MAX_BYTES, type HeadGroup } from './avatarFiles'

function useFolder(token: string, path: string): RepoFile[] | null {
  const [files, setFiles] = useState<{ path: string; files: RepoFile[] } | null>(null)
  useEffect(() => {
    let live = true
    if (!folders().has(path)) folders().set(path, listFolder(token, path).catch(() => []))
    void folders().get(path)!.then((list) => live && setFiles({ path, files: list }))
    return () => {
      live = false
    }
  }, [token, path])
  return files?.path === path ? files.files : null
}

/**
 * Avatar art (owner request, 13 November 2026): the owner uploads new bodies and heads here, as
 * PNG, in batches; they go to `assets/runner/incoming/` with the next proposal. Claude then names
 * them, prepares them for the game and adds them to the catalogs. What the game uses today is shown
 * below each upload area, for reference.
 */
export function AvatarsPanel({ token, ws, setWs }: { token: string; ws: Workspace; setWs(ws: Workspace): void }) {
  const [error, setError] = useState('')

  async function add(kind: (typeof AVATAR_KINDS)[number], files: FileList) {
    setError('')
    const changes: Record<string, Awaited<ReturnType<typeof asUpload>>> = {}
    for (const file of Array.from(files)) {
      if (file.type !== 'image/png') {
        setError(`${file.name}: PNG only (with a transparent background).`)
        continue
      }
      if (file.size > MAX_BYTES) {
        setError(`${file.name}: ${megabytes(file.size)} is too big (at most ${megabytes(MAX_BYTES)}).`)
        continue
      }
      const path = `${INCOMING}/${kind.id}/${incomingName(file.name)}`
      changes[path] = await asUpload(file, `New ${kind.title.slice(0, -1).toLowerCase()}: ${file.name}`)
    }
    if (Object.keys(changes).length) setWs(withUploads(ws, changes))
  }

  return (
    <div className="avatars">
      <section className="editPane">
        <h2>Avatars</h2>
        <p className="hint">
          Sube cuerpos y caras nuevos en PNG con fondo transparente, varios a la vez si quieres. Quedan en la propuesta (pestaña Propuestas) y, al
          publicarla, en <code>{INCOMING}</code>. Avisa a Claude: los nombra, los prepara para el juego y los añade al catálogo.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
      {AVATAR_KINDS.map((kind) => (
        <KindSection key={kind.id} token={token} ws={ws} setWs={setWs} kind={kind} onFiles={(files) => void add(kind, files)} />
      ))}
    </div>
  )
}

function KindSection({
  token,
  ws,
  setWs,
  kind,
  onFiles,
}: {
  token: string
  ws: Workspace
  setWs(ws: Workspace): void
  kind: (typeof AVATAR_KINDS)[number]
  onFiles(files: FileList): void
}) {
  const waiting = useFolder(token, `${INCOMING}/${kind.id}`)
  const live = useFolder(token, kind.live)
  const prefix = `${INCOMING}/${kind.id}/`
  const pending = Object.entries(ws.uploads).filter(([path]) => path.startsWith(prefix))

  return (
    <section className="editPane" aria-label={kind.title}>
      <div className="majorsBar">
        <h3>{kind.title}</h3>
        <label className="primary upload">
          Subir {kind.title.toLowerCase()}
          <input
            type="file"
            accept="image/png"
            multiple
            onChange={(e) => {
              if (e.target.files?.length) onFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      </div>
      <p className="hint">{kind.hint}</p>

      {pending.length > 0 && (
        <>
          <h4>Sin publicar ({pending.length})</h4>
          <ul className={`artGrid ${kind.id}`}>
            {pending.map(([path, upload]) => (
              <li key={path}>
                {upload.previewUrl && <img src={upload.previewUrl} alt="" />}
                <span>{path.slice(prefix.length)}</span>
                <button type="button" className="link" onClick={() => setWs(withUploads(ws, { [path]: undefined }))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4>Esperando a Claude ({waiting?.length ?? '…'})</h4>
      {waiting && waiting.length === 0 ? (
        <p className="muted">Nothing pending.</p>
      ) : (
        <ul className={`artGrid ${kind.id}`}>
          {(waiting ?? []).map((file) => (
            <li key={file.path}>
              <img src={file.url} alt="" loading="lazy" />
              <span>{file.name}</span>
            </li>
          ))}
        </ul>
      )}

      {kind.id === 'heads' ? (
        <GameHeads ws={ws} setWs={setWs} files={live} />
      ) : (
        <>
          <h4>En el juego ({live?.length ?? '…'})</h4>
          <ul className={`artGrid small ${kind.id}`}>
            {(live ?? []).map((file) => (
              <li key={file.path}>
                <img src={file.url} alt="" loading="lazy" />
                <span>{file.name}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/**
 * The heads in the game, one card per design with all its skin tones (owner request, 24 November
 * 2026): "Borrar" deletes every file of the head with the next proposal. A runner who wore it goes
 * back to the basic head.
 */
function GameHeads({ ws, setWs, files }: { ws: Workspace; setWs(ws: Workspace): void; files: RepoFile[] | null }) {
  const groups = headGroups(files ?? [])
  const marked = (group: HeadGroup) => group.files.every((file) => ws.uploads[file.path]?.base64 === null)
  const toggle = (group: HeadGroup) => {
    const remove = !marked(group)
    const label = `Head ${group.key} (removed)`
    setWs(withUploads(ws, Object.fromEntries(group.files.map((file) => [file.path, remove ? { base64: null, label } : undefined]))))
  }
  const sexName = (sex: HeadGroup['sex']) => (sex === 'men' ? 'Hombre' : 'Mujer')
  return (
    <>
      <h4>En el juego ({files ? groups.length : '…'} caras)</h4>
      <p className="hint">Borrar quita la cara del juego en todos sus tonos (y sus ojos cerrados) al publicar la propuesta. Quien la llevaba vuelve a la cabeza básica.</p>
      <ul className="artGrid small heads">
        {groups.map((group) => {
          const tone1 = group.files.find((file) => file.name.endsWith('_tone1.png')) ?? group.files[0]!
          const tones = group.files.filter((file) => !file.name.endsWith('_blink.png')).length
          const gone = marked(group)
          return (
            <li key={group.key} className={gone ? 'removed' : undefined}>
              <img src={tone1.url} alt="" loading="lazy" />
              <span>
                {sexName(group.sex)} · nivel {group.level} · cara {group.design} ({tones} {tones === 1 ? 'tono' : 'tonos'})
              </span>
              <button type="button" className="link" onClick={() => toggle(group)}>
                {gone ? 'Deshacer' : 'Borrar'}
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
