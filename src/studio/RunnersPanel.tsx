import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RunnerRow } from '../server/majorOps'
import { AdminGate } from './MajorsPanel'
import { errorText } from './majorTexts'
import { majorOps, signOut } from './majorClient'
import { filterRunners, runnerStats, sortRunners, type Count, type RunnerKindFilter, type RunnerSort } from './runnersStats'

/**
 * Corredores (owner request, 14 November 2026): every runner in the game, the players' careers and
 * the ranking NPCs, to follow how many there are and their levels, countries and sex. Read from the
 * database through `major-ops` (admins only); no account detail reaches the browser.
 */
export function RunnersPanel() {
  return (
    <AdminGate title="Runners">
      <Runners />
    </AdminGate>
  )
}

const SORTS: Record<RunnerSort, string> = {
  level: 'Level',
  name: 'Name',
  country: 'Country',
  lastActive: 'Last active',
}

const dateText = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

function Bars({ title, counts }: { title: string; counts: Count[] }) {
  const max = Math.max(1, ...counts.map((c) => c.players + c.npcs))
  return (
    <section className="runnerBars" aria-label={title}>
      <h3>{title}</h3>
      {counts.map((c) => (
        <div key={c.key} className="barRow">
          <span className="barKey">{c.key}</span>
          <span className="barTrack" aria-hidden="true">
            <span className="barPlayers" style={{ width: `${(c.players / max) * 100}%` }} />
            <span className="barNpcs" style={{ width: `${(c.npcs / max) * 100}%` }} />
          </span>
          <span className="barValue">
            {c.players} · {c.npcs}
          </span>
        </div>
      ))}
    </section>
  )
}

function Runners() {
  const [rows, setRows] = useState<RunnerRow[] | null>(null)
  const [error, setError] = useState('')
  const [kind, setKind] = useState<RunnerKindFilter>('all')
  const [country, setCountry] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<RunnerSort>('level')
  const [allCountries, setAllCountries] = useState(false)

  const load = useCallback(async () => {
    setError('')
    const answer = await majorOps({ action: 'runners' })
    if (answer.ok) setRows(answer.runners as RunnerRow[])
    else setError(errorText(answer.error))
  }, [])

  useEffect(() => {
    // Reading from the server: the state is set when the answer arrives.
    void load()
  }, [load])

  const stats = useMemo(() => (rows ? runnerStats(rows) : null), [rows])
  const shown = useMemo(() => (rows ? sortRunners(filterRunners(rows, { kind, country, search }), sort) : []), [rows, kind, country, search, sort])
  const repeated = new Set(stats?.repeatedNames ?? [])
  const countries = stats?.byCountry.map((c) => c.key).sort() ?? []

  return (
    <div className="majors runners">
      <header className="majorsHead">
        <h2>Runners</h2>
        <span>
          <button type="button" className="ghost small" onClick={() => void load()}>
            Refresh
          </button>{' '}
          <button type="button" className="ghost small" onClick={() => void signOut()}>
            Sign out
          </button>
        </span>
      </header>
      {error && (
        <p className="error" role="alert">
          No pude leer los corredores ({error}).
        </p>
      )}
      {!rows && !error && <p className="loading">Reading the runners…</p>}
      {stats && rows && (
        <>
          <div className="runnerTotals">
            <div>
              <b>{stats.players + stats.npcs}</b>
              <span>runners</span>
            </div>
            <div className="kind-player">
              <b>{stats.players}</b>
              <span>{stats.players === 1 ? 'player' : 'players'} · average level {stats.averageLevel.players ?? '—'}</span>
            </div>
            <div className="kind-npc">
              <b>{stats.npcs}</b>
              <span>NPC · nivel medio {stats.averageLevel.npcs ?? '—'}</span>
            </div>
          </div>
          {stats.repeatedNames.length > 0 && (
            <p className="warning">Nombres de jugador repetidos: {stats.repeatedNames.join(', ')}.</p>
          )}
          <p className="hint">
            <span className="legend barPlayers" /> players · <span className="legend barNpcs" /> NPC (figures: players · NPC)
          </p>
          <div className="runnerCharts">
            <Bars title="By level" counts={stats.byLevel} />
            <div>
              <Bars title="By country" counts={allCountries ? stats.byCountry : stats.byCountry.slice(0, 10)} />
              {stats.byCountry.length > 10 && (
                <button type="button" className="link" onClick={() => setAllCountries(!allCountries)}>
                  {allCountries ? 'Only the first 10' : `All ${stats.byCountry.length} countries`}
                </button>
              )}
            </div>
            <Bars title="By sex" counts={stats.bySex} />
          </div>

          <section className="editPane">
            <div className="runnerFilters">
              <label>
                Kind
                <select value={kind} onChange={(e) => setKind(e.target.value as RunnerKindFilter)}>
                  <option value="all">All</option>
                  <option value="PLAYER">Players</option>
                  <option value="NPC">NPC</option>
                </select>
              </label>
              <label>
                Country
                <select value={country} onChange={(e) => setCountry(e.target.value)}>
                  <option value="">All</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sort by
                <select value={sort} onChange={(e) => setSort(e.target.value as RunnerSort)}>
                  {Object.entries(SORTS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Search
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name" />
              </label>
            </div>
            <p className="hint">{shown.length === 1 ? '1 runner' : `${shown.length} runners`}</p>
            <div className="gridWrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Runner</th>
                    <th>Kind</th>
                    <th>Country</th>
                    <th>Sex</th>
                    <th className="num">Level</th>
                    <th className="num">XP</th>
                    <th className="num">Coins</th>
                    <th className="num">Races</th>
                    <th>Joined</th>
                    <th>Last active</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={`${r.kind}-${r.name}-${i}`}>
                      <td>
                        {r.name}
                        {r.kind === 'PLAYER' && repeated.has(r.name.toLowerCase()) && <span className="tag kind-player"> repeated</span>}
                      </td>
                      <td>
                        <span className={`tag ${r.kind === 'NPC' ? 'kind-npc' : 'kind-player'}`}>{r.kind === 'NPC' ? 'NPC' : 'Player'}</span>
                      </td>
                      <td>{r.country ?? '—'}</td>
                      <td>{r.sex === 'male' ? 'M' : r.sex === 'female' ? 'F' : '—'}</td>
                      <td className="num">{r.level}</td>
                      <td className="num">{r.xp}</td>
                      <td className="num">{r.coins ?? '—'}</td>
                      <td className="num">{r.kind === 'NPC' ? `${r.racesPerWeek}/wk` : r.racesFinished}</td>
                      <td>{dateText(r.createdAt)}</td>
                      <td>{dateText(r.lastActiveAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
