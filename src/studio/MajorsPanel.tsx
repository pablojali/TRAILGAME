import { useCallback, useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { nextSundayStart, validateBands, type MajorBand, type MajorConfig, type MajorStatus } from '../domain/major/major'
import { RACES } from '../domain/races/races'
import type { MajorEvent } from '../server/majorOps'
import { MajorMedia } from './MajorMedia'
import { MajorReport } from './MajorReport'
import { BAND_ERRORS, errorText } from './majorTexts'
import { bothTimes, currentSession, majorClient, majorOps, sendMagicLink, signOut } from './majorClient'

/**
 * Sunday Major administration (owner specification, phase 1, 10 November 2026): the global
 * configuration (start time in UTC, windows, level bands) and the events (create and edit drafts,
 * publish, cancel). Everything is saved in the database through `major-ops`, which checks the admin
 * rights: no pull request, no code published.
 */
const STATUS: Record<MajorStatus, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  REGISTRATION_OPEN: 'Registration open',
  LOCKED: 'Grid locked',
  STARTING: 'Starting',
  RUNNING: 'Running',
  FINISHED: 'Finished',
  CANCELLED: 'Cancelled',
}

const raceName = (id: string) => RACES.find((r) => r.id === id)?.name ?? id

export function MajorsPanel() {
  return (
    <AdminGate title="Majors">
      <MajorsAdmin />
    </AdminGate>
  )
}

/**
 * The Studio's Supabase sign-in and admin check (Majors, Corredores): the children show only to an
 * administrator. The server checks the rights again on every request.
 */
export function AdminGate({ title, children }: { title: string; children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [checked, setChecked] = useState(false)
  const [who, setWho] = useState<{ userId: string; admin: boolean } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void currentSession().then((s) => {
      setSession(s)
      setChecked(true)
    })
    const { data } = majorClient().auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return setWho(null)
    void majorOps({ action: 'whoami' }).then((r) => {
      if (r.ok) setWho({ userId: r.userId as string, admin: r.admin === true })
      else setError(errorText(r.error))
    })
  }, [session])

  if (!checked) return <p className="loading">Checking the session…</p>
  if (!session) return <SignIn title={title} />
  if (!who) return <p className="loading">{error || 'Checking your permissions…'}</p>
  if (!who.admin) {
    return (
      <section className="connect">
        <h1>{title}</h1>
        <p>Your account is not a Trail Studio admin yet.</p>
        <p>
          Give Claude this id to grant permissions: <code>{who.userId}</code>
        </p>
        <button type="button" className="ghost" onClick={() => void signOut()}>
          Sign out
        </button>
      </section>
    )
  }
  return <>{children}</>
}

function SignIn({ title }: { title: string }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState('')
  return (
    <section className="connect">
      <h1>{title}</h1>
      <p>Sign in with your game account's email (the one you linked in Settings). You get a link that brings you back here.</p>
      <label htmlFor="major-email">Email</label>
      <input id="major-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {state === 'sent' ? (
        <p className="notice" role="status">
          Check your email and open the link in this browser.
        </p>
      ) : (
        <button
          type="button"
          className="primary"
          disabled={state === 'sending' || !email.includes('@')}
          onClick={async () => {
            setState('sending')
            setError('')
            const problem = await sendMagicLink(email.trim())
            if (problem) {
              setError(`Could not send the link: ${problem}`)
              setState('idle')
            } else setState('sent')
          }}
        >
          Send me the link
        </button>
      )}
    </section>
  )
}

interface Draft {
  id: string | null
  name: string
  description: string
  raceId: string
  /** yyyy-mm-dd (UTC). */
  date: string
  /** HH:MM (UTC). */
  time: string
}

