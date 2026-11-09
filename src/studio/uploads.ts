import { fileBase64, squarePng, thumbnailFile, thumbnailPath, type Upload } from './media'
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

