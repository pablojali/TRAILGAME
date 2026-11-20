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
      const changes: Record<string, Upload | undefined> = { [racePhotoPath(raceId)]: await asUpload(await photoJpeg(file), `Photo of ${raceId}`) }
      // Another picture of this race (e.g. .webp) would compete with the new one: it goes.
      for (const other of photos ?? []) {
        if (other.name.replace(/\.\w+$/, '') === raceId && other.path !== racePhotoPath(raceId)) changes[other.path] = { base64: null, label: `Remove ${other.name}` }
      }
      return withUploads(ws, changes)
    })

  const uploadClip = (segment: number, file: File) =>
    run(`clip-${segment}`, async () => {
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (!isMp4(bytes)) throw new Error('That file is not an MP4 video. Export it as MP4 (H.264), e.g. from InShot or CapCut at 720p.')
      if (file.size > MAX_VIDEO_BYTES) {
        throw new Error(
          `The video weighs ${megabytes(file.size)}: Cloudflare does not publish files over 25 MB. Export it at 720p (InShot or CapCut: 720p resolution, medium quality) or ask Claude to compress it.`,
        )
      }
      const changes: Record<string, Upload | undefined> = {
        [clipPath(raceId, segment, 'mp4')]: await asUpload(file, `Segment ${segment} video of ${raceId}`),
      }
      try {
        changes[clipPath(raceId, segment, 'jpg')] = await asUpload(await videoPoster(file), `Segment ${segment} poster of ${raceId}`)
      } catch {
        // No poster: the game shows the video directly.
      }
      return withUploads(ws, changes)
    })

  return (
    <>
      <h3>Photo and videos</h3>
      {error && <p className="error">{error}</p>}
      <div className="media">
        <div className="mediaItem wide">
          <span className="mediaTitle">Race photo</span>
          <div className="mediaFrame photo">
            {photoPending?.previewUrl ? <img src={photoPending.previewUrl} alt="" /> : photoOnMain ? <img src={photoOnMain.url} alt="" /> : <span className="muted">No photo: the game draws the landscape</span>}
          </div>
          <span className="hint">Landscape photo (cropped to a wide band). Saved as a 1672 px wide JPEG.</span>
          <div className="mediaActions">
            <Picker accept="image/*" label={busy === 'photo' ? 'Preparing…' : photoOnMain || photoPending ? 'Change photo' : 'Upload photo'} onFile={uploadPhoto} disabled={busy !== null} />
            {photoPending && (
              <button type="button" className="link" onClick={() => setWs(withUploads(ws, Object.fromEntries(Object.keys(ws.uploads).filter((p) => p.startsWith('assets/ui/races/' + raceId)).map((p) => [p, undefined]))))}>
                Undo
              </button>
            )}
          </div>
        </div>
        {Array.from({ length: segments }, (_, i) => i + 1).map((segment) => {
          const pending = ws.uploads[clipPath(raceId, segment, 'mp4')]
          const onMain = clips?.find((f) => f.name === `segment-${segment}.mp4` || f.name === `segment-${segment}.webm`)
          const poster = ws.uploads[clipPath(raceId, segment, 'jpg')]?.previewUrl ?? clips?.find((f) => f.name.startsWith(`segment-${segment}.`) && /\.(jpe?g|webp)$/.test(f.name))?.url
          const from = segment === 1 ? 'Start' : `Aid station ${segment - 1}`
          const to = segment === segments ? 'finish' : `aid station ${segment}`
          return (
            <div className="mediaItem" key={segment}>
              <span className="mediaTitle">
                Tramo {segment}: {from} → {to}
              </span>
              <div className="mediaFrame clip">
                {pending?.previewUrl || onMain ? (
                  <video src={pending?.previewUrl ?? onMain!.url} poster={poster} controls muted playsInline preload="metadata" />
                ) : (
                  <span className="muted">No video</span>
                )}
              </div>
              {pending?.bytes !== undefined && pending.bytes > LARGE_VIDEO_BYTES && <span className="hint warn">It weighs {megabytes(pending.bytes)}: better under 3 MB (720p).</span>}
              <div className="mediaActions">
                <Picker accept="video/mp4" label={busy === `clip-${segment}` ? 'Preparing…' : onMain || pending ? 'Change video' : 'Upload video'} onFile={(f) => uploadClip(segment, f)} disabled={busy !== null} />
                {pending && (
                  <button
                    type="button"
                    className="link"
                    onClick={() => setWs(withUploads(ws, { [clipPath(raceId, segment, 'mp4')]: undefined, [clipPath(raceId, segment, 'jpg')]: undefined }))}
                  >
                    Undo
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className="hint">Vertical 9:16 MP4 videos, 4 to 8 seconds, ideally under 3 MB. The poster is taken from the video.</p>
    </>
  )
}

