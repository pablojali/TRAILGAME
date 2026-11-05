import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useCareer } from '../../app/game/gameContext'
import button from '../../components/Button.module.css'
import { ScrollPanel } from '../../components/Screen'
import { Chips } from '../../components/Tabs'
import { countryFlag, countryName } from '../../domain/athlete/countries'
import { getLevel } from '../../domain/athlete/levels'
import { RANKING, rankingSeason } from '../../domain/ranking/ranking'
import { useI18n } from '../../i18n/i18n'
import type { RankingRow, RankingService } from '../../repositories/supabase/rankingClient'
import styles from './RankingPanel.module.css'

type Scope = 'world' | 'country'
type Filter = 'all' | 'male' | 'female'

/** How many runners each ranking shows (plus the player's own row). */
const LIMIT = 50

/**
 * World and country rankings (owner design, 5 November 2026): asynchronous, one calendar month per
 * season, read from the server (only race results the server decided count). Online only.
 */
export function RankingPanel({ service }: { service: RankingService | null }) {
  const { state } = useCareer()
  const { t, locale } = useI18n()
  const current = Math.max(1, rankingSeason(Date.now()))
  const [scope, setScope] = useState<Scope>('world')
  const [filter, setFilter] = useState<Filter>('all')
  const [season, setSeason] = useState(current)
  const [rows, setRows] = useState<RankingRow[] | 'offline' | null>(null)
  const [attempt, setAttempt] = useState(0)
  const country = state.athlete.country

  const load = useCallback(async () => {
    if (!service || (scope === 'country' && !country)) return
    setRows(null)
    const result = await service.fetch({
      season,
      country: scope === 'country' ? country : undefined,
      sex: filter === 'all' ? undefined : filter,
      bestResults: RANKING.bestResults,
      limit: LIMIT,
    })
    setRows(result)
  }, [service, scope, country, season, filter])

  useEffect(() => {
    void load()
  }, [load, attempt])

  const scopes = (['world', 'country'] as const).map((id) => ({ id, label: t(`ranking.${id}`) }))
  const filters = [
    { id: 'all' as const, label: t('ranking.all') },
    { id: 'male' as const, label: t('ranking.men') },
    { id: 'female' as const, label: t('ranking.women') },
  ]
  const number = (n: number) => n.toLocaleString(locale)
  const me = Array.isArray(rows) ? rows.find((row) => row.isMe) : undefined

  return (
    <div className={styles.panel}>
      <div className={styles.scopes} role="group" aria-label={t('ranking.scope')}>
        {scopes.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`${styles.scope} ${scope === id ? styles.scopeOn : ''}`}
            aria-pressed={scope === id}
            onClick={() => setScope(id)}
          >
            <span aria-hidden="true">{id === 'world' ? '🌐' : country ? countryFlag(country) : '⚑'}</span>
            {label}
          </button>
        ))}
      </div>
      <div className={styles.bar}>
        <Chips<Filter> label={t('ranking.filter')} options={filters} value={filter} onChange={setFilter} />
        <span className={styles.season}>
          <button
            type="button"
            className={styles.arrow}
            aria-label={t('ranking.previous')}
            disabled={season <= 1}
            onClick={() => setSeason((s) => s - 1)}
          >
            ‹
          </button>
          {t('ranking.season', { season })}
          <button
            type="button"
            className={styles.arrow}
            aria-label={t('ranking.next')}
            disabled={season >= current}
            onClick={() => setSeason((s) => s + 1)}
          >
            ›
          </button>
        </span>
      </div>
      <h3 className={styles.title}>
        {scope === 'world' ? t('ranking.worldTitle') : t('ranking.countryTitle', { country: country ? countryName(country, locale) : '' })}
      </h3>

      {!service ? (
        <p className={styles.muted}>{t('ranking.unavailable')}</p>
      ) : scope === 'country' && !country ? (
        <p className={styles.muted}>
          {t('ranking.noCountry')} <Link to="/settings">{t('ranking.settings')}</Link>
        </p>
      ) : rows === null ? (
        <p role="status" className={styles.muted}>
          {t('ranking.loading')}
        </p>
      ) : rows === 'offline' ? (
        <div>
          <p role="alert" className={styles.muted}>
            {t('ranking.offline')}
          </p>
          <button type="button" className={`${button.button} ${button.secondary}`} onClick={() => setAttempt((n) => n + 1)}>
            {t('ranking.retry')}
          </button>
        </div>
      ) : (
        <>
          <ScrollPanel label={t('ranking.list')}>
            {rows.filter((row) => row.rank <= LIMIT).length === 0 ? (
              <p className={styles.muted}>{t('ranking.empty')}</p>
            ) : (
              <ol className={styles.list}>
                {rows
                  .filter((row) => row.rank <= LIMIT)
                  .map((row) => (
                    <li key={`${row.rank}-${row.name}`} className={`${styles.row} ${row.isMe ? styles.rowMe : ''}`}>
                      <span className={`${styles.rank} ${row.rank <= 3 ? styles.rankTop : ''}`}>{row.rank}</span>
                      <span className={styles.who}>
                        <span className={styles.name}>{row.name}</span>
                        <span className={styles.meta}>
                          {row.country && `${countryFlag(row.country)} ${countryName(row.country, locale)} · `}
                          {t('ranking.level', { level: getLevel(row.xp) })}
                        </span>
                      </span>
                      <span className={styles.points}>{t('ranking.points', { points: number(row.points) })}</span>
                    </li>
                  ))}
              </ol>
            )}
          </ScrollPanel>
          <section className={styles.you} aria-label={t('ranking.you')}>
            <span className={styles.youLabel}>{t('ranking.you')}</span>
            {me ? (
              <>
                <span className={styles.youRow}>
                  <strong>{t('ranking.youRow', { rank: me.rank, name: me.name })}</strong>
                  <strong className={styles.points}>{t('ranking.points', { points: number(me.points) })}</strong>
                </span>
                <span className={styles.meta}>
                  {me.country && `${countryFlag(me.country)} ${countryName(me.country, locale)} · `}
                  {t('ranking.level', { level: getLevel(me.xp) })}
                </span>
              </>
            ) : (
              <span className={styles.meta}>{t('ranking.notRanked')}</span>
            )}
            <span className={styles.how}>{t('ranking.how', { count: RANKING.bestResults })}</span>
          </section>
        </>
      )}
    </div>
  )
}
