import { useCallback, useEffect, useState } from 'react'
import { getMajorService, type MajorAction } from '../../repositories/supabase/majorClient'
import type { PlayerMajor } from '../../server/majorOps'

/** The last answer, kept between screens so Races and the Major screen open with it at once. */
let cache: PlayerMajor[] | null = null

/**
 * The published Majors with the player's registration (Sunday Major, phase 2), refreshed every
 * 15 seconds while a screen shows them, and the player's actions. Null service: no Supabase (Majors are
 * online only).
 */
export function useMajors() {
  const service = getMajorService()
  const [majors, setMajors] = useState<PlayerMajor[] | null>(cache)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const apply = useCallback((next: PlayerMajor[]) => {
    cache = next
    setMajors(next)
  }, [])

  const refresh = useCallback(async () => {
    if (!service) return
    const answer = await service.call({ action: 'majors' })
    if (answer.ok) {
      apply(answer.majors)
      setError('')
    } else setError(answer.error)
  }, [service, apply])

  useEffect(() => {
    if (!service) return
    // Fetching from the server (the last answer shows meanwhile): the state is set when it arrives.
    void refresh()
    // Every 15 s: a new entrant or a status change shows without reloading (owner request, 12 November 2026).
    const timer = window.setInterval(() => void refresh(), 15_000)
    return () => window.clearInterval(timer)
  }, [service, refresh])

  const act = useCallback(
    async (request: MajorAction): Promise<string | null> => {
      if (!service) return 'offline'
      setBusy(true)
      const answer = await service.call(request)
      setBusy(false)
      if (!answer.ok) return answer.error
      apply(answer.majors)
      return null
    },
    [service, apply],
  )

  return { available: service !== null, majors, error, busy, act, refresh, mediaUrl: (path: string) => service?.mediaUrl(path) ?? '' }
}

/** What the player can do now: the event status, with READY as its own phase. */
export type MajorPhase = PlayerMajor['status'] | 'READY'

export function majorPhase(major: PlayerMajor, now: number): MajorPhase {
  if (major.status === 'REGISTRATION_OPEN' && major.readyOpenAt && now >= Date.parse(major.readyOpenAt)) return 'READY'
  return major.status
}

/** The Major to show first: the next one not finished or cancelled, else the latest. */
export function nextMajor(majors: readonly PlayerMajor[]): PlayerMajor | undefined {
  return majors.find((m) => m.status !== 'FINISHED' && m.status !== 'CANCELLED') ?? majors.at(-1)
}
