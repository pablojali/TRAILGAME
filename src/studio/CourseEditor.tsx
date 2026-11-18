import { useState } from 'react'
import { buildCourse, courseLengthKm, courseSegments, courseStats, evenCuts, parseGpx, type Course } from '../domain/races/course'
import { coursePath, workspaceCourse } from './courseFiles'
import { MAX_SEGMENTS, MAX_TECHNICALITY, MIN_SEGMENTS, type CourseSpec } from '../domain/races/races'
import { raceCourse } from '../features/races/courses'
import { Picker } from './MediaPanels'
import type { Workspace } from './model'
import { asUpload, withUploads } from './uploads'

/** The aid stations of the segments, in km from the start of the course. */
function cutsOf(specs: readonly CourseSpec[], course: Course): number[] {
  const total = specs.reduce((sum, s) => sum + s.distanceKm, 0)
  const k = total > 0 ? courseLengthKm(course) / total : 1
  let at = 0
  return specs.slice(0, -1).map((s) => {
    at += s.distanceKm
    return Math.round(at * k * 10) / 10
  })
}

const W = 600
const H = 120

/**
 * The real course (owner design, 18 November 2026): the owner uploads the race's GPX; its profile
 * gives the distance and elevation, and the segments are cut on it with a click at each aid
 * station. Each segment's km, ascent and descent come from the GPX; its technicality is set here.
 * The game keeps reading the segments column, written from the course.
 */
