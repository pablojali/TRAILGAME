import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Icon } from '../../components/Icon'
import { ordinal } from '../../features/races/raceText'
import { useI18n, type MessageKey, type Translate } from '../../i18n/i18n'
import { achievementTitleKey } from '../../i18n/labels'
import { useGame } from '../game/gameContext'
import { countryName } from '../../domain/athlete/countries'
import { RANKING, rankingSeason } from '../../domain/ranking/ranking'
import { getRankingService, type RankingService } from '../../repositories/supabase/rankingClient'
import { arrange, buildInbox, loadMemory, markRead, rememberRank, saveMemory, type InboxItem, type RankingScope } from './inbox'
import styles from './Inbox.module.css'

const ICON: Record<InboxItem['kind'], string> = {
  race: '⚑',
  challenge: '★',
  level: '▲',
  season: '◷',
  'race-day': '⏱',
  decay: '↘',
  cloud: '☁',
  ranking: '🏆',
}

function texts(item: InboxItem, t: Translate, locale: string): { title: string; body: string } {
  const v = item.values
  switch (item.kind) {
    case 'race':
      return {
        title: t('inbox.race.title', { race: String(v.race) }),
        body: t('inbox.race.body', { position: ordinal(Number(v.position), locale), field: Number(v.field), points: Number(v.points) }),
      }
    case 'challenge':
      return {
        title: t('inbox.challenge.title'),
        body: t('inbox.challenge.body', { title: t(achievementTitleKey(String(v.id) as never)), level: Number(v.level) }),
      }
    case 'level':
      return { title: t('inbox.level.title', { level: Number(v.level) }), body: t('inbox.level.body') }
    case 'season':
      return { title: t('inbox.season.title', { season: Number(v.season), year: String(v.year) }), body: t('inbox.season.body') }
    case 'race-day':
      return { title: t('inbox.raceDay.title', { race: String(v.race) }), body: t('inbox.raceDay.body') }
    case 'decay':
      return { title: t('inbox.decay.title'), body: t('notice.decay', { lost: Number(v.lost), count: Number(v.count) }) }
    case 'ranking': {
      const where = v.scope === 'country' && v.country ? countryName(String(v.country), locale) : t('inbox.ranking.world')
      const title = t(`inbox.ranking.${String(v.change) as 'entered' | 'up' | 'down' | 'left'}`, { where })
      const body =
        v.change === 'left'
          ? t('inbox.ranking.leftBody', { previous: Number(v.previous) })
          : v.change === 'entered'
            ? t('inbox.ranking.enteredBody', { rank: Number(v.rank) })
            : t('inbox.ranking.movedBody', { rank: Number(v.rank), previous: Number(v.previous) })
      return { title, body }
    }
    case 'cloud': {
      const body: MessageKey = v.notice === 'restored' ? 'notice.restored' : v.notice === 'updated' ? 'notice.updated' : 'inbox.cloud.error'
      return { title: t('inbox.cloud.title'), body: t(body) }
    }
  }
}

/**
 * The bell in the top bar (owner request, 6 November 2026; it replaces the cloud indicator): a red
 * dot while there is something new, and the Inbox when tapped. Opening it marks everything read;
 * closing it also clears the one-visit messages (Fitness lost, cloud save).
 */
/** How often the player's ranking positions are checked while the app is open. */
const RANK_CHECK_MS = 10 * 60 * 1000

/**
 * Watches the player's position in the world and country rankings of the current season (owner
 * request, 7 November 2026): when the app opens, after each race and every few minutes. Positions
 * are compared with the last ones known on this device; entering the top 10, moving within it and
 * leaving it make notifications.
 */
