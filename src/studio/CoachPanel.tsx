import { useState } from 'react'
import { COACH_TARGETS, COACH_TRIGGERS } from '../features/coach/triggers'
import { newRow, replaceRows, rows, updateRow, type CsvRow } from './csvDoc'
import { SelectField, TextField } from './fields'
import type { Workspace } from './model'

const PORTRAIT = Object.values(import.meta.glob<string>('../../assets/coach/portraits/women_light.webp', { eager: true, query: '?url', import: 'default' }))[0]
const LANGUAGES = [
  ['', 'English'],
  ['_es', 'Español'],
  ['_fr', 'Français'],
  ['_it', 'Italiano'],
  ['_de', 'Deutsch'],
] as const

interface Moment {
  id: string
  rows: CsvRow[]
}

function group(all: CsvRow[]): Moment[] {
  const moments: Moment[] = []
  for (const row of all) {
    const last = moments.at(-1)
    if (last && last.id === row.values.moment) last.rows.push(row)
    else moments.push({ id: row.values.moment!, rows: [row] })
  }
  return moments
}

const list = (value: string | undefined) => (value ?? '').split(/\s+/).filter(Boolean)

/**
 * The Trail Coach's moments (owner request, 9 November 2026): when each appears (a trigger the game
 * knows, after or unless other moments), its steps, what they point at and their texts. A new trigger
 * or screen element is programmed by Claude; the moment can be written meanwhile with "pending".
 */
