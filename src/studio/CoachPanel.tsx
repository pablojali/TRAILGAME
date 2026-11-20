import { useState } from 'react'
import { COACH_TARGETS, COACH_TRIGGERS } from '../features/coach/triggers'
import { newRow, replaceRows, rows, updateRow, type CsvRow } from './csvDoc'
import { SelectField, TextField } from './fields'
import type { Workspace } from './model'

const PORTRAIT = Object.values(import.meta.glob<string>('../../assets/coach/portraits/women_light.webp', { eager: true, query: '?url', import: 'default' }))[0]
const LANGUAGES = [
  ['', 'English'],
  ['_es', 'Spanish'],
  ['_fr', 'French'],
  ['_it', 'Italian'],
  ['_de', 'German'],
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
    const name = window.prompt('Name of the moment (lower case and hyphens, e.g. first-shop). It cannot be changed later.')?.trim().toLowerCase()
    if (!name) return
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || moments.some((m) => m.id === name)) {
      window.alert('Use lower case, digits and hyphens, and a name that does not exist yet.')
      return
    }
    const row = newRow(ws.docs.coach, { moment: name, step: '1', trigger: 'pending', title: 'New tip', text: 'Write the text here.' })
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
      <section className="listPane" aria-label="Coach moments">
        <div className="paneHead">
          <h2>Coach ({moments.length})</h2>
          <button type="button" className="ghost" onClick={addMoment}>
            + New moment
          </button>
        </div>
        <p className="hint">The coach checks the moments in this order and shows the first one that fits and has not been seen. Each shows once.</p>
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
                    {COACH_TRIGGERS[trigger]?.label ?? trigger} · {m.rows.length} step{m.rows.length > 1 ? 's' : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </section>

      {current && head && (
        <section className="editPane" aria-label={`Edit ${current.id}`}>
          <div className="editHead">
            <div>
              <span className="eyebrow">MOMENT</span>
              <h2>{current.id}</h2>
            </div>
            <div className="mediaActions">
              <button type="button" className="ghost small" onClick={() => moveMoment(-1)}>
                ↑ Earlier
              </button>
              <button type="button" className="ghost small" onClick={() => moveMoment(1)}>
                ↓ Later
              </button>
              {!baseIds.has(current.id) && (
                <button type="button" className="ghost small" onClick={() => save(moments.filter((m) => m !== current))}>
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="coachPreview">
            {PORTRAIT && <img src={PORTRAIT} alt="" />}
            <div>
              <span className="eyebrow">YOUR COACH · {Math.min(preview, current.rows.length - 1) + 1}/{current.rows.length}</span>
              <strong>{shown?.title || shown?.title_es}</strong>
              <p>{shown?.text || shown?.text_es}</p>
              {current.rows.length > 1 && (
                <button type="button" className="link" onClick={() => setPreview((p) => (p + 1) % current.rows.length)}>
                  See the next step
                </button>
              )}
            </div>
          </div>

          <h3>When it shows</h3>
          <div className="form">
            <SelectField
              label="Trigger"
              value={head.trigger!}
              options={Object.entries(COACH_TRIGGERS).map(([value, t]) => ({ value, label: t.label }))}
              onChange={(x) => setHead({ trigger: x })}
              hint={head.trigger === 'pending' ? 'It does not show until Claude programs its trigger: tell Claude what it must wait for.' : 'Each step also needs what it points at on the screen.'}
            />
          </div>
          <div className="chipRow">
            <span className="hint">Only after seeing:</span>
            {others.map((id) => (
              <button key={id} type="button" className="chip" aria-pressed={list(head.after).includes(id)} onClick={() => toggleIn('after', id)}>
                {id}
              </button>
            ))}
          </div>
          <div className="chipRow">
            <span className="hint">Cancelled if already seen:</span>
            {others.map((id) => (
              <button key={id} type="button" className="chip" aria-pressed={list(head.unless).includes(id)} onClick={() => toggleIn('unless', id)}>
                {id}
              </button>
            ))}
          </div>

          <h3>Steps</h3>
          {current.rows.map((row, i) => {
            const v = row.values
            const targets = list(v.targets)
            return (
              <div className="stepCard" key={`${current.id}-${i}`}>
                <div className="editHead">
                  <strong>Step {i + 1}</strong>
                  <div className="mediaActions">
                    <button type="button" className="ghost small" disabled={i === 0} onClick={() => withSteps((s) => { const n = [...s]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; return n })}>
                      ↑
                    </button>
                    <button type="button" className="ghost small" disabled={i === current.rows.length - 1} onClick={() => withSteps((s) => { const n = [...s]; [n[i], n[i + 1]] = [n[i + 1]!, n[i]!]; return n })}>
                      ↓
                    </button>
                    <button type="button" className="ghost small" disabled={current.rows.length === 1} onClick={() => withSteps((s) => s.filter((_, k) => k !== i))}>
                      Remove
                    </button>
                  </div>
                </div>
                <div className="chipRow">
                  <span className="hint">Points at:</span>
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
                  Waits for a tap on what it points at (only that can be tapped; no Next button)
                </label>
                <div className="langGrid">
                  {LANGUAGES.map(([suffix, name]) => (
                    <div className="langBlock" key={suffix}>
                      <span className="langTitle">{name}</span>
                      <TextField label="Title" value={v[`title${suffix}`] ?? ''} placeholder={suffix ? 'empty = English' : ''} onChange={(x) => setStep(row, { [`title${suffix}`]: x })} wide />
                      <TextField label="Text" value={v[`text${suffix}`] ?? ''} placeholder={suffix ? 'empty = English' : ''} onChange={(x) => setStep(row, { [`text${suffix}`]: x })} wide multiline />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          <button
            type="button"
            className="ghost"
            onClick={() => withSteps((s) => [...s, newRow(ws.docs.coach, { moment: current.id, title: 'New step', text: 'Write the text here.' })])}
          >
            + Add step
          </button>
          <p className="hint">Need the coach to wait for another situation or point at something else on screen? Create the moment with «New trigger» and ask Claude.</p>
        </section>
      )}
    </div>
  )
}
