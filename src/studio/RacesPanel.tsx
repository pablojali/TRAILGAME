import { useMemo } from 'react'
import { getMaximumLevel, getMinimumLevel } from '../domain/races/access'
import { parseRaces, MAX_TECHNICALITY, RACE_LANGUAGES, type Race } from '../domain/races/races'
import { RACE_CATEGORIES } from '../domain/races/categories'
import { racePaces, stopSeconds } from '../domain/races/strategyConfig'
import { getReferenceFinishS, getSegmentCount } from '../game-engine/raceEngine'
import { courseEffortKm, generateCourse } from '../game-engine/raceSimulation'
import { insertRow, rows, serializeDoc, updateRow, type CsvDoc } from './csvDoc'
import { NumberField, Pips, PipsField, SelectField, TextField } from './fields'
import type { Workspace } from './model'

const DIFFICULTIES = ['I', 'II', 'III', 'IV', 'V']
const CATEGORY_LABELS: Record<string, string> = { open: 'Open', trail: 'Trail', mountain: 'Mountain', elite: 'Elite' }
const LANGUAGE_LABELS: Record<string, string> = { es: 'Español', fr: 'Français', it: 'Italiano', de: 'Deutsch' }

/** One race read by the game's own reader, or the game's complaint about it. */
function readRace(doc: CsvDoc, values: Record<string, string>): { race?: Race; error?: string } {
  const text = serializeDoc({ header: doc.header, lines: [{ kind: 'header', text: `${doc.header.join(',')}\n` }, { kind: 'row', row: { raw: null, values } }] })
  try {
    return { race: parseRaces(text)[0]! }
  } catch (error) {
    return { error: (error as Error).message.replace(/^races\.csv row 1: /, '') }
  }
}

