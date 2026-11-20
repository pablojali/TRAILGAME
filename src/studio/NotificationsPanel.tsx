import { useState } from 'react'
import { newRow, replaceRows, rows, updateRow } from './csvDoc'
import { SelectField, TextField } from './fields'
import type { TextFile, TextValue, Workspace } from './model'
import { TextsPanel } from './TextsPanel'

const LANGUAGES = [
  ['', 'English'],
  ['_es', 'Spanish'],
  ['_fr', 'French'],
  ['_it', 'Italian'],
  ['_de', 'German'],
] as const
const LINKS = [
  ['', 'None (the message only)'],
  ['/', 'Dashboard'],
  ['/training', 'Training'],
  ['/equipment', 'Equipment'],
  ['/equipment?tab=shop', 'Shop'],
  ['/races', 'Races'],
  ['/career', 'Career'],
  ['/career?tab=achievements', 'Challenges'],
  ['/settings', 'Settings'],
]
/** The game's automatic notifications: kind (src/data/notifications.csv), name and when they appear. */
const AUTOMATIC: [string, string, string][] = [
  ['race', 'Race result', 'After each race: place and ranking points.'],
  ['challenge', 'Challenge completed', 'On reaching each level of a challenge.'],
  ['level', 'Level up', 'On levelling up (attribute points to share out).'],
  ['season', 'New season', 'Every month, when the ranking season starts.'],
  ['race-day', 'Race day', 'On the Sunday of an entered race.'],
  ['decay', 'Fitness lost', 'On coming back after days without playing (the text is in Common · notice.decay).'],
  ['cloud', 'Cloud save', 'If the progress could not be saved, or was restored from another device.'],
  ['ranking', 'Ranking top 10', 'On entering, rising, falling or leaving the world or country top 10.'],
  ['visit', 'Refuge visit', 'When someone visits the player\'s refuge.'],
  ['congrats', 'Congratulations', 'When someone congratulates the player from their refuge.'],
  ['message', 'Message from a friend', 'When a friend leaves a message in the mailbox.'],
  ['friend-request', 'Friend request', 'When someone asks to be the player\'s friend.'],
  ['friend-accepted', 'Friendship accepted', 'When the player\'s friend request is accepted.'],
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
  if (Date.parse(from) > now) return { text: 'Scheduled', tone: 'scheduled' }
  if (until && Date.parse(until) <= now) return { text: 'Ended', tone: 'ended' }
  return { text: 'Live', tone: 'live' }
}

