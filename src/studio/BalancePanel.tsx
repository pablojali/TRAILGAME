import { useState } from 'react'
import { newRow, replaceRows, rows, updateRow, type CsvRow } from './csvDoc'
import { BALANCE, validate, type FileId, type Workspace } from './model'

const TITLES: Record<string, string> = {
  levels: 'Levels',
  achievements: 'Challenges',
  points: 'Ranking points',
  raceField: 'Rivals by category',
  npcs: 'Ranking NPC rivals',
}

/** The comment lines at the top of a table: its own explanation of the columns. */
function helpOf(ws: Workspace, id: FileId): string[] {
  return ws.docs[id].lines.flatMap((line) => (line.kind === 'raw' && line.text.trim().startsWith('#') ? [line.text.trim().replace(/^#\s?/, '')] : []))
}

/**
 * The balance tables (owner request, 9 November 2026): levels, challenges, ranking points, the
 * rivals' field by category and the ranking's NPC runners, as editable grids with the table's own
 * notes. Every change is checked with the game's readers before it can be proposed.
 */
export function BalancePanel({ ws, setWs }: { ws: Workspace; setWs(ws: Workspace): void }) {
  const [table, setTable] = useState<FileId>('levels')
  const [filter, setFilter] = useState('')
  const meta = BALANCE.find((b) => b.id === table)!
  const doc = ws.docs[table]
  const all = rows(doc)
  // Race difficulties are edited with the races.
  const shown = all.filter((r) => !(table === 'points' && r.values.kind === 'race')).filter((r) => !filter || Object.values(r.values).join(' ').toLowerCase().includes(filter.toLowerCase()))
  const base = new Map(rows(ws.docsBase[table]).map((r) => [meta.key(r.values), JSON.stringify(r.values)]))
  const errors = validate(ws).filter((e) => e.startsWith(TITLES[table]!) || (table === 'points' && e.startsWith('Ranking points')) || (table === 'npcs' && e.startsWith('Ranking NPC')))

  const set = (row: CsvRow, column: string, value: string) => setWs({ ...ws, docs: { ...ws.docs, [table]: updateRow(doc, (r) => r === row, { [column]: value }) } })
  const remove = (row: CsvRow) => setWs({ ...ws, docs: { ...ws.docs, [table]: replaceRows(doc, all.filter((r) => r !== row)) } })
  const addAfter = (row: CsvRow) => {
    const i = all.indexOf(row)
    const copy = newRow(doc, row.values)
    if (table === 'levels') copy.values.level = String(Number(row.values.level) + 1)
    if (table === 'achievements') copy.values.level = String(Number(row.values.level) + 1)
    if (table === 'points' && row.values.kind === 'position') copy.values.key = String(Number(row.values.key) + 1)
    setWs({ ...ws, docs: { ...ws.docs, [table]: replaceRows(doc, [...all.slice(0, i + 1), copy, ...all.slice(i + 1)]) } })
  }

  return (
    <div className="balance">
      <nav className="chips" aria-label="Tablas">
        {BALANCE.map((b) => (
          <button key={b.id} type="button" aria-pressed={b.id === table} onClick={() => { setTable(b.id); setFilter('') }}>
            {TITLES[b.id]}
          </button>
        ))}
      </nav>
      <section className="editPane">
        <details className="help">
          <summary>What each column is</summary>
          {helpOf(ws, table).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
          {table === 'points' && <p>Each race's difficulty (the «race» rows) is changed in Races.</p>}
          {(table === 'points' || table === 'npcs') && <p>Changing this table adds the rankings migration to the proposal: after publishing, tell Claude to apply it.</p>}
        </details>
        {errors.length > 0 && (
          <div className="error">
            {errors.slice(0, 5).map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        )}
        {table === 'npcs' && <input type="search" className="filter" placeholder="Search rival (name, country, id)…" value={filter} onChange={(e) => setFilter(e.target.value)} />}
        <div className="gridWrap">
          <table className="grid editGrid">
            <thead>
              <tr>
                {doc.header.map((column) => (
                  <th key={column}>{column}</th>
                ))}
                {meta.canAdd && <th />}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, i) => (
                <tr key={i} className={base.get(meta.key(row.values)) === JSON.stringify(row.values) ? '' : 'changedRow'}>
                  {doc.header.map((column) => (
                    <td key={column}>
                      <input aria-label={`${meta.key(row.values)} ${column}`} value={row.values[column] ?? ''} onChange={(e) => set(row, column, e.target.value)} />
                    </td>
                  ))}
                  {meta.canAdd && (
                    <td className="rowActions">
                      <button type="button" className="ghost small" title="Add a row below" onClick={() => addAfter(row)}>
                        +
                      </button>
                      <button type="button" className="ghost small" title="Remove the row" onClick={() => remove(row)}>
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
