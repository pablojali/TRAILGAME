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
 * Avatar art (owner request, 13 November 2026; shirts since 24 November 2026): the owner uploads new bodies, heads and shirts here, as
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
          Sube cuerpos, caras y remeras nuevos en PNG con fondo transparente, varios a la vez si quieres. Quedan en la propuesta (pestaña Propuestas) y, al
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
 * The heads in the game, one card per file (owner request, 24 November 2026: every tone shown),
 * in unlock order. "Borrar" deletes that file with the next proposal (a tone also takes its
 * closed-eyes face with it). A head left with no tone leaves the game; a runner who wore a deleted
 * head or tone goes back to the basic head.
 */
function GameHeads({ ws, setWs, files }: { ws: Workspace; setWs(ws: Workspace): void; files: RepoFile[] | null }) {
  const groups = headGroups(files ?? [])
  const all = groups.flatMap((group) => [...group.files].sort((a, b) => a.name.localeCompare(b.name)).map((file) => ({ group, file })))
  const gone = (file: RepoFile) => ws.uploads[file.path]?.base64 === null
  const toggle = (group: HeadGroup, file: RepoFile) => {
    const remove = !gone(file)
    // A tone takes its closed-eyes face with it; the closed eyes alone can go on their own.
    const blink = file.name.replace(/\.png$/, '_blink.png')
    const paths = [file, ...group.files.filter((other) => other.name === blink)].map((f) => f.path)
    setWs(withUploads(ws, Object.fromEntries(paths.map((path) => [path, remove ? { base64: null, label: `Head art ${path.slice(path.lastIndexOf('/') + 1)} (removed)` } : undefined]))))
  }
  const describe = (group: HeadGroup, file: RepoFile) => {
    const tone = /_tone(\d)/.exec(file.name)?.[1]
    return `${group.sex === 'men' ? 'Hombre' : 'Mujer'} · nivel ${group.level} · cara ${group.design} · tono ${tone}${file.name.endsWith('_blink.png') ? ' · ojos cerrados' : ''}`
  }
  return (
    <>
      <h4>En el juego ({files ? `${all.length} imágenes, ${groups.length} caras` : '…'})</h4>
      <p className="hint">Borrar quita esa imagen del juego al publicar la propuesta (un tono se lleva también sus ojos cerrados). Quien la llevaba vuelve a la cabeza básica.</p>
      <ul className="artGrid small heads">
        {all.map(({ group, file }) => (
          <li key={file.path} className={gone(file) ? 'removed' : undefined}>
            <img src={file.url} alt="" loading="lazy" />
            <span>{describe(group, file)}</span>
            <span>{file.name}</span>
            <button type="button" className="link" onClick={() => toggle(group, file)}>
              {gone(file) ? 'Deshacer' : 'Borrar'}
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