function useRankingWatch(
  service: RankingService | null,
  country: string | undefined,
  racesRun: number,
  remember: (scope: RankingScope, season: number, rank: number | null) => void,
) {
  useEffect(() => {
    if (!service) return
    let cancelled = false
    async function check() {
      const season = rankingSeason(Date.now())
      if (!season || !service) return
      const scopes: RankingScope[] = country ? ['world', 'country'] : ['world']
      for (const scope of scopes) {
        const rows = await service.fetch({
          mode: 'season',
          season,
          months: RANKING.annualMonths,
          country: scope === 'country' ? country : undefined,
          bestResults: RANKING.bestResults,
          limit: 10,
        })
        if (cancelled || rows === 'offline') continue
        remember(scope, season, rows.find((row) => row.isMe)?.rank ?? null)
      }
    }
    void check()
    const timer = window.setInterval(() => void check(), RANK_CHECK_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [service, country, racesRun, remember])
}

export function InboxButton({ rankingService = getRankingService() }: { rankingService?: RankingService | null }) {
  const { phase, decayNotice, dismissDecayNotice, cloudNotice, dismissCloudNotice, cloudStatus } = useGame()
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [memory, setMemory] = useState(loadMemory)
  const panel = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const now = Date.now()
  const state = phase.kind === 'playing' ? phase.state : null

  // The latest memory, for updates made outside a render (the ranking watch).
  const memoryRef = useRef(memory)
  memoryRef.current = memory
  const remember = useCallback(
    (scope: RankingScope, season: number, rank: number | null) => {
      const updated = rememberRank(memoryRef.current, scope, season, rank, Date.now(), state?.athlete.country)
      if (updated === memoryRef.current) return
      memoryRef.current = updated
      setMemory(updated)
      saveMemory(updated)
    },
    [state?.athlete.country],
  )
  const racesRun = state ? state.raceEntries.filter((entry) => entry.status === 'finished').length : 0
  useRankingWatch(rankingService, state?.athlete.country, racesRun, remember)

  const { list, memory: next } = useMemo(() => {
    const items = state ? buildInbox(state, now, { decay: decayNotice, cloudNotice, cloudError: cloudStatus === 'error' }) : []
    return arrange(items, memory, now)
    // `now` changes every render; the list only needs the inputs below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, memory, decayNotice, cloudNotice, cloudStatus])
  const unread = list.filter((item) => item.unread).length

  // Remember first-seen times of new notifications.
  useEffect(() => {
    if (JSON.stringify(next.seen) !== JSON.stringify(memory.seen)) {
      setMemory(next)
      saveMemory(next)
    }
  }, [next, memory])

  useEffect(() => {
    if (!open) return
    panel.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !button.current?.contains(target)) close()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  })

  function show() {
    setOpen(true)
    const read = markRead(next, list.map((item) => item.id))
    setMemory(read)
    saveMemory(read)
  }

  function close(focusButton = true) {
    setOpen(false)
    if (decayNotice) dismissDecayNotice()
    if (cloudNotice) dismissCloudNotice()
    if (focusButton) button.current?.focus()
  }

  // While open, the list keeps showing which items were new when it opened.
  const [shownUnread, setShownUnread] = useState<ReadonlySet<string>>(new Set())

  return (
    <>
      <button
        ref={button}
        type="button"
        className={styles.bell}
        aria-label={unread ? t('inbox.openNew', { count: unread }) : t('inbox.open')}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-unread={unread > 0 || undefined}
        onClick={() => {
          if (open) return close()
          setShownUnread(new Set(list.filter((item) => item.unread).map((item) => item.id)))
          show()
        }}
      >
        <Icon name="bell" size={20} />
        {unread > 0 && <span className={styles.dot} aria-hidden="true" />}
      </button>
      {open && (
        <div ref={panel} className={styles.panel} role="dialog" aria-labelledby={titleId} tabIndex={-1}>
          <div className={styles.head}>
            <h2 id={titleId} className={styles.title}>
              {t('inbox.title')}
            </h2>
            <button type="button" className={styles.close} onClick={() => close()}>
              {t('inbox.close')}
            </button>
          </div>
          {list.length === 0 ? (
            <p className={styles.empty}>{t('inbox.empty')}</p>
          ) : (
            <ul className={styles.list}>
              {list.map((item) => {
                const { title, body } = texts(item, t, locale)
                const isNew = shownUnread.has(item.id)
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`${styles.item} ${isNew ? styles.itemNew : ''}`}
                      onClick={() => {
                        close(false)
                        if (item.link) void navigate(item.link)
                      }}
                    >
                      <span className={styles.icon} aria-hidden="true">
                        {ICON[item.kind]}
                      </span>
                      <span className={styles.text}>
                        <span className={styles.itemTitle}>
                          {title}
                          {isNew && <span className={styles.newTag}>{t('inbox.new')}</span>}
                        </span>
                        <span className={styles.itemBody}>{body}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </>
  )
}
