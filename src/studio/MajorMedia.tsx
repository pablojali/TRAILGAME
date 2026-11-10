import { useState } from 'react'
import { getRace } from '../domain/races/races'
import { getRaceSegments } from '../game-engine/raceEngine'
import type { MajorEvent } from '../server/majorOps'
import { isMp4, LARGE_VIDEO_BYTES, MAX_VIDEO_BYTES, megabytes, photoJpeg, videoPoster } from './media'
import { majorOps, mediaUrl, uploadMedia } from './majorClient'
import { errorText } from './majorTexts'

/**
 * A Major's banner and its clip per segment (owner request, 10 November 2026). Files go straight to
 * the Storage bucket `major-media` with one-time uploads that `major-ops` signs for administrators;
 * nothing goes through GitHub. A segment without its own clip plays the course race's clip. The
 * banner becomes a JPEG like the race photos; videos are uploaded as they are (MP4, 24 MB at most).
 */
export function MajorMedia({ event, onChange }: { event: MajorEvent; onChange(event: MajorEvent): void }) {
  const race = getRace(event.raceId)
  const segments = race ? getRaceSegments(race).length : 0
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function send(kind: 'banner' | 'clip', segment: number | null, files: { blob: Blob; type: string }[]) {
    const signed = await majorOps({ action: 'media-upload', id: event.id, kind, segment })
    if (!signed.ok) throw new Error(errorText(signed.error))
    const uploads = signed.uploads as { path: string; token: string }[]
    for (const [i, upload] of uploads.entries()) {
      const problem = await uploadMedia(upload.path, upload.token, files[i]!.blob, files[i]!.type)
      if (problem) throw new Error(problem)
    }
    const saved = await majorOps({ action: 'media-set', id: event.id, kind, segment, path: uploads[0]!.path })
    if (!saved.ok) throw new Error(errorText(saved.error))
    onChange(saved.event as MajorEvent)
  }

  async function run(label: string, task: () => Promise<void>, done: string) {
    setBusy(label)
    setError('')
    setNotice('')
    try {
      await task()
      setNotice(done)
    } catch (e) {
      setError(`No se pudo: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const remove = (kind: 'banner' | 'clip', segment: number | null) =>
    run(
      `${kind}${segment ?? ''}`,
      async () => {
        const saved = await majorOps({ action: 'media-set', id: event.id, kind, segment, path: null })
        if (!saved.ok) throw new Error(errorText(saved.error))
        onChange(saved.event as MajorEvent)
      },
      'Quitado.',
    )

  return (
    <div className="majorForm majorMedia">
      <h4>Banner y vídeos · {event.name}</h4>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <div className="mediaRow">
        <div className="mediaPreview banner">
          {event.bannerPath ? <img src={mediaUrl(event.bannerPath)} alt={`Banner de ${event.name}`} /> : <span className="muted">Sin banner (se usa la foto de la carrera)</span>}
        </div>
        <div className="mediaActions">
          <b>Banner</b>
          <span className="hint">Imagen apaisada; se guarda como JPEG de hasta 1672 px de ancho.</span>
          <label className="ghost small fileButton">
            {busy === 'banner' ? 'Subiendo…' : event.bannerPath ? 'Cambiar banner' : 'Subir banner'}
            <input
              type="file"
              accept="image/*"
              disabled={busy !== null}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void run('banner', async () => send('banner', null, [{ blob: await photoJpeg(file), type: 'image/jpeg' }]), 'Banner guardado.')
              }}
            />
          </label>
          {event.bannerPath && (
            <button type="button" className="link" disabled={busy !== null} onClick={() => void remove('banner', null)}>
              Quitar
            </button>
          )}
        </div>
      </div>

      {Array.from({ length: segments }, (_, i) => i + 1).map((segment) => {
        const path = event.clips[String(segment)]
        return (
          <div className="mediaRow" key={segment}>
            <div className="mediaPreview">
              {path ? (
                <video src={mediaUrl(path)} poster={mediaUrl(path.replace(/\.mp4$/, '.jpg'))} controls muted playsInline preload="none" />
              ) : (
                <span className="muted">Usa el vídeo de la carrera</span>
              )}
            </div>
            <div className="mediaActions">
              <b>Tramo {segment}</b>
              <span className="hint">MP4 (H.264), hasta {megabytes(MAX_VIDEO_BYTES)}; se sube tal cual.</span>
              <label className="ghost small fileButton">
                {busy === `clip${segment}` ? 'Subiendo…' : path ? 'Cambiar vídeo' : 'Subir vídeo'}
                <input
                  type="file"
                  accept="video/mp4"
                  disabled={busy !== null}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (!file) return
                    void run(
                      `clip${segment}`,
                      async () => {
                        const head = new Uint8Array(await file.arrayBuffer())
                        if (!isMp4(head)) throw new Error('ese archivo no es un vídeo MP4. Expórtalo como MP4 (H.264), por ejemplo desde InShot o CapCut a 720p.')
                        if (file.size > MAX_VIDEO_BYTES) throw new Error(`pesa ${megabytes(file.size)}; el máximo es ${megabytes(MAX_VIDEO_BYTES)}. Expórtalo a 720p.`)
                        await send('clip', segment, [
                          { blob: file, type: 'video/mp4' },
                          { blob: await videoPoster(file), type: 'image/jpeg' },
                        ])
                      },
                      file.size > LARGE_VIDEO_BYTES ? `Vídeo del tramo ${segment} guardado (${megabytes(file.size)}: tardará en cargar con datos móviles).` : `Vídeo del tramo ${segment} guardado.`,
                    )
                  }}
                />
              </label>
              {path && (
                <button type="button" className="link" disabled={busy !== null} onClick={() => void remove('clip', segment)}>
                  Quitar
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
