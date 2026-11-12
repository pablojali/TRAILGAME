import { useMemo } from 'react'
import { getMaximumLevel, getMinimumLevel } from '../domain/races/access'
import { formatSegments, parseRaces, parseSegments, segmentsDistanceKm, MAX_SEGMENTS, MAX_TECHNICALITY, MIN_SEGMENTS, RACE_LANGUAGES, type CourseSpec, type Race } from '../domain/races/races'
import { RACE_CATEGORIES } from '../domain/races/categories'
import { racePaces, stopSeconds } from '../domain/races/strategyConfig'
import { getRaceField, getRaceSegments, getReferenceFinishS, getSegmentCount } from '../game-engine/raceEngine'
import { courseEffortKm, generateCourse } from '../game-engine/raceSimulation'
import { insertRow, rows, serializeDoc, updateRow, type CsvDoc } from './csvDoc'
import { NumberField, Pips, PipsField, SelectField, TextField } from './fields'
import { RaceMedia } from './MediaPanels'
import type { Workspace } from './model'

const DIFFICULTIES = ['I', 'II', 'III', 'IV', 'V']
const CATEGORY_LABELS: Record<string, string> = { open: 'Open', trail: 'Trail', mountain: 'Mountain', elite: 'Elite' }
const STOP_LABELS = { quick: 'rápida', normal: 'normal', slow: 'larga' } as const
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

export function RacesPanel({
  token,
  ws,
  setWs,
  selected,
  select,
}: {
  token: string
  ws: Workspace
  setWs(ws: Workspace): void
  selected: string | null
  select(id: string): void
}) {
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
  /** The segments set by hand, as written (null: automatic, or not readable). */
  const specs: CourseSpec[] | null = (() => {
    if (!v?.segments) return null
    try {
      return parseSegments(v.segments, '')
    } catch {
      return v.segments.split('|').map((part) => {
        const [km, gain, loss, tech] = part.split(':').map(Number)
        return { distanceKm: km || 0, gainM: gain || 0, lossM: loss || 0, technicality: tech || 0 }
      })
    }
  })()
  /** Writes the segments and the totals that come from them. */
  const setSpecs = (next: CourseSpec[]) =>
    setRace({
      segments: formatSegments(next),
      distance_km: String(segmentsDistanceKm(next)),
      elevation_gain_m: String(next.reduce((sum, s) => sum + s.gainM, 0)),
      technicality: String(Math.max(0, ...next.map((s) => s.technicality))),
    })
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
                  {race.minLevel === undefined && race.maxLevel === undefined ? ' (auto)' : ''}
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
                  {Object.values(getRaceField(race).stopS)
                    .map((s) => `${s}s`)
                    .join(' / ')}
                  {race.stopS ? '' : ' (auto)'}
                </dd>
              </div>
            </dl>
          )}

          <h3>Recorrido</h3>
          <div className="form">
            {specs ? (
              <>
                <p className="hint wideHint">
                  Distancia {v.distance_km} km · D+ {v.elevation_gain_m} m · técnica máxima {v.technicality}: la suma de los tramos.
                </p>
              </>
            ) : (
              <>
                <NumberField label="Distancia (km)" value={v.distance_km!} min={1} onChange={(x) => setRace({ distance_km: x })} />
                <NumberField label="Desnivel positivo (m)" value={v.elevation_gain_m!} min={0} step={10} onChange={(x) => setRace({ elevation_gain_m: x })} />
                <PipsField
                  label="Técnica de las bajadas"
                  value={Number(v.technicality) || 0}
                  max={MAX_TECHNICALITY}
                  onChange={(x) => setRace({ technicality: String(x) })}
                  hint="0 nada técnica · 5 extrema"
                />
              </>
            )}
            <NumberField
              label="Nivel recomendado"
              value={v.recommended_level!}
              min={1}
              onChange={(x) => setRace({ recommended_level: x })}
              hint={levelChanged ? 'Cambia los rankings: se añadirá la migración' : 'El nivel de la carrera'}
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

          <Segments
            race={race}
            specs={specs}
            onChange={setSpecs}
            onAuto={() => setRace({ segments: '' })}
          />

          <h3>Inscripción y paradas</h3>
          <div className="form">
            <NumberField
              label="Nivel mínimo"
              value={v.min_level ?? ''}
              min={1}
              onChange={(x) => setRace({ min_level: x })}
              hint={`vacío = automático (${race ? getMinimumLevel({ ...race, minLevel: undefined }) : '—'})`}
            />
            <NumberField
              label="Nivel máximo"
              value={v.max_level ?? ''}
              min={1}
              onChange={(x) => setRace({ max_level: x })}
              hint={`vacío = automático (${race ? getMaximumLevel({ ...race, maxLevel: undefined }) : '—'})`}
            />
            {(['quick', 'normal', 'slow'] as const).map((stop) => (
              <NumberField
                key={stop}
                label={`Parada ${STOP_LABELS[stop]} (s)`}
                value={v[`stop_${stop}_s`] ?? ''}
                min={0}
                step={5}
                onChange={(x) => setRace({ [`stop_${stop}_s`]: x })}
                hint={`vacío = automático (${stopSeconds(effort)[stop]} s) · las tres o ninguna`}
              />
            ))}
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

          {race && <RaceMedia token={token} ws={ws} setWs={setWs} raceId={race.id} segments={getSegmentCount(race)} />}
        </section>
      )}
    </div>
  )
}