function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  return h ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}:${String(s).padStart(2, '0')}`
}

function Profile({ race }: { race: Race }) {
  const course = generateCourse(race)
  const points: [number, number][] = [[0, 0]]
  let x = 0
  let y = 0
  for (const segment of course) {
    x += segment.lengthM
    y += segment.gainM - segment.lossM
    points.push([x, y])
  }
  const minY = Math.min(...points.map((p) => p[1]))
  const maxY = Math.max(...points.map((p) => p[1]), minY + 50)
  const W = 300
  const H = 70
  const px = (v: number) => (v / x) * W
  const py = (v: number) => H - 4 - ((v - minY) / (maxY - minY)) * (H - 12)
  const line = points.map(([a, b]) => `${px(a).toFixed(1)},${py(b).toFixed(1)}`).join(' ')
  return (
    <svg className="profile" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Perfil de desnivel">
      <polygon points={`0,${H} ${line} ${W},${H}`} />
      <polyline points={line} />
    </svg>
  )
}

export function RacesPanel({ ws, setWs, selected, select }: { ws: Workspace; setWs(ws: Workspace): void; selected: string | null; select(id: string): void }) {
  const raceRows = rows(ws.docs.races)
  const difficulty = new Map(rows(ws.docs.points).filter((r) => r.values.kind === 'race').map((r) => [r.values.key!, r.values.value!]))
  const baseRows = useMemo(() => new Map(rows(ws.docsBase.races).map((r) => [r.values.id!, JSON.stringify(r.values)])), [ws.docsBase])
  const baseDifficulty = useMemo(
    () => new Map(rows(ws.docsBase.points).filter((r) => r.values.kind === 'race').map((r) => [r.values.key!, r.values.value!])),
    [ws.docsBase],
  )
  const sorted = [...raceRows].sort((a, b) => Number(a.values.recommended_level) - Number(b.values.recommended_level) || a.values.id!.localeCompare(b.values.id!))
  const current = raceRows.find((r) => r.values.id === selected) ?? sorted[0]
  const edited = (id: string, values: Record<string, string>) => baseRows.get(id) !== JSON.stringify(values) || baseDifficulty.get(id) !== difficulty.get(id)

  const setRace = (changes: Record<string, string>) =>
    current && setWs({ ...ws, docs: { ...ws.docs, races: updateRow(ws.docs.races, (r) => r.values.id === current.values.id, changes) } })
  const setDifficulty = (value: string) =>
    current &&
    setWs({ ...ws, docs: { ...ws.docs, points: updateRow(ws.docs.points, (r) => r.values.kind === 'race' && r.values.key === current.values.id, { value }) } })

  function addRace() {
    const next = Math.max(...raceRows.map((r) => Number(r.values.id!.slice(5)))) + 1
    const id = `RACE-${String(next).padStart(3, '0')}`
    const races = insertRow(ws.docs.races, {
      id,
      name: 'Nueva carrera',
      category: 'open',
      distance_km: '10',
      elevation_gain_m: '300',
      recommended_level: '5',
      technicality: '1',
      terrain: 'Forest trails',
    })
    const points = insertRow(ws.docs.points, { kind: 'race', key: id, value: 'I' }, (r) => r.values.kind === 'race')
    setWs({ ...ws, docs: { ...ws.docs, races, points } })
    select(id)
  }

  const v = current?.values
  const read = current ? readRace(ws.docs.races, current.values) : {}
  const race = read.race
  const effort = race ? courseEffortKm(generateCourse(race)) : 0
  const levelChanged = v && baseRows.has(v.id!) && JSON.parse(baseRows.get(v.id!)!).recommended_level !== v.recommended_level
  const difficultyChanged = v && baseDifficulty.has(v.id!) && baseDifficulty.get(v.id!) !== difficulty.get(v.id!)

  return (
    <div className="split">
      <section className="listPane" aria-label="Carreras">
        <div className="paneHead">
          <h2>Carreras ({raceRows.length})</h2>
          <button type="button" className="ghost" onClick={addRace}>
            + Nueva carrera
          </button>
        </div>
        <table className="grid">
          <thead>
            <tr>
              <th>Nivel</th>
              <th>Carrera</th>
              <th>Dif.</th>
              <th>km</th>
              <th>D+</th>
              <th>Técnica</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const r = row.values
              return (
                <tr key={r.id} aria-selected={r.id === current?.values.id} onClick={() => select(r.id!)}>
                  <td className="num">{r.recommended_level}</td>
                  <td>
                    <span className="rowName">
                      {edited(r.id!, r) && <span className="dot" title="Cambiada" />}
                      {r.name}
                    </span>
                    <span className="rowId">{r.id}</span>
                  </td>
                  <td>{difficulty.get(r.id!) ?? '—'}</td>
                  <td className="num">{r.distance_km}</td>
                  <td className="num">{r.elevation_gain_m}</td>
                  <td>
                    <Pips value={Number(r.technicality) || 0} max={MAX_TECHNICALITY} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {v && (
        <section className="editPane" aria-label={`Editar ${v.name}`}>
          <div className="editHead">
            <div>
              <span className="eyebrow">{v.id}</span>
              <h2>{v.name || 'Sin nombre'}</h2>
            </div>
          </div>

          <div className="preview raceCard">
            <div className="raceCardBody">
              <strong>{v.name}</strong>
              <span>
                {v.distance_km} km · {v.elevation_gain_m} m D+
              </span>
              <span className="tags">
                <span className="tag">Nv {v.recommended_level}</span>
                <span className="tag">
                  Técnica <Pips value={Number(v.technicality) || 0} max={MAX_TECHNICALITY} />
                </span>
                <span className="tag">
                  {Number(v.distance_km) > 42 ? 'Ultra' : 'Trail'} · {difficulty.get(v.id!) ?? '?'}
                </span>
              </span>
            </div>
            {race && <Profile race={race} />}
          </div>

          {read.error && <p className="error">El juego no aceptaría esta carrera: {read.error}</p>}
          {race && (
            <dl className="facts">
              <div>
                <dt>Esfuerzo</dt>
                <dd>{effort.toFixed(1)} km-esf.</dd>
              </div>
              <div>
                <dt>Desnivel por km</dt>
                <dd>{Math.round(race.elevationGainM / race.distanceKm)} m</dd>
              </div>
              <div>
                <dt>Tramos</dt>
                <dd>
                  {getSegmentCount(race)} ({getSegmentCount(race) - 1} avituall.)
                </dd>
              </div>
              <div>
                <dt>Inscripción</dt>
                <dd>
                  niveles {getMinimumLevel(race)}–{getMaximumLevel(race)}
                </dd>
              </div>
              <div>
                <dt>Tiempo de referencia</dt>
                <dd>{clock(getReferenceFinishS(race))}</dd>
              </div>
              <div>
                <dt>Ganador / último</dt>
                <dd>
                  {clock(effort * racePaces(effort).winner * 60)} / {clock(effort * racePaces(effort).last * 60)}
                </dd>
              </div>
              <div>
                <dt>Paradas (rápida/normal/lenta)</dt>
                <dd>
                  {Object.values(stopSeconds(effort))
                    .map((s) => `${s}s`)
                    .join(' / ')}
                </dd>
              </div>
            </dl>
          )}

          <h3>Recorrido</h3>
          <div className="form">
            <NumberField label="Distancia (km)" value={v.distance_km!} min={1} onChange={(x) => setRace({ distance_km: x })} />
            <NumberField label="Desnivel positivo (m)" value={v.elevation_gain_m!} min={0} step={10} onChange={(x) => setRace({ elevation_gain_m: x })} />
            <PipsField
              label="Técnica de las bajadas"
              value={Number(v.technicality) || 0}
              max={MAX_TECHNICALITY}
              onChange={(x) => setRace({ technicality: String(x) })}
              hint="0 nada técnica · 5 extrema"
            />
            <NumberField
              label="Nivel recomendado"
              value={v.recommended_level!}
              min={1}
              onChange={(x) => setRace({ recommended_level: x })}
              hint={levelChanged ? 'Cambia los rankings: se añadirá la migración' : 'Inscripción de 5 niveles menos a 2 más'}
            />
            <SelectField
              label="Dificultad (puntos de ranking)"
              value={difficulty.get(v.id!) ?? 'I'}
              options={DIFFICULTIES.map((d) => ({ value: d, label: d }))}
              onChange={setDifficulty}
              hint={difficultyChanged ? 'Cambia los rankings: se añadirá la migración' : 'I moderada · V extrema'}
            />
            <SelectField
              label="Categoría interna"
              value={v.category!}
              options={RACE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] ?? c }))}
              onChange={(x) => setRace({ category: x })}
              hint="No se muestra: decide XP, premios y rivales"
            />
          </div>

          <h3>Nombre y terreno</h3>
          <div className="form">
            <TextField label="Nombre" value={v.name!} onChange={(x) => setRace({ name: x })} wide />
            <TextField label="Terreno (English)" value={v.terrain!} onChange={(x) => setRace({ terrain: x })} wide />
            {RACE_LANGUAGES.map((language) => (
              <TextField
                key={language}
                label={`Terreno (${LANGUAGE_LABELS[language]})`}
                value={v[`terrain_${language}`] ?? ''}
                placeholder="vacío = en inglés"
                onChange={(x) => setRace({ [`terrain_${language}`]: x })}
                wide
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