export function CoachPanel({ ws, setWs, selected, select }: { ws: Workspace; setWs(ws: Workspace): void; selected: string | null; select(id: string): void }) {
  const moments = group(rows(ws.docs.coach))
  const baseIds = new Set(rows(ws.docsBase.coach).map((r) => r.values.moment))
  const baseText = new Map(rows(ws.docsBase.coach).map((r) => [`${r.values.moment}|${r.values.step}`, JSON.stringify(r.values)]))
  const current = moments.find((m) => m.id === selected) ?? moments[0]
  const [preview, setPreview] = useState(0)

  const save = (next: Moment[]) => {
    // Steps numbered 1, 2, 3… in order; trigger, after and unless stay on step 1.
    const flat: CsvRow[] = []
    for (const m of next) {
      const head = m.rows[0]?.values
      m.rows.forEach((row, i) => {
        const values: Record<string, string> = { ...row.values, moment: m.id, step: String(i + 1) }
        if (i === 0) Object.assign(values, { trigger: head?.trigger || 'pending', after: head?.after ?? '', unless: head?.unless ?? '' })
        else Object.assign(values, { trigger: '', after: '', unless: '' })
        const same = Object.keys(values).every((k) => values[k] === (row.values[k] ?? ''))
        flat.push(same ? row : { raw: null, values })
      })
    }
    setWs({ ...ws, docs: { ...ws.docs, coach: replaceRows(ws.docs.coach, flat) } })
  }
  const setStep = (row: CsvRow, changes: Record<string, string>) =>
    setWs({ ...ws, docs: { ...ws.docs, coach: updateRow(ws.docs.coach, (r) => r === row, changes) } })
  const setHead = (changes: Record<string, string>) => current && setStep(current.rows[0]!, changes)

  function addMoment() {
    const name = window.prompt('Nombre del momento (minúsculas y guiones, p. ej. primera-tienda). No se puede cambiar después.')?.trim().toLowerCase()
    if (!name) return
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || moments.some((m) => m.id === name)) {
      window.alert('Usa minúsculas, números y guiones, y un nombre que no exista.')
      return
    }
    const row = newRow(ws.docs.coach, { moment: name, step: '1', trigger: 'pending', title: 'New tip', text: 'Write the text here.', title_es: 'Nuevo consejo', text_es: 'Escribe aquí el texto.' })
    save([...moments, { id: name, rows: [row] }])
    select(name)
  }

  const moveMoment = (by: number) => {
    if (!current) return
    const i = moments.indexOf(current)
    const j = i + by
    if (j < 0 || j >= moments.length) return
    const next = [...moments]
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    save(next)
  }
  const withSteps = (stepsOf: (steps: CsvRow[]) => CsvRow[]) => current && save(moments.map((m) => (m === current ? { ...m, rows: stepsOf(m.rows) } : m)))

  const head = current?.rows[0]?.values
  const others = moments.filter((m) => m !== current).map((m) => m.id)
  const toggleIn = (column: 'after' | 'unless', id: string) => {
    const now = list(head?.[column])
    setHead({ [column]: (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]).join(' ') })
  }
  const shown = current?.rows[Math.min(preview, (current?.rows.length ?? 1) - 1)]?.values

  return (
    <div className="split">
      <section className="listPane" aria-label="Momentos del coach">
        <div className="paneHead">
          <h2>Coach ({moments.length})</h2>
          <button type="button" className="ghost" onClick={addMoment}>
            + Nuevo momento
          </button>
        </div>
        <p className="hint">El coach revisa los momentos en este orden y muestra el primero que toque y no se haya visto. Cada uno sale una sola vez.</p>
        <ol className="momentList">
          {moments.map((m, i) => {
            const trigger = m.rows[0]!.values.trigger!
            const edited = m.rows.some((r) => baseText.get(`${r.values.moment}|${r.values.step}`) !== JSON.stringify(r.values)) || !baseIds.has(m.id)
            return (
              <li key={m.id}>
                <button type="button" aria-pressed={m === current} onClick={() => select(m.id)}>
                  <span className="rowName">
                    {edited && <span className="dot" />}
                    {i + 1}. {m.id}
                  </span>
                  <span className={`rowId${trigger === 'pending' ? ' pendingTag' : ''}`}>
                    {COACH_TRIGGERS[trigger]?.label ?? trigger} · {m.rows.length} paso{m.rows.length > 1 ? 's' : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </section>

      {current && head && (
        <section className="editPane" aria-label={`Editar ${current.id}`}>
          <div className="editHead">
            <div>
              <span className="eyebrow">MOMENTO</span>
              <h2>{current.id}</h2>
            </div>
            <div className="mediaActions">
              <button type="button" className="ghost small" onClick={() => moveMoment(-1)}>
                ↑ Antes
              </button>
              <button type="button" className="ghost small" onClick={() => moveMoment(1)}>
                ↓ Después
              </button>
              {!baseIds.has(current.id) && (
                <button type="button" className="ghost small" onClick={() => save(moments.filter((m) => m !== current))}>
                  Quitar
                </button>
              )}
            </div>
          </div>

          <div className="coachPreview">
            {PORTRAIT && <img src={PORTRAIT} alt="" />}
            <div>
              <span className="eyebrow">TU ENTRENADORA · {Math.min(preview, current.rows.length - 1) + 1}/{current.rows.length}</span>
              <strong>{shown?.title_es || shown?.title}</strong>
              <p>{shown?.text_es || shown?.text}</p>
              {current.rows.length > 1 && (
                <button type="button" className="link" onClick={() => setPreview((p) => (p + 1) % current.rows.length)}>
                  Ver el siguiente paso
                </button>
              )}
            </div>
          </div>

          <h3>Cuándo aparece</h3>
          <div className="form">
            <SelectField
              label="Disparador"
              value={head.trigger!}
              options={Object.entries(COACH_TRIGGERS).map(([value, t]) => ({ value, label: t.label }))}
              onChange={(x) => setHead({ trigger: x })}
              hint={head.trigger === 'pending' ? 'No aparece hasta que Claude programe su disparador: avísale qué debe esperar.' : 'Además, cada paso necesita en pantalla lo que señala.'}
            />
          </div>
          <div className="chipRow">
            <span className="hint">Solo después de ver:</span>
            {others.map((id) => (
              <button key={id} type="button" className="chip" aria-pressed={list(head.after).includes(id)} onClick={() => toggleIn('after', id)}>
                {id}
              </button>
            ))}
          </div>
          <div className="chipRow">
            <span className="hint">Se cancela si ya vio:</span>
            {others.map((id) => (
              <button key={id} type="button" className="chip" aria-pressed={list(head.unless).includes(id)} onClick={() => toggleIn('unless', id)}>
                {id}
              </button>
            ))}
          </div>

          <h3>Pasos</h3>
          {current.rows.map((row, i) => {
            const v = row.values
            const targets = list(v.targets)
            return (
              <div className="stepCard" key={`${current.id}-${i}`}>
                <div className="editHead">
                  <strong>Paso {i + 1}</strong>
                  <div className="mediaActions">
                    <button type="button" className="ghost small" disabled={i === 0} onClick={() => withSteps((s) => { const n = [...s]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; return n })}>
                      ↑
                    </button>
                    <button type="button" className="ghost small" disabled={i === current.rows.length - 1} onClick={() => withSteps((s) => { const n = [...s]; [n[i], n[i + 1]] = [n[i + 1]!, n[i]!]; return n })}>
                      ↓
                    </button>
                    <button type="button" className="ghost small" disabled={current.rows.length === 1} onClick={() => withSteps((s) => s.filter((_, k) => k !== i))}>
                      Quitar
                    </button>
                  </div>
                </div>
                <div className="chipRow">
                  <span className="hint">Señala:</span>
                  {Object.entries(COACH_TARGETS).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className="chip"
                      aria-pressed={targets.includes(id)}
                      onClick={() => setStep(row, { targets: (targets.includes(id) ? targets.filter((t) => t !== id) : [...targets, id]).join(' '), ...(targets.length === 1 && targets[0] === id ? { tap: '' } : {}) })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="check">
                  <input type="checkbox" checked={v.tap === 'yes'} disabled={targets.length === 0} onChange={(e) => setStep(row, { tap: e.target.checked ? 'yes' : '' })} />
                  Espera a que toque lo señalado (solo eso se puede tocar; sin botón Siguiente)
                </label>
                <div className="langGrid">
                  {LANGUAGES.map(([suffix, name]) => (
                    <div className="langBlock" key={suffix}>
                      <span className="langTitle">{name}</span>
                      <TextField label="Título" value={v[`title${suffix}`] ?? ''} placeholder={suffix ? 'vacío = en inglés' : ''} onChange={(x) => setStep(row, { [`title${suffix}`]: x })} wide />
                      <TextField label="Texto" value={v[`text${suffix}`] ?? ''} placeholder={suffix ? 'vacío = en inglés' : ''} onChange={(x) => setStep(row, { [`text${suffix}`]: x })} wide multiline />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          <button
            type="button"
            className="ghost"
            onClick={() => withSteps((s) => [...s, newRow(ws.docs.coach, { moment: current.id, title: 'New step', text: 'Write the text here.', title_es: 'Nuevo paso', text_es: 'Escribe aquí el texto.' })])}
          >
            + Añadir paso
          </button>
          <p className="hint">¿Necesitas que el coach espere otra situación o señale otra cosa de la pantalla? Crea el momento con «Nuevo disparador» y pídeselo a Claude.</p>
        </section>
      )}
    </div>
  )
}