/** A segment's climbing and descending per km, e.g. "+62 / −15 m/km". */
function perKm(spec: CourseSpec): string {
  if (!(spec.distanceKm > 0)) return '—'
  return `+${Math.round(spec.gainM / spec.distanceKm)} / −${Math.round(spec.lossM / spec.distanceKm)} m/km`
}

/**
 * The course's segments (owner request, 12 November 2026): automatic (cut every ~6 km from the
 * totals), or set by hand, each one with its distance, ascent, descent and descent technicality; an
 * aid station between two. Adding or removing a segment adds or removes an aid station.
 */
function Segments({
  race,
  specs,
  onChange,
  onAuto,
}: {
  race: Race | undefined
  specs: CourseSpec[] | null
  onChange(next: CourseSpec[]): void
  onAuto(): void
}) {
  const fromAuto = (): CourseSpec[] => {
    if (!race) return []
    const segments = getRaceSegments(race)
    const specs = segments.map((s) => ({
      distanceKm: Math.round(s.distanceM / 100) / 10,
      gainM: Math.round(s.gainM),
      lossM: Math.round(s.lossM),
      technicality: s.technicality,
    }))
    // Whole metres of ascent that still add up to the race's.
    const gainGap = race.elevationGainM - specs.reduce((sum, s) => sum + s.gainM, 0)
    if (specs.length) specs[specs.length - 1]!.gainM += gainGap
    // Tenths of a km that still add up to the race's distance.
    const kmGap = Math.round((race.distanceKm - specs.reduce((sum, s) => sum + s.distanceKm, 0)) * 10) / 10
    if (specs.length) specs[specs.length - 1]!.distanceKm = Math.round((specs[specs.length - 1]!.distanceKm + kmGap) * 10) / 10
    return specs
  }
  const set = (i: number, change: Partial<CourseSpec>) => specs && onChange(specs.map((s, k) => (k === i ? { ...s, ...change } : s)))
  const num = (text: string) => (text === '' ? 0 : Number(text))

  return (
    <section className="segments" aria-label="Tramos y avituallamientos">
      <div className="majorsBar">
        <h3>Tramos y avituallamientos</h3>
        {specs ? (
          <button type="button" className="ghost small" onClick={onAuto}>
            Volver a tramos automáticos
          </button>
        ) : (
          <button type="button" className="primary small" disabled={!race} onClick={() => onChange(fromAuto())}>
            Definir tramos a mano
          </button>
        )}
      </div>
      {!specs ? (
        <p className="hint">
          Automáticos: {race ? getSegmentCount(race) : '—'} tramos de la misma distancia, perfil generado del total. Pulsa «Definir tramos a mano» para
          partir de ellos y ajustar cada tramo.
        </p>
      ) : (
        <div className="gridWrap">
          <table className="grid segmentGrid">
            <thead>
              <tr>
                <th>Tramo</th>
                <th>km</th>
                <th>D+ (m)</th>
                <th>D− (m)</th>
                <th>Técnica</th>
                <th>Desnivel por km</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {specs.map((spec, i) => (
                <tr key={i}>
                  <td>
                    {i + 1}
                    {i < specs.length - 1 && <span className="hint"> · avit. {i + 1}</span>}
                  </td>
                  <td>
                    <input type="number" inputMode="decimal" step={0.1} min={0.5} aria-label={`Tramo ${i + 1}: km`} value={spec.distanceKm} onChange={(e) => set(i, { distanceKm: num(e.target.value) })} />
                  </td>
                  <td>
                    <input type="number" step={10} min={0} aria-label={`Tramo ${i + 1}: D+`} value={spec.gainM} onChange={(e) => set(i, { gainM: Math.round(num(e.target.value)) })} />
                  </td>
                  <td>
                    <input type="number" step={10} min={0} aria-label={`Tramo ${i + 1}: D−`} value={spec.lossM} onChange={(e) => set(i, { lossM: Math.round(num(e.target.value)) })} />
                  </td>
                  <td>
                    <select aria-label={`Tramo ${i + 1}: técnica`} value={spec.technicality} onChange={(e) => set(i, { technicality: Number(e.target.value) })}>
                      {Array.from({ length: MAX_TECHNICALITY + 1 }, (_, t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num">{perKm(spec)}</td>
                  <td>
                    <button
                      type="button"
                      className="ghost small"
                      disabled={specs.length <= MIN_SEGMENTS}
                      onClick={() => onChange(specs.filter((_, k) => k !== i))}
                      title="Quita el tramo (y un avituallamiento)"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="majorsBar">
            <button
              type="button"
              className="ghost small"
              disabled={specs.length >= MAX_SEGMENTS}
              onClick={() => onChange([...specs, { distanceKm: 5, gainM: 0, lossM: 0, technicality: 0 }])}
            >
              + Añadir tramo (y un avituallamiento)
            </button>
            <span className="hint">
              {specs.length} tramos · {specs.length - 1} avituallamientos · {MIN_SEGMENTS}–{MAX_SEGMENTS} tramos
            </span>
          </div>
        </div>
      )}
    </section>
  )
}
