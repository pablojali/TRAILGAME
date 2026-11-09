import { useState } from 'react'
import { newRow, replaceRows, rows, updateRow } from './csvDoc'
import { SelectField, TextField } from './fields'
import type { TextFile, TextValue, Workspace } from './model'
import { TextsPanel } from './TextsPanel'

const LANGUAGES = [
  ['', 'English'],
  ['_es', 'Español'],
  ['_fr', 'Français'],
  ['_it', 'Italiano'],
  ['_de', 'Deutsch'],
] as const
const LINKS = [
  ['', 'Ninguno (solo el mensaje)'],
  ['/', 'Inicio'],
  ['/training', 'Entreno'],
  ['/equipment', 'Equipo'],
  ['/equipment?tab=shop', 'Tienda'],
  ['/races', 'Carreras'],
  ['/career', 'Trayectoria'],
  ['/career?tab=achievements', 'Desafíos'],
  ['/settings', 'Ajustes'],
]
const AUTOMATIC: [string, string][] = [
  ['Resultado de carrera', 'Al terminar cada carrera: puesto y puntos de ranking.'],
  ['Desafío completado', 'Al alcanzar cada nivel de un desafío.'],
  ['Subida de nivel', 'Al subir de nivel (puntos de atributo para repartir).'],
  ['Nueva temporada', 'Cada mes, al empezar la temporada de ranking.'],
  ['Día de carrera', 'El domingo de una carrera inscrita.'],
  ['Forma perdida', 'Al volver después de días sin jugar (el texto está en Común · notice.decay).'],
  ['Guardado en la nube', 'Si el progreso no se pudo guardar, o se recuperó de otro dispositivo.'],
  ['Top 10 del ranking', 'Al entrar, subir, bajar o salir del top 10 mundial o del país.'],
]

