import { useEffect, useState } from 'react'
import type { MajorReport as Report } from '../server/majorOps'
import { majorOps } from './majorClient'

const playersText = (n: number) => `${n} ${n === 1 ? 'jugador' : 'jugadores'}`

function timeText(seconds: number | null): string {
  if (seconds === null) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Post-race report of a Sunday Major (owner request, 11 November 2026): how many players and NPCs
 * raced each category, and the final standings with who was an NPC. Players never see this: in the
 * game an NPC is only hinted by a name ending with a full stop.
 */
export function MajorReport({ eventId, name, onClose }: { eventId: string; name: string; onClose(): void }) {
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    // Reading from the server: the state is set when the answer arrives.
    void majorOps({ action: 'event-report', id: eventId }).then((answer) => {
      if (!alive) return
      if (answer.ok) setReport(answer.report as Report)
      else setError(answer.error)
    })
    return () => {
      alive = false
    }
  }, [eventId])

  const players = report?.categories.reduce((sum, c) => sum + c.players, 0) ?? 0
  const npcs = report?.categories.reduce((sum, c) => sum + c.npcs, 0) ?? 0

  return (
    <section className="majorReport" aria-label={`Informe de ${name}`}>
      <div className="majorsBar">
        <h3>Informe · {name}</h3>
        <button type="button" className="ghost small" onClick={onClose}>
          Cerrar informe
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          No se pudo leer el informe ({error}).
        </p>
      )}
      {!report && !error && <p className="loading">Leyendo el informe…</p>}
      {report && (
        <>
          <p className="reportTotals">
            <b>{players}</b> {players === 1 ? 'jugador' : 'jugadores'} · <b>{npcs}</b> NPC en {report.categories.length} {report.categories.length === 1 ? 'categoría' : 'categorías'}
          </p>
          {report.categories.map((category) => (
            <details key={category.idx} open={report.categories.length === 1}>
              <summary>
                <b>{category.name}</b> · {playersText(category.players)} · {category.npcs} NPC
                {category.phase !== 'FINISHED' && <span className="hint"> · en carrera</span>}
              </summary>
              <div className="gridWrap">
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Pos.</th>
                      <th>Corredor</th>
                      <th>Tipo</th>
                      <th>Nivel</th>
                      <th>Tiempo</th>
                      <th>En su carrera</th>
                    </tr>
                  </thead>
                  <tbody>
                    {category.rows.map((row) => (
                      <tr key={row.slot}>
                        <td>{row.position ?? '—'}</td>
                        <td>
                          {row.name}
                          {row.country && <span className="hint"> · {row.country}</span>}
                        </td>
                        <td>
                          <span className={`tag ${row.kind === 'NPC' ? 'kind-npc' : 'kind-player'}`}>{row.kind === 'NPC' ? 'NPC' : 'Jugador'}</span>
                        </td>
                        <td>{row.level}</td>
                        <td>{timeText(row.timeS)}</td>
                        <td>{row.claimed === null ? '—' : row.claimed ? 'Sí' : 'Pendiente'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </>
      )}
    </section>
  )
}
