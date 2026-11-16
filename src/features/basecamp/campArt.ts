import type { CampItem } from '../../domain/basecamp/catalog'

/**
 * The Base Camp pictures the game has: the WebP files CI prepares from the owner's uploads
 * (scripts/prepare_basecamp_art.py). A piece whose picture is not there yet is not drawn.
 */
const ART = import.meta.glob('../../../assets/ui/basecamp/{exterior,interior}/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

export function campArt(item: CampItem, files: Record<string, string> = ART): string | undefined {
  return files[`../../../assets/ui/basecamp/${item.scene}/${item.art}.webp`]
}

/** Width / height of the first pictures (before the 3200 × 1600 canvas); new art is 2:1. */
const KNOWN_RATIOS: Record<string, number> = { lvl0_exterior: 1079 / 625, lvl0_interior: 1080 / 912 }

export function artRatio(item: CampItem): number {
  return KNOWN_RATIOS[item.art] ?? 2
}