/** "2026-11-10T09:00Z" ↔ the local date and time of a datetime-local input. */
function toLocal(utc: string): string {
  if (!utc) return ''
  const d = new Date(utc)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
function toUtc(local: string): string {
  return local ? `${new Date(local).toISOString().slice(0, 16)}Z` : ''
}

function status(from: string, until: string, now: number): { text: string; tone: string } {
  if (Date.parse(from) > now) return { text: 'Programado', tone: 'scheduled' }
  if (until && Date.parse(until) <= now) return { text: 'Terminado', tone: 'ended' }
  return { text: 'Activo', tone: 'live' }
}

/**
 * Notifications (owner request, 9 November 2026): announcements to every player (shown in every
 * Inbox between two dates; open games receive them within minutes of publishing) and the texts of
 * the game's automatic notifications (their rules are the game's).
 */
export function NotificationsPanel(props: {
  token: string
  ws: Workspace
  setWs(ws: Workspace): void
  addTexts(files: Record<string, TextFile>): void
  setText(path: string, key: string, value: TextValue): void
  drafts: Record<string, { base: string; text: string }>
}) {
  const { ws, setWs } = props
  const [section, setSection] = useState<'announcements' | 'automatic'>('announcements')
  const [selected, setSelected] = useState<string | null>(null)
  const doc = ws.docs.announcements
  const all = rows(doc)
  const list = [...all].sort((a, b) => (b.values.from ?? '').localeCompare(a.values.from ?? ''))
  const current = all.find((r) => r.values.id === selected) ?? list[0]
  const onMain = new Set(rows(ws.docsBase.announcements).map((r) => r.values.id))
  const now = Date.now()
  const set = (changes: Record<string, string>) => current && setWs({ ...ws, docs: { ...ws.docs, announcements: updateRow(doc, (r) => r === current, changes) } })

  function add() {
    // From now: it is sent when the proposal is published (a later date schedules it).
    const start = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    let id = `aviso-${start.getUTCFullYear()}${p(start.getUTCMonth() + 1)}${p(start.getUTCDate())}`
    for (let n = 2; all.some((r) => r.values.id === id); n++) id = id.replace(/(-\d+)?$/, `-${n}`)
    const row = newRow(doc, { id, from: `${start.toISOString().slice(0, 16)}Z`, title: '', text: '', title_es: 'Novedades', text_es: 'Escribe aquí el mensaje.' })
    setWs({ ...ws, docs: { ...ws.docs, announcements: replaceRows(doc, [...all, row]) } })
    setSelected(id)
  }

  const v = current?.values
  const state = v ? status(v.from!, v.until!, now) : null

  return (
    <div>
      <nav className="chips" aria-label="Secciones">
        <button type="button" aria-pressed={section === 'announcements'} onClick={() => setSection('announcements')}>
          Avisos a todos
        </button>
        <button type="button" aria-pressed={section === 'automatic'} onClick={() => setSection('automatic')}>
          Notificaciones automáticas
        </button>
      </nav>

      {section === 'automatic' ? (
        <section className="editPane">
          <p className="hint">El juego las crea solo, en el buzón de cada jugador. Cuándo aparecen lo decide el juego (para una nueva, pídesela a Claude); aquí cambias sus textos.</p>
          <dl className="facts">
            {AUTOMATIC.map(([name, when]) => (
              <div key={name}>
                <dt>{when}</dt>
                <dd>{name}</dd>
              </div>
            ))}
          </dl>
          <TextsPanel token={props.token} ws={ws} addTexts={props.addTexts} setText={props.setText} drafts={props.drafts} only={{ screen: 'common', prefix: 'inbox.' }} />
        </section>
      ) : (
        <div className="split">
          <section className="listPane" aria-label="Avisos">
            <div className="paneHead">
              <h2>Avisos ({all.length})</h2>
              <button type="button" className="ghost" onClick={add}>
                + Nuevo aviso
              </button>
            </div>
            <p className="hint">Un aviso aparece en el buzón de todos los jugadores entre sus fechas. Se envía al publicar la propuesta: quien tenga el juego abierto lo recibe en unos minutos.</p>
            {list.length === 0 && <p className="muted">Aún no hay avisos.</p>}
            <ul className="momentList">
              {list.map((row) => {
                const s = status(row.values.from!, row.values.until!, now)
                return (
                  <li key={row.values.id}>
                    <button type="button" aria-pressed={row === current} onClick={() => setSelected(row.values.id!)}>
                      <span className="rowName">
                        {!onMain.has(row.values.id) && <span className="dot" />}
                        {row.values.title_es || row.values.title}
                      </span>
                      <span className="rowId">
                        <span className={`statusTag ${s.tone}`}>{s.text}</span> desde {new Date(row.values.from!).toLocaleString('es')}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          {v && state && (
            <section className="editPane" aria-label={`Editar ${v.id}`}>
              <div className="editHead">
                <div>
                  <span className="eyebrow">AVISO · {v.id}</span>
                  <h2>{v.title_es || v.title}</h2>
                </div>
                <span className={`statusTag ${state.tone}`}>{state.text}</span>
              </div>
              <div className="inboxPreview">
                <span className="inboxIcon">📣</span>
                <div>
                  <strong>{v.title_es || v.title}</strong>
                  <p>{v.text_es || v.text}</p>
                </div>
              </div>
              <h3>Cuándo</h3>
              <div className="form">
                <TextField label="Desde (tu hora)" value={toLocal(v.from!)} onChange={(x) => set({ from: toUtc(x) })} hint="Aparece desde este momento" />
                <TextField label="Hasta (tu hora)" value={toLocal(v.until!)} onChange={(x) => set({ until: toUtc(x) })} hint="Vacío: no se quita" />
                <SelectField label="Al tocarlo lleva a" value={v.link!} options={LINKS.map(([value, label]) => ({ value: value!, label: label! }))} onChange={(x) => set({ link: x })} />
              </div>
              <div className="mediaActions">
                <button type="button" className="ghost small" onClick={() => set({ from: `${new Date().toISOString().slice(0, 16)}Z` })}>
                  Enviar al publicar (desde ahora)
                </button>
                {state.tone !== 'ended' && (
                  <button type="button" className="ghost small" onClick={() => set({ until: `${new Date(Date.now() + 60_000).toISOString().slice(0, 16)}Z` })}>
                    Terminarlo
                  </button>
                )}
                {!onMain.has(v.id) && (
                  <button type="button" className="ghost small" onClick={() => setWs({ ...ws, docs: { ...ws.docs, announcements: replaceRows(doc, all.filter((r) => r !== current)) } })}>
                    Quitar
                  </button>
                )}
              </div>
              <h3>Mensaje</h3>
              <div className="langGrid">
                {LANGUAGES.map(([suffix, name]) => (
                  <div className="langBlock" key={suffix}>
                    <span className="langTitle">{name}</span>
                    <TextField label="Título" value={v[`title${suffix}`] ?? ''} placeholder={suffix ? 'vacío = en inglés' : 'obligatorio: lo ven los idiomas vacíos'} onChange={(x) => set({ [`title${suffix}`]: x })} wide />
                    <TextField label="Texto" value={v[`text${suffix}`] ?? ''} placeholder={suffix ? 'vacío = en inglés' : ''} onChange={(x) => set({ [`text${suffix}`]: x })} wide multiline />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
