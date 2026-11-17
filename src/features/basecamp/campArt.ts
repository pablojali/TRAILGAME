import type { CampItem } from '../../domain/basecamp/catalog'

/**
 * The Base Camp pictures the game has: the WebP files CI prepares from the owner's uploads
 * (scripts/prepare_basecamp_art.py). A piece whose picture is not there yet is not drawn.
 */
const ART = import.meta.glob('../../../assets/ui/basecamp/{exterior,interior}/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

export function campArt(item: CampItem, files: Record<string, string> = ART): string | undefined {
  return files[`../../../assets/ui/basecamp/${item.scene}/${item.art}.webp`]
}

/**
 * The scene's shape before its picture loads (the picture's own shape wins once loaded): the
 * canvases are 3200 × 1600 outside and 2600 × 1600 inside (owner, 17 November 2026).
 */
const CANVAS_RATIOS = { exterior: 3200 / 1600, interior: 2600 / 1600 }

export function artRatio(item: CampItem): number {
  return CANVAS_RATIOS[item.scene]
}

/**
 * The background-position (in %) that puts `centre` (a share of the picture) in the middle of a
 * thumbnail showing 1/zoom of the picture, kept inside the picture.
 */
export function focusPosition(centre: number, zoom: number): number {
  if (zoom <= 1) return 50
  const start = Math.min(Math.max(centre - 1 / (2 * zoom), 0), 1 - 1 / zoom)
  return (start / (1 - 1 / zoom)) * 100
}