export function CourseEditor({
  ws,
  setWs,
  raceId,
  specs,
  fallbackTechnicality,
  defaultSegments,
  onSpecs,
}: {
  ws: Workspace
  setWs(ws: Workspace): void
  raceId: string
  specs: CourseSpec[] | null
  fallbackTechnicality: number
  defaultSegments: number
  onSpecs(specs: CourseSpec[], ws?: Workspace): void
}) {
  const [error, setError] = useState('')
  const course = workspaceCourse(ws, raceId)

  async function upload(file: File) {
    setError('')
    try {
      const built = buildCourse(parseGpx(await file.text()))
      const json = JSON.stringify(built)
      const next = withUploads(ws, {
        [coursePath(raceId)]: await asUpload(new Blob([json], { type: 'application/json' }), `Recorrido GPX de ${raceId} (${file.name})`),
      })
      const count = Math.min(MAX_SEGMENTS, Math.max(MIN_SEGMENTS, specs?.length ?? defaultSegments))
      const techs = Array.from({ length: count }, (_, i) => specs?.[i]?.technicality ?? fallbackTechnicality)
      onSpecs(courseSegments(built, evenCuts(built, count), techs), next)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (!course) {
    return (
      <section className="segments" aria-label="Recorrido real (GPX)">
        <div className="majorsBar">
          <h3>Recorrido real (GPX)</h3>
          <Picker accept=".gpx,application/gpx+xml" label="Subir GPX" onFile={(file) => void upload(file)} />
        </div>
        <p className="hint">
          Sube el GPX de la carrera: el juego saca de él la distancia, el desnivel y el perfil, y los tramos se cortan sobre el perfil.
        </p>
        {error && <p className="error">{error}</p>}
      </section>
    )
  }

  const segs = specs ?? []
  const cuts = cutsOf(segs, course)
  const techs = segs.map((s) => s.technicality)
  const length = courseLengthKm(course)
  const total = courseStats(course)
  const write = (nextCuts: number[], nextTechs = techs) => {
    const sorted = [...new Set(nextCuts.map((c) => Math.round(c * 10) / 10))].filter((c) => c > 0.3 && c < length - 0.3).sort((a, b) => a - b)
    onSpecs(courseSegments(course, sorted, Array.from({ length: sorted.length + 1 }, (_, i) => nextTechs[i] ?? fallbackTechnicality)))
  }
  const ys = course.points.map((p) => p[1])
  const low = Math.min(...ys)
  const span = Math.max(Math.max(...ys) - low, 100)
  const px = (km: number) => (km / length) * W
  const py = (e: number) => H - 4 - ((e - low) / span) * (H - 14)
  const line = course.points.map(([km, e]) => `${px(km).toFixed(1)},${py(e).toFixed(1)}`).join(' ')

  return (
    <section className="segments" aria-label="Recorrido real (GPX)">
      <div className="majorsBar">
        <h3>Recorrido real (GPX)</h3>
        <Picker accept=".gpx,application/gpx+xml" label="Cambiar GPX" onFile={(file) => void upload(file)} />
        <button
          type="button"
          className="ghost small"
          onClick={() => {
            if (window.confirm('¿Quitar el GPX de esta carrera? Los tramos quedan como están, a mano.')) {
              setWs(withUploads(ws, { [coursePath(raceId)]: raceCourse(raceId) ? { base64: null, label: `Recorrido GPX de ${raceId} (quitado)` } : undefined }))
            }
          }}
        >
          Quitar GPX
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <p className="hint">
        {total.distanceKm} km · D+ {total.gainM} m · D− {total.lossM} m · de {Math.round(low)} a {Math.round(low + Math.max(...ys) - low)} m. Haz clic en el perfil
        para poner un avituallamiento; cada tramo saca sus km y desnivel del GPX.
      </p>
      {segs.length === 0 && (
        <button
          type="button"
          className="primary small"
          onClick={() => {
            const count = Math.min(MAX_SEGMENTS, Math.max(MIN_SEGMENTS, defaultSegments))
            write(evenCuts(course, count), Array.from({ length: count }, () => fallbackTechnicality))
          }}
        >
          Cortar en tramos iguales
        </button>
      )}
      <svg
        className="profile courseEdit"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Perfil del GPX: clic para añadir un avituallamiento"
        onClick={(e) => {
          if (segs.length >= MAX_SEGMENTS) return
          const box = e.currentTarget.getBoundingClientRect()
          const km = ((e.clientX - box.left) / box.width) * length
          // The new segment takes the technicality of the one it splits.
          const index = cuts.filter((c) => c < km).length
          write([...cuts, km], [...techs.slice(0, index + 1), techs[index] ?? fallbackTechnicality, ...techs.slice(index + 1)])
        }}
      >
        <polygon points={`0,${H} ${line} ${W},${H}`} />
        <polyline points={line} />
        {cuts.map((c, i) => (
          <g key={i}>
            <line x1={px(c)} x2={px(c)} y1={0} y2={H} className="aidLine" />
            <text x={px(c) + 3} y={12} className="aidText">
              A{i + 1}
            </text>
          </g>
        ))}
      </svg>
      <div className="gridWrap">
        <table className="grid segmentGrid">
          <thead>
            <tr>
              <th>Tramo</th>
              <th>Llega a (km)</th>
              <th>km</th>
              <th>D+ (m)</th>
              <th>D− (m)</th>
              <th>Técnica</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {segs.map((spec, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  {i < cuts.length ? (
                    <input
                      type="number"
                      inputMode="decimal"
                      step={0.1}
                      aria-label={`Avituallamiento ${i + 1}: km`}
                      value={cuts[i]}
                      onChange={(e) => write(cuts.map((c, k) => (k === i ? Number(e.target.value) || c : c)))}
                    />
                  ) : (
                    <span className="hint">meta ({length.toFixed(1)})</span>
                  )}
                </td>
                <td className="num">{spec.distanceKm}</td>
                <td className="num">{spec.gainM}</td>
                <td className="num">{spec.lossM}</td>
                <td>
                  <select
                    aria-label={`Tramo ${i + 1}: técnica`}
                    value={spec.technicality}
                    onChange={(e) => write(cuts, techs.map((t, k) => (k === i ? Number(e.target.value) : t)))}
                  >
                    {Array.from({ length: MAX_TECHNICALITY + 1 }, (_, t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {i < cuts.length && (
                    <button
                      type="button"
                      className="ghost small"
                      disabled={segs.length <= MIN_SEGMENTS}
                      onClick={() => write(cuts.filter((_, k) => k !== i), techs.filter((_, k) => k !== i + 1))}
                      title="Quita este avituallamiento (une los dos tramos)"
                    >
                      Quitar avit.
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <span className="hint">
          {segs.length} tramos · {Math.max(0, segs.length - 1)} avituallamientos · {MIN_SEGMENTS}–{MAX_SEGMENTS} tramos
        </span>
      </div>
    </section>
  )
}
