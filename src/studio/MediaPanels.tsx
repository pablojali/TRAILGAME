import { useEffect, useState } from 'react'
import { listFolder, type RepoFile } from './github'
import { clipPath, isMp4, LARGE_VIDEO_BYTES, MAX_VIDEO_BYTES, megabytes, photoJpeg, racePhotoPath, videoPoster, type Upload } from './media'
import { asUpload, folders, withUploads } from './uploads'
import type { Workspace } from './model'

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

export function Picker({ accept, label, onFile, disabled }: { accept: string; label: string; onFile(file: File): void; disabled?: boolean }) {
  return (
    <label className={`ghost upload${disabled ? ' disabled' : ''}`}>
      {label}
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onFile(file)
        }}
      />
    </label>
  )
}

/** A race's photo and its clips, one per segment. */
export function RaceMedia({ token, ws, setWs, raceId, segments }: { token: string; ws: Workspace; setWs(ws: Workspace): void; raceId: string; segments: number }) {
  const photos = useFolder(token, 'assets/ui/races')
  const clips = useFolder(token, `assets/race/clips/${raceId}`)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const photoPending = ws.uploads[racePhotoPath(raceId)]
  const photoOnMain = photos?.find((f) => f.name.replace(/\.\w+$/, '') === raceId)

  async function run(what: string, work: () => Promise<Workspace>) {
    setBusy(what)
    setError('')
    try {
      setWs(await work())
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(null)
  }

  const uploadPhoto = (file: File) =>
    run('photo', async () => {
      const changes: Record<string, Upload | undefined> = { [racePhotoPath(raceId)]: await asUpload(await photoJpeg(file), `Foto de ${raceId}`) }
      // Another picture of this race (e.g. .webp) would compete with the new one: it goes.
      for (const other of photos ?? []) {
        if (other.name.replace(/\.\w+$/, '') === raceId && other.path !== racePhotoPath(raceId)) changes[other.path] = { base64: null, label: `Quitar ${other.name}` }
      }
      return withUploads(ws, changes)
    })

  const uploadClip = (segment: number, file: File) =>
    run(`clip-${segment}`, async () => {
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (!isMp4(bytes)) throw new Error('Ese archivo no es un vídeo MP4. Expórtalo como MP4 (H.264), por ejemplo desde InShot o CapCut a 720p.')
      if (file.size > MAX_VIDEO_BYTES) {
        throw new Error(
          `El vídeo pesa ${megabytes(file.size)}: Cloudflare no publica archivos de más de 25 MB. Expórtalo a 720p (InShot o CapCut: resolución 720p, calidad media) o pídele a Claude que lo comprima.`,
        )
      }
      const changes: Record<string, Upload | undefined> = {
        [clipPath(raceId, segment, 'mp4')]: await asUpload(file, `Vídeo del tramo ${segment} de ${raceId}`),
      }
      try {
        changes[clipPath(raceId, segment, 'jpg')] = await asUpload(await videoPoster(file), `Póster del tramo ${segment} de ${raceId}`)
      } catch {
        // No poster: the game shows the video directly.
      }
      return withUploads(ws, changes)
    })

  return (
    <>
      <h3>Foto y vídeos</h3>
      {error && <p className="error">{error}</p>}
      <div className="media">
        <div className="mediaItem wide">
          <span className="mediaTitle">Foto de la carrera</span>
          <div className="mediaFrame photo">
            {photoPending?.previewUrl ? <img src={photoPending.previewUrl} alt="" /> : photoOnMain ? <img src={photoOnMain.url} alt="" /> : <span className="muted">Sin foto: el juego dibuja el paisaje</span>}
          </div>
          <span className="hint">Foto apaisada (se recorta como una franja ancha). Se guarda como JPEG de 1672 px de ancho.</span>
          <div className="mediaActions">
            <Picker accept="image/*" label={busy === 'photo' ? 'Preparando…' : photoOnMain || photoPending ? 'Cambiar foto' : 'Subir foto'} onFile={uploadPhoto} disabled={busy !== null} />
            {photoPending && (
              <button type="button" className="link" onClick={() => setWs(withUploads(ws, Object.fromEntries(Object.keys(ws.uploads).filter((p) => p.startsWith('assets/ui/races/' + raceId)).map((p) => [p, undefined]))))}>
                Deshacer
              </button>
            )}
          </div>
        </div>
        {Array.from({ length: segments }, (_, i) => i + 1).map((segment) => {
          const pending = ws.uploads[clipPath(raceId, segment, 'mp4')]
          const onMain = clips?.find((f) => f.name === `segment-${segment}.mp4` || f.name === `segment-${segment}.webm`)
          const poster = ws.uploads[clipPath(raceId, segment, 'jpg')]?.previewUrl ?? clips?.find((f) => f.name.startsWith(`segment-${segment}.`) && /\.(jpe?g|webp)$/.test(f.name))?.url
          const from = segment === 1 ? 'Salida' : `Avituallamiento ${segment - 1}`
          const to = segment === segments ? 'meta' : `avituallamiento ${segment}`
          return (
            <div className="mediaItem" key={segment}>
              <span className="mediaTitle">
                Tramo {segment}: {from} → {to}
              </span>
              <div className="mediaFrame clip">
                {pending?.previewUrl || onMain ? (
                  <video src={pending?.previewUrl ?? onMain!.url} poster={poster} controls muted playsInline preload="metadata" />
                ) : (
                  <span className="muted">Sin vídeo</span>
                )}
              </div>
              {pending?.bytes !== undefined && pending.bytes > LARGE_VIDEO_BYTES && <span className="hint warn">Pesa {megabytes(pending.bytes)}: mejor por debajo de 3 MB (720p).</span>}
              <div className="mediaActions">
                <Picker accept="video/mp4" label={busy === `clip-${segment}` ? 'Preparando…' : onMain || pending ? 'Cambiar vídeo' : 'Subir vídeo'} onFile={(f) => uploadClip(segment, f)} disabled={busy !== null} />
                {pending && (
                  <button
                    type="button"
                    className="link"
                    onClick={() => setWs(withUploads(ws, { [clipPath(raceId, segment, 'mp4')]: undefined, [clipPath(raceId, segment, 'jpg')]: undefined }))}
                  >
                    Deshacer
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className="hint">Vídeos verticales 9:16 en MP4, de 4 a 8 segundos, idealmente por debajo de 3 MB. El póster se saca solo del vídeo.</p>
    </>
  )
}