/**
 * Notifications (owner request, 9 November 2026): announcements to every player (shown in every
 * Inbox between two dates; open games receive them within minutes of publishing; any can be
 * removed) and the game's automatic notifications: their texts, and which are shown (owner request,
 * 19 November 2026: some can be turned off).
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
    // Date and time: an id is never reused, even after a published announcement is removed (players' Inbox remembers it as read).
    const base = `aviso-${start.getUTCFullYear()}${p(start.getUTCMonth() + 1)}${p(start.getUTCDate())}-${p(start.getUTCHours())}${p(start.getUTCMinutes())}`
    let id = base
    for (let n = 2; all.some((r) => r.values.id === id) || rows(ws.docsBase.announcements).some((r) => r.values.id === id); n++) id = `${base}-${n}`
    const row = newRow(doc, { id, from: `${start.toISOString().slice(0, 16)}Z`, title: 'News', text: 'Write the message here.' })
    setWs({ ...ws, docs: { ...ws.docs, announcements: replaceRows(doc, [...all, row]) } })
    setSelected(id)
  }

  const v = current?.values
  const state = v ? status(v.from!, v.until!, now) : null

  return (
    <div>
      <nav className="chips" aria-label="Sections">
        <button type="button" aria-pressed={section === 'announcements'} onClick={() => setSection('announcements')}>
          Announcements to everyone
        </button>
        <button type="button" aria-pressed={section === 'automatic'} onClick={() => setSection('automatic')}>
          Automatic notifications
        </button>
      </nav>

      {section === 'automatic' ? (
        <section className="editPane">
          <p className="hint">The game creates them by itself, in each player's inbox. The game decides when they appear (ask Claude for a new one); here you change their texts.</p>
          <p className="hint">Untick one to remove it: the game stops showing it in the inbox once published. Tick it again to bring it back.</p>
          <ul className="toggleList" aria-label="Automatic notifications">
            {AUTOMATIC.map(([kind, name, when]) => {
              const on = rows(ws.docs.notifications).find((r) => r.values.kind === kind)?.values.on !== 'no'
              return (
                <li key={kind}>
                  <label>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => setWs({ ...ws, docs: { ...ws.docs, notifications: updateRow(ws.docs.notifications, (r) => r.values.kind === kind, { on: e.target.checked ? 'yes' : 'no' }) } })}
                    />
                    <span>
                      <strong>{name}</strong>
                      <span className="hint">{on ? when : 'Removed: not shown in the inbox.'}</span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <TextsPanel token={props.token} ws={ws} addTexts={props.addTexts} setText={props.setText} drafts={props.drafts} only={{ screen: 'common', prefix: 'inbox.' }} />
        </section>
      ) : (
        <div className="split">
          <section className="listPane" aria-label="Announcements">
            <div className="paneHead">
              <h2>Announcements ({all.length})</h2>
              <button type="button" className="ghost" onClick={add}>
                + New announcement
              </button>
            </div>
            <p className="hint">An announcement shows in every player's inbox between its dates. It is sent when the proposal is published: players with the game open get it within minutes.</p>
            {list.length === 0 && <p className="muted">No announcements yet.</p>}
            <ul className="momentList">
              {list.map((row) => {
                const s = status(row.values.from!, row.values.until!, now)
                return (
                  <li key={row.values.id}>
                    <button type="button" aria-pressed={row === current} onClick={() => setSelected(row.values.id!)}>
                      <span className="rowName">
                        {!onMain.has(row.values.id) && <span className="dot" />}
                        {row.values.title || row.values.title_es}
                      </span>
                      <span className="rowId">
                        <span className={`statusTag ${s.tone}`}>{s.text}</span> from {new Date(row.values.from!).toLocaleString('en')}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          {v && state && (
            <section className="editPane" aria-label={`Edit ${v.id}`}>
              <div className="editHead">
                <div>
                  <span className="eyebrow">ANNOUNCEMENT · {v.id}</span>
                  <h2>{v.title || v.title_es}</h2>
                </div>
                <span className={`statusTag ${state.tone}`}>{state.text}</span>
              </div>
              <div className="inboxPreview">
                <span className="inboxIcon">📣</span>
                <div>
                  <strong>{v.title || v.title_es}</strong>
                  <p>{v.text || v.text_es}</p>
                </div>
              </div>
              <h3>When</h3>
              <div className="form">
                <TextField label="From (your time)" value={toLocal(v.from!)} onChange={(x) => set({ from: toUtc(x) })} hint="Shown from this moment" />
                <TextField label="Until (your time)" value={toLocal(v.until!)} onChange={(x) => set({ until: toUtc(x) })} hint="Empty: never removed" />
                <SelectField label="Tapping it opens" value={v.link!} options={LINKS.map(([value, label]) => ({ value: value!, label: label! }))} onChange={(x) => set({ link: x })} />
              </div>
              <div className="mediaActions">
                <button type="button" className="ghost small" onClick={() => set({ from: `${new Date().toISOString().slice(0, 16)}Z` })}>
                  Send when published (from now)
                </button>
                {state.tone !== 'ended' && (
                  <button type="button" className="ghost small" onClick={() => set({ until: `${new Date(Date.now() + 60_000).toISOString().slice(0, 16)}Z` })}>
                    End it
                  </button>
                )}
                <button
                  type="button"
                  className="ghost small"
                  onClick={() => {
                    // A published one leaves every Inbox when the proposal is published.
                    if (onMain.has(v.id) && !window.confirm('Remove this announcement? It leaves every player\'s inbox when published.')) return
                    setWs({ ...ws, docs: { ...ws.docs, announcements: replaceRows(doc, all.filter((r) => r !== current)) } })
                  }}
                >
                  Remove
                </button>
              </div>
              <h3>Message</h3>
              <div className="langGrid">
                {LANGUAGES.map(([suffix, name]) => (
                  <div className="langBlock" key={suffix}>
                    <span className="langTitle">{name}</span>
                    <TextField label="Title" value={v[`title${suffix}`] ?? ''} placeholder={suffix ? 'empty = English' : 'required: empty languages show it'} onChange={(x) => set({ [`title${suffix}`]: x })} wide />
                    <TextField label="Text" value={v[`text${suffix}`] ?? ''} placeholder={suffix ? 'empty = English' : ''} onChange={(x) => set({ [`text${suffix}`]: x })} wide multiline />
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
