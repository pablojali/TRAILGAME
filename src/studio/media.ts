/**
 * Pictures and videos uploaded in Trail Studio (owner request, 9 November 2026), prepared in the
 * browser the way the game expects them (assets/ui/races, assets/race/clips, assets/ui/thumbnails).
 */
export interface Upload {
  /** The file's bytes in base64, or null to delete the file. */
  base64: string | null
  /** A local address to preview it before it is published. */
  previewUrl?: string
  /** What it is, in words (for the review and the pull request). */
  label: string
  /** Size in bytes (for the review). */
  bytes?: number
}

/** Race photo: a wide banner, shown cropped on the race card. */
export const racePhotoPath = (raceId: string) => `assets/ui/races/${raceId}.jpg`
export const clipPath = (raceId: string, segment: number, ext: 'mp4' | 'jpg') => `assets/race/clips/${raceId}/segment-${segment}.${ext}`
export const thumbnailFile = (itemId: string) => `thumb_${itemId.replace(/[^a-z0-9-]+/gi, '_')}.png`
export const thumbnailPath = (file: string) => `assets/ui/thumbnails/${file}`

/** The largest video the Studio sends (GitHub refuses files over 100 MB; the game wants about 3 MB). */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024
export const LARGE_VIDEO_BYTES = 8 * 1024 * 1024

function base64Of(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

export async function fileBase64(file: Blob): Promise<string> {
  return base64Of(new Uint8Array(await file.arrayBuffer()))
}

/** An MP4 has its "ftyp" box at byte 4 (the game's checks refuse anything else). */
export function isMp4(bytes: Uint8Array): boolean {
  return bytes.length > 20_000 && String.fromCharCode(...bytes.subarray(4, 8)) === 'ftyp'
}

async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return image
  } finally {
    // The decoded image stays usable after its address is released.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo preparar la imagen'))), type, quality))
}

/** A photo as JPEG, at most `maxWidth` wide (keeping its shape). */
export async function photoJpeg(file: Blob, maxWidth = 1672): Promise<Blob> {
  const image = await loadImage(file)
  const scale = Math.min(1, maxWidth / image.naturalWidth)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.naturalWidth * scale)
  canvas.height = Math.round(image.naturalHeight * scale)
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvasBlob(canvas, 'image/jpeg', 0.85)
}

/** A shop picture: 512 × 512 PNG, the item centred, transparency kept. */
export async function squarePng(file: Blob, size = 512): Promise<Blob> {
  const image = await loadImage(file)
  const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight) * 0.92
  const w = image.naturalWidth * scale
  const h = image.naturalHeight * scale
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  canvas.getContext('2d')!.drawImage(image, (size - w) / 2, (size - h) / 2, w, h)
  return canvasBlob(canvas, 'image/png')
}

/** A poster for a clip: its frame at half a second, as JPEG. */
export async function videoPoster(file: Blob): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = url
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve()
      video.onerror = () => reject(new Error('El navegador no puede leer este vídeo'))
    })
    video.currentTime = Math.min(0.5, (video.duration || 1) / 2)
    await new Promise<void>((resolve) => (video.onseeked = () => resolve()))
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    return canvasBlob(canvas, 'image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
