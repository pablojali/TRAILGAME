import { fileBase64, imageSize, squarePng, thumbnailFile, thumbnailPath, type Upload } from './media'
import type { RepoFile } from './github'
import type { Workspace } from './model'

/** Folders read from main, kept for the visit (cleared when a proposal is published). */
const cache = new Map<string, Promise<RepoFile[]>>()

export function folders(): Map<string, Promise<RepoFile[]>> {
  return cache
}

export function forgetFolders() {
  cache.clear()
}

export function withUploads(ws: Workspace, changes: Record<string, Upload | undefined>): Workspace {
  const uploads = { ...ws.uploads }
  for (const [path, upload] of Object.entries(changes)) {
    if (uploads[path]?.previewUrl) URL.revokeObjectURL(uploads[path]!.previewUrl!)
    if (upload) uploads[path] = upload
    else delete uploads[path]
  }
  return { ...ws, uploads }
}

export async function asUpload(blob: Blob, label: string): Promise<Upload> {
  return { base64: await fileBase64(blob), previewUrl: URL.createObjectURL(blob), label, bytes: blob.size }
}


/** Prepares an item's new shop picture: the upload and the thumbnail column's file name. */
export async function itemPicture(itemId: string, file: File): Promise<{ path: string; upload: Upload; column: string }> {
  const column = thumbnailFile(itemId)
  const path = thumbnailPath(column)
  return { path, column, upload: await asUpload(await squarePng(file), `Imagen de tienda de ${itemId}`) }
}


/**
 * The art an item wears on the runner (owner request, 14 November 2026): a PNG on the runner's
 * 1024 × 1536 transparent canvas, saved in assets/runner/accesories. The art script (run by CI
 * before every build) turns it into assets/runner/avatar/accessories/{name}.webp and the shop's
 * cropped picture. `{sex}` in the name means one file for men and one for women. Shoes are mapped
 * by the script's own table, so they are not uploaded here.
 */
export const LAYER_CANVAS = { width: 1024, height: 1536 }

/** The layer's file name without folder or extension: the current one, or a new one for the item. */
export function layerStem(itemId: string, type: string, level: string, current: string): string {
  const named = current.trim().replace(/^accessories\//, '').replace(/\.(webp|png)$/i, '')
  if (named && !named.includes('/')) return named
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]+/g, '_').replace(/^_+|_+$/g, '')
  return `lvl${Number(level) > 0 ? Number(level) : 1}_${clean(type) || 'item'}_${clean(itemId) || 'new'}`
}

/** The source files a layer needs: one, or one per sex when its name has `{sex}`. */
export function layerSources(stem: string): { sex: 'men' | 'women' | null; path: string }[] {
  const at = (name: string) => `assets/runner/accesories/${name}.png`
  return stem.includes('{sex}')
    ? (['men', 'women'] as const).map((sex) => ({ sex, path: at(stem.replaceAll('{sex}', sex)) }))
    : [{ sex: null, path: at(stem) }]
}

export const layerColumn = (stem: string) => `accessories/${stem}.webp`

/** Checks and prepares a layer upload (refused if it is not a PNG on the runner's canvas). */
export async function layerPicture(path: string, file: File, label: string): Promise<Upload> {
  if (file.type !== 'image/png') throw new Error('Tiene que ser un PNG con fondo transparente.')
  const { width, height } = await imageSize(file)
  if (width !== LAYER_CANVAS.width || height !== LAYER_CANVAS.height) {
    throw new Error(`Tiene que estar sobre el lienzo del corredor de ${LAYER_CANVAS.width} × ${LAYER_CANVAS.height} (esta mide ${width} × ${height}).`)
  }
  void path
  return { base64: await fileBase64(file), previewUrl: URL.createObjectURL(file), label, bytes: file.size }
}