function MajorsAdmin() {
  const [config, setConfig] = useState<MajorConfig | null>(null)
  const [events, setEvents] = useState<MajorEvent[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [mediaFor, setMediaFor] = useState<string | null>(null)
  const [reportFor, setReportFor] = useState<MajorEvent | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const call = useCallback(async (body: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
    setBusy(true)
    setError('')
    const result = await majorOps(body)
    setBusy(false)
    if (!result.ok) {
      setError(errorText(result.error))
      return null
    }
    return result
  }, [])

  const reload = useCallback(async () => {
    const [c, e] = await Promise.all([majorOps({ action: 'config-get' }), majorOps({ action: 'events-list' })])
    if (c.ok) setConfig(c.config as MajorConfig)
    if (e.ok) setEvents(e.events as MajorEvent[])
    if (!c.ok || !e.ok) setError(errorText((!c.ok ? c : (e as { error: string })).error))
  }, [])

  useEffect(() => {
    // Loading from the server: the state is set when the answers arrive.
    void reload()
  }, [reload])

  const mediaEvent = events?.find((e) => e.id === mediaFor) ?? null

  const newDraft = () => {
    const start = new Date(nextSundayStart(Date.now(), config?.startTimeUtc ?? '18:00'))
    setDraft({ id: null, name: '', description: '', raceId: RACES[0]!.id, date: start.toISOString().slice(0, 10), time: start.toISOString().slice(11, 16) })
  }

  const save = async () => {
    if (!draft) return
    const event = { name: draft.name, description: draft.description, raceId: draft.raceId, scheduledStartAt: `${draft.date}T${draft.time}:00Z` }
    const result = await call(draft.id ? { action: 'event-update', id: draft.id, event } : { action: 'event-create', event })
    if (result) {
      setDraft(null)
      setNotice(draft.id ? 'Draft saved.' : 'Draft created. Publish it when ready.')
      await reload()
    }
  }

  const publish = async (event: MajorEvent) => {
    if (!window.confirm(`Publish «${event.name}»? After that it cannot be edited: only cancelled.`)) return
    if (await call({ action: 'event-publish', id: event.id })) {
      setNotice('Published: registrations open as configured.')
      await reload()
    }
  }

  const cancel = async (event: MajorEvent) => {
    const reason = window.prompt(`Reason for cancelling «${event.name}»:`)
    if (reason === null) return
    if (await call({ action: 'event-cancel', id: event.id, reason })) {
      setNotice('Major cancelled.')
      await reload()
    }
  }

  return (
    <div className="majors">
      <header className="majorsHead">
        <h2>Sunday Majors</h2>
        <button type="button" className="ghost small" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>
      {notice && (
        <p className="notice" role="status">
          {notice}{' '}
          <button type="button" className="link" onClick={() => setNotice('')}>
            Close
          </button>
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="editPane">
        <div className="majorsBar">
          <h3>Events</h3>
          <button type="button" className="primary" onClick={newDraft} disabled={!config || busy}>
            New Major
          </button>
        </div>
        {draft && (
          <EventForm
            draft={draft}
            busy={busy}
            onChange={setDraft}
            onSave={() => void save()}
            onClose={() => setDraft(null)}
          />
        )}
        {mediaEvent && (
          <>
            <MajorMedia event={mediaEvent} onChange={(next) => setEvents((list) => list?.map((e) => (e.id === next.id ? next : e)) ?? list)} />
            <div className="majorsBar">
              <span />
              <button type="button" className="ghost small" onClick={() => setMediaFor(null)}>
                Close banner and videos
              </button>
            </div>
          </>
        )}
        {reportFor && <MajorReport eventId={reportFor.id} name={reportFor.name} onClose={() => setReportFor(null)} />}
        {!events ? (
          <p className="loading">Reading the Majors…</p>
        ) : events.length === 0 ? (
          <p className="muted">No Majors yet.</p>
        ) : (
          <div className="gridWrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Major</th>
                  <th>Race</th>
                  <th>Start</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <b>{event.name}</b>
                      {event.categories.length > 0 && (
                        <span className="hint">
                          {' · '}
                          {event.categories.map((c) => `${c.name} (${c.maxLevel === null ? `${c.minLevel}+` : `${c.minLevel}–${c.maxLevel}`})`).join(', ')}
                        </span>
                      )}
                      {event.cancelReason && <span className="hint"> · Reason: {event.cancelReason}</span>}
                    </td>
                    <td>{raceName(event.raceId)}</td>
                    <td>
                      {bothTimes(event.scheduledStartAt)}
                      {event.registrationOpenAt && event.readyOpenAt && (
                        <span className="hint">
                          <br />
                          Registration from {bothTimes(event.registrationOpenAt)} · READY from {bothTimes(event.readyOpenAt)}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`tag status-${event.status.toLowerCase()}`}>{STATUS[event.status]}</span>
                    </td>
                    <td className="actions">
                      {event.status === 'DRAFT' && (
                        <>
                          <button
                            type="button"
                            className="ghost small"
                            disabled={busy}
                            onClick={() =>
                              setDraft({
                                id: event.id,
                                name: event.name,
                                description: event.description,
                                raceId: event.raceId,
                                date: event.scheduledStartAt.slice(0, 10),
                                time: new Date(event.scheduledStartAt).toISOString().slice(11, 16),
                              })
                            }
                          >
                            Edit
                          </button>
                          <button type="button" className="primary small" disabled={busy} onClick={() => void publish(event)}>
                            Publish
                          </button>
                        </>
                      )}
                      {!['RUNNING', 'FINISHED', 'CANCELLED'].includes(event.status) && (
                        <button type="button" className="ghost small" disabled={busy} onClick={() => setMediaFor(event.id)}>
                          Banner and videos
                        </button>
                      )}
                      {(event.status === 'RUNNING' || event.status === 'FINISHED') && (
                        <button type="button" className="primary small" disabled={busy} onClick={() => setReportFor(event)}>
                          Report
                        </button>
                      )}
                      {event.status !== 'FINISHED' && event.status !== 'CANCELLED' && (
                        <button type="button" className="ghost small" disabled={busy} onClick={() => void cancel(event)}>
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {config && <ConfigForm config={config} busy={busy} onSave={async (next) => {
        const result = await call({ action: 'config-set', config: next })
        if (result) {
          setConfig(result.config as MajorConfig)
          setNotice('Configuration saved. It applies to the Majors you publish from now on.')
        }
      }} />}
    </div>
  )
}

function EventForm({
  draft,
  busy,
  onChange,
  onSave,
  onClose,
}: {
  draft: Draft
  busy: boolean
  onChange(draft: Draft): void
  onSave(): void
  onClose(): void
}) {
  const start = `${draft.date}T${draft.time}:00Z`
  const valid = Number.isFinite(Date.parse(start))
  const past = valid && Date.parse(start) <= Date.now()
  return (
    <div className="majorForm">
      <h4>{draft.id ? 'Edit draft' : 'New Major'}</h4>
      <div className="form">
        <div className="field wide">
          <label htmlFor="m-name">Name</label>
          <input id="m-name" value={draft.name} maxLength={80} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
        </div>
        <div className="field wide">
          <label htmlFor="m-desc">Description</label>
          <textarea id="m-desc" value={draft.description} maxLength={500} rows={2} onChange={(e) => onChange({ ...draft, description: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="m-race">Course (race from the catalog)</label>
          <select id="m-race" value={draft.raceId} onChange={(e) => onChange({ ...draft, raceId: e.target.value })}>
            {/* The Majors' own courses first (owner design, 18 November 2026), then the NPC races. */}
            {[
              { label: 'Major courses', races: RACES.filter((race) => race.major) },
              { label: 'NPC races', races: RACES.filter((race) => !race.major && !race.retired) },
              // A retired race only for a Major that already runs it.
              { label: 'Retired', races: RACES.filter((race) => race.retired && race.id === draft.raceId) },
            ]
              .filter((group) => group.races.length > 0)
              .map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.races.map((race) => (
                    <option key={race.id} value={race.id}>
                      {race.name} · {race.distanceKm} km · +{race.elevationGainM} m
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="m-date">Date (UTC)</label>
          <input id="m-date" type="date" value={draft.date} onChange={(e) => onChange({ ...draft, date: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="m-time">Start time (UTC)</label>
          <input id="m-time" type="time" value={draft.time} onChange={(e) => onChange({ ...draft, time: e.target.value })} />
        </div>
        <p className={`field wide ${valid && !past ? 'hint' : 'error'}`}>
          {!valid ? 'Date not valid.' : past ? 'That start has passed.' : `Starts ${bothTimes(start)}.`}
        </p>
      </div>
      <div className="majorsBar">
        <button type="button" className="ghost" onClick={onClose}>
          Close
        </button>
        <button type="button" className="primary" disabled={busy || !valid || past || !draft.name.trim()} onClick={onSave}>
          Save draft
        </button>
      </div>
    </div>
  )
}

function ConfigForm({ config, busy, onSave }: { config: MajorConfig; busy: boolean; onSave(config: MajorConfig): void }) {
  const [value, setValue] = useState(config)
  useEffect(() => setValue(config), [config])
  const bandProblem = validateBands(value.bands)
  const num = (key: keyof MajorConfig) => (e: ChangeEvent<HTMLInputElement>) => setValue({ ...value, [key]: Number(e.target.value) })
  // Each band starts right after the previous one: no gap or overlap to type by hand.
  const setBands = (bands: MajorBand[]) =>
    setValue({
      ...value,
      bands: bands.map((band, i) => ({ ...band, min: i === 0 ? 1 : (bands[i - 1]!.max ?? 0) + 1, max: i === bands.length - 1 ? null : band.max })),
    })

  return (
    <section className="editPane">
      <h3>Configuration of the next Majors</h3>
      <p className="hint">Each Major keeps a copy when published: changing it here does not touch the published ones.</p>
      <div className="form">
        <div className="field">
          <label htmlFor="c-time">Default start time (UTC)</label>
          <input id="c-time" type="time" value={value.startTimeUtc} onChange={(e) => setValue({ ...value, startTimeUtc: e.target.value })} />
          <span className="hint">{bothTimes(new Date(nextSundayStart(Date.now(), value.startTimeUtc)).toISOString())}</span>
        </div>
        <div className="field">
          <label htmlFor="c-reg">Registration opens (days before)</label>
          <input id="c-reg" type="number" min={1} max={13} value={value.registrationOpenDays} onChange={num('registrationOpenDays')} />
        </div>
        <div className="field">
          <label htmlFor="c-ready">READY opens (minutes before)</label>
          <input id="c-ready" type="number" min={5} max={180} value={value.readyMinutes} onChange={num('readyMinutes')} />
          <span className="hint">Registrations close at that moment.</span>
        </div>
        <div className="field">
          <label htmlFor="c-window">Aid station decision window (s)</label>
          <input id="c-window" type="number" min={30} max={600} value={value.decisionWindowS} onChange={num('decisionWindowS')} />
        </div>
        <div className="field">
          <label htmlFor="c-run">Running phase per segment (s)</label>
          <input id="c-run" type="number" min={30} max={900} value={value.runningS} onChange={num('runningS')} />
        </div>
        <div className="field">
          <label htmlFor="c-limit">Participants per category</label>
          <input id="c-limit" type="number" min={2} max={50} value={value.participantLimit} onChange={num('participantLimit')} />
        </div>
      </div>

      <h4>Categories by level</h4>
      <div className="gridWrap">
      <table className="grid">
        <thead>
          <tr>
            <th>Name</th>
            <th>From level</th>
            <th>To level</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {value.bands.map((band, i) => {
            const last = i === value.bands.length - 1
            return (
              <tr key={i}>
                <td>
                  <input aria-label={`Band ${i + 1} name`} value={band.name} maxLength={40} onChange={(e) => setBands(value.bands.map((b, j) => (j === i ? { ...b, name: e.target.value } : b)))} />
                </td>
                <td className="num">{band.min}</td>
                <td>
                  {last ? (
                    <span className="muted">and up</span>
                  ) : (
                    <input
                      aria-label={`Band ${i + 1} maximum level`}
                      type="number"
                      min={band.min}
                      value={band.max ?? ''}
                      onChange={(e) => setBands(value.bands.map((b, j) => (j === i ? { ...b, max: Number(e.target.value) } : b)))}
                    />
                  )}
                </td>
                <td>
                  {value.bands.length > 1 && (
                    <button type="button" className="ghost small" onClick={() => setBands(value.bands.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
      <div className="majorsBar">
        <button
          type="button"
          className="ghost"
          disabled={value.bands.length >= 12}
          onClick={() => {
            const bands = [...value.bands]
            const last = bands[bands.length - 1]!
            bands[bands.length - 1] = { ...last, max: last.min + 7 }
            setBands([...bands, { name: `Band ${bands.length + 1}`, min: last.min + 8, max: null }])
          }}
        >
          Add band
        </button>
        {bandProblem && <span className="error">{BAND_ERRORS[bandProblem]}</span>}
        <button type="button" className="primary" disabled={busy || bandProblem !== null} onClick={() => onSave(value)}>
          Save configuration
        </button>
      </div>
    </section>
  )
}
