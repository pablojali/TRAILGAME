import { useEffect, useState } from 'react'
import { campItems, isFreeFromStart } from '../../domain/basecamp/catalog'
import type { CampState } from '../../game-engine/gameState'
import { getCampService, type CampService, type MailboxEntry } from '../../repositories/supabase/campClient'

/** Where another runner's refuge opens (owner design, 17 November 2026). */
export function visitPath(name: string): string {
  return `/base-camp/visit/${encodeURIComponent(name)}`
}

/**
 * The refuge of a runner without pieces saved (or an NPC): one of the free exteriors, always the
 * same for the same name, so every runner has a refuge of their own.
 */
export function defaultRefuge(name: string): CampState {
  const free = campItems('exterior', 'background').filter(isFreeFromStart)
  let hash = 0
  for (const char of name.trim().toLowerCase()) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return { owned: [], using: [free[hash % free.length]!.id] }
}

/** The player's mailbox, read once when shown: null while loading. */
export function useMailbox(service: CampService | null = getCampService()): MailboxEntry[] | 'offline' | null {
  const [entries, setEntries] = useState<MailboxEntry[] | 'offline' | null>(service ? null : 'offline')
  useEffect(() => {
    if (!service) return
    let live = true
    void service.mailbox().then((result) => live && setEntries(result))
    return () => {
      live = false
    }
  }, [service])
  return entries
}
