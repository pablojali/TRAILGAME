import { useCallback, useEffect, useRef, useState } from 'react'
import { BalancePanel } from './BalancePanel'
import { MajorsPanel } from './MajorsPanel'
import { RunnersPanel } from './RunnersPanel'
import { CoachPanel } from './CoachPanel'
import { EquipmentPanel } from './EquipmentPanel'
import { NotificationsPanel } from './NotificationsPanel'
import { TextsPanel } from './TextsPanel'
import {
  checkToken,
  createProposal,
  discardProposal,
  listProposals,
  publishProposal,
  readFile,
  saveToken,
  savedToken,
  type Proposal,
} from './github'
import { forgetFolders } from './uploads'
import { megabytes } from './media'
import {
  changedFiles,
  changedTexts,
  FILE_IDS,
  FILES,
  hasChanges,
  jsonText,
  needsRankingMigration,
  openWorkspace,
  proposalFiles,
  proposalMedia,
  summary,
  textOf,
  validate,
  type FileId,
  type TextFile,
  type TextValue,
  type Workspace,
} from './model'
import { AvatarsPanel } from './AvatarsPanel'
import { RacesPanel } from './RacesPanel'
import { MotorPanel } from './MotorPanel'
import { BaseCampPanel } from './BaseCampPanel'

/** Multimedia (owner request, 16 November 2026): the art of the game, in sub-tabs. */
type MediaTab = 'equipment' | 'avatars' | 'camp-exterior' | 'camp-interior'
const MEDIA_TABS: { id: MediaTab; label: string }[] = [
  { id: 'equipment', label: 'Equipment' },
  { id: 'avatars', label: 'Avatars' },
  { id: 'camp-exterior', label: 'Base Camp (ext)' },
  { id: 'camp-interior', label: 'Base Camp (int)' },
]

const DRAFT_KEY = 'trailgame.studio.draft'
type Tab = 'races' | 'media' | 'coach' | 'notifications' | 'texts' | 'balance' | 'runners' | 'changes'

/** Races (owner request, 25 November 2026): NPC races, Majors and the race engine's art, in sub-tabs. */
type RaceTab = 'npc' | 'majors' | 'motor'
const RACE_TABS: { id: RaceTab; label: string }[] = [
  { id: 'npc', label: 'NPC Races' },
  { id: 'majors', label: 'Majors' },
  { id: 'motor', label: 'Motor' },
]

interface Draft {
  base: Record<FileId, string>
  texts: Partial<Record<FileId, string>>
  /** Game text files edited: their text on main when edited, and the edit. */
  gameTexts?: Record<string, { base: string; text: string }>
}

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

function storeDraft(ws: Workspace | null) {
  try {
    if (!ws || (changedFiles(ws).length === 0 && changedTexts(ws).length === 0)) localStorage.removeItem(DRAFT_KEY)
    else {
      const texts = Object.fromEntries(changedFiles(ws).map((id) => [id, textOf(ws, id)]))
      const gameTexts = Object.fromEntries(changedTexts(ws).map((path) => [path, { base: ws.texts[path]!.base, text: jsonText(ws.texts[path]!.data) }]))
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ base: ws.base, texts, gameTexts } satisfies Draft))
    }
  } catch {
    // Private mode: the draft lives for this visit only.
  }
}

/** The workspace as on main again (texts already read stay read, without their edits). */
function freshWorkspace(ws: Workspace): Workspace {
  const texts = Object.fromEntries(Object.entries(ws.texts).map(([path, file]) => [path, { base: file.base, data: JSON.parse(file.base) as Record<string, TextValue> }]))
  return { ...openWorkspace(ws.base), texts }
}

/**
 * Trail Studio (owner request, 9 November 2026): the designer's editor for the game's races and
 * equipment. It reads the tables from the repository, edits them with the game's own checks and
 * proposes the changes as a pull request (checked by CI, previewed by Cloudflare), published from
 * here once the owner is happy. Spanish only: one designer.
 */
export function App() {
  const [token, setToken] = useState<string | null>(savedToken())
  const [ws, setWsState] = useState<Workspace | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('races')
  const [mediaTab, setMediaTab] = useState<MediaTab>('equipment')
  const [raceTab, setRaceTab] = useState<RaceTab>('npc')
  const [raceId, setRaceId] = useState<string | null>(null)
  const [itemId, setItemId] = useState<string | null>(null)
  const [momentId, setMomentId] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [proposals, setProposals] = useState<Proposal[] | null>(null)

  const setWs = useCallback((next: Workspace) => {
    setWsState(next)
    storeDraft(next)
  }, [])
  // Texts arrive and change while the table edits may change too: always on the latest workspace.
  const addTexts = useCallback((files: Record<string, TextFile>) => {
    setWsState((current) => (current ? { ...current, texts: { ...current.texts, ...files } } : current))
  }, [])
  const setText = useCallback((path: string, key: string, value: TextValue) => {
    setWsState((current) => {
      if (!current) return current
      const file = current.texts[path]!
      const next = { ...current, texts: { ...current.texts, [path]: { ...file, data: { ...file.data, [key]: value } } } }
      storeDraft(next)
      return next
    })
  }, [])
  const [textDrafts, setTextDrafts] = useState<Record<string, { base: string; text: string }>>({})

  const load = useCallback(async (tok: string) => {
    setError('')
    try {
      const entries = await Promise.all(FILE_IDS.map(async (id) => [id, await readFile(tok, FILES[id])] as const))
      const base = Object.fromEntries(entries) as Record<FileId, string>
      const draft = loadDraft()
      setTextDrafts(draft?.gameTexts ?? {})
      if (draft && FILE_IDS.every((id) => draft.base[id] === base[id])) {
        setWsState(openWorkspace(base, draft.texts))
        setNotice('I recovered your unsaved changes.')
      } else {
        if (draft) setNotice('The game\'s tables changed since your last draft: starting from the published version.')
        storeDraft(null)
        setWsState(openWorkspace(base))
      }
    } catch (e) {
      setError(`Could not read the tables: ${(e as Error).message}`)
    }
  }, [])

  // Proposals published or discarded here never come back, even while GitHub's list catches up.
  const closed = useRef(new Set<number>())
  const refreshProposals = useCallback(async (tok: string) => {
    try {
      setProposals((await listProposals(tok)).filter((p) => !closed.current.has(p.number)))
      // A network hiccup earlier is over.
      setError((current) => (current.startsWith('Could not read the proposals') ? '' : current))
    } catch (e) {
      setError(`Could not read the proposals: ${(e as Error).message}`)
    }
  }, [])

  useEffect(() => {
    if (!token) return
    // Loading from the repository: the state is set when the answers arrive.
    void load(token)
    void refreshProposals(token)
  }, [token, load, refreshProposals])

  // Pictures and videos are not kept as a draft: warn before leaving with some not proposed.
  const unsentUploads = ws ? Object.keys(ws.uploads).length > 0 : false
  useEffect(() => {
    if (!unsentUploads) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsentUploads])

  // While a proposal is being checked, look again every 20 seconds.
  useEffect(() => {
    if (!token || !proposals?.some((p) => p.state === 'checking')) return
    const timer = window.setInterval(() => void refreshProposals(token), 20_000)
    return () => window.clearInterval(timer)
  }, [token, proposals, refreshProposals])

  if (!token) return <Connect onConnected={(tok) => setToken(tok)} />

  const changed = ws ? [...changedFiles(ws), ...changedTexts(ws)] : []
  const uploads = ws ? Object.keys(ws.uploads).length : 0
  const pending = proposals?.length ?? 0

  return (
    <div className="studio">
      <header className="top">
        <span className="brand">
          Trail <b>Studio</b>
        </span>
        <nav className="tabs" aria-label="Sections">
          <button type="button" aria-pressed={tab === 'races'} onClick={() => setTab('races')}>
            Races
          </button>
          <button type="button" aria-pressed={tab === 'media'} onClick={() => setTab('media')}>
            Multimedia
          </button>
          <button type="button" aria-pressed={tab === 'coach'} onClick={() => setTab('coach')}>
            Coach
          </button>
          <button type="button" aria-pressed={tab === 'notifications'} onClick={() => setTab('notifications')}>
            Notifications
          </button>
          <button type="button" aria-pressed={tab === 'texts'} onClick={() => setTab('texts')}>
            Texts
          </button>
          <button type="button" aria-pressed={tab === 'balance'} onClick={() => setTab('balance')}>
            Balance
          </button>
          <button type="button" aria-pressed={tab === 'runners'} onClick={() => setTab('runners')}>
            Runners
          </button>
          <button type="button" aria-pressed={tab === 'changes'} onClick={() => setTab('changes')}>
            Proposals{pending ? ` (${pending})` : ''}
          </button>
        </nav>
        <button
          type="button"
          className="ghost small"
          onClick={() => {
            saveToken(null)
            setToken(null)
          }}
        >
          Disconnect
        </button>
      </header>

      {notice && (
        <p className="notice" role="status">
          {notice}{' '}
          <button type="button" className="link" onClick={() => setNotice('')}>
            Cerrar
          </button>
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <main className="body">
        {tab === 'races' ? (
          <>
            <nav className="subtabs" aria-label="Races">
              {RACE_TABS.map((r) => (
                <button key={r.id} type="button" aria-pressed={raceTab === r.id} onClick={() => setRaceTab(r.id)}>
                  {r.label}
                </button>
              ))}
            </nav>
            {raceTab === 'majors' ? (
              <MajorsPanel />
            ) : !ws ? (
              <p className="loading">Reading the game's tables…</p>
            ) : raceTab === 'motor' ? (
              <MotorPanel token={token} ws={ws} setWs={setWs} />
            ) : (
              <RacesPanel token={token} ws={ws} setWs={setWs} selected={raceId} select={setRaceId} />
            )}
          </>
        ) : tab === 'runners' ? (
          <RunnersPanel />
        ) : !ws ? (
          <p className="loading">Reading the game's tables…</p>
        ) : tab === 'media' ? (
          <>
            <nav className="subtabs" aria-label="Multimedia">
              {MEDIA_TABS.map((m) => (
                <button key={m.id} type="button" aria-pressed={mediaTab === m.id} onClick={() => setMediaTab(m.id)}>
                  {m.label}
                </button>
              ))}
            </nav>
            {mediaTab === 'equipment' ? (
              <EquipmentPanel ws={ws} setWs={setWs} selected={itemId} select={setItemId} />
            ) : mediaTab === 'avatars' ? (
              <AvatarsPanel token={token} ws={ws} setWs={setWs} />
            ) : (
              <BaseCampPanel key={mediaTab} token={token} ws={ws} setWs={setWs} scene={mediaTab === 'camp-exterior' ? 'exterior' : 'interior'} />
            )}
          </>
        ) : tab === 'coach' ? (
          <CoachPanel ws={ws} setWs={setWs} selected={momentId} select={setMomentId} />
        ) : tab === 'notifications' ? (
          <NotificationsPanel token={token} ws={ws} setWs={setWs} addTexts={addTexts} setText={setText} drafts={textDrafts} />
        ) : tab === 'texts' ? (
          <TextsPanel token={token} ws={ws} addTexts={addTexts} setText={setText} drafts={textDrafts} />
        ) : tab === 'balance' ? (
          <BalancePanel ws={ws} setWs={setWs} />
        ) : (
          <ProposalsPanel
            onDone={(number, message) => {
              closed.current.add(number)
              setProposals((list) => list?.filter((p) => p.number !== number) ?? list)
              setNotice(message)
            }}
            unsent={ws ? hasChanges(ws) : false}
            onReview={() => setReviewing(true)}
            token={token}
            proposals={proposals}
            refresh={() => refreshProposals(token)}
            reload={() => {
              forgetFolders()
              return load(token)
            }}
          />
        )}
      </main>

      {/* On every tab, Proposals included: what is waiting to be proposed is never out of sight. */}
      {ws && hasChanges(ws) && (
        <footer className="saveBar">
          <span>
            Unsaved:{' '}
            {[changed.length && (changed.length === 1 ? '1 table or text' : `${changed.length} tables or texts`), uploads && (uploads === 1 ? '1 file' : `${uploads} files`)]
              .filter(Boolean)
              .join(' and ')}
            .
          </span>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              if (window.confirm('Discard every unsaved change?')) setWs(freshWorkspace(ws))
            }}
          >
            Discard
          </button>
          <button type="button" className="primary" onClick={() => setReviewing(true)}>
            Review and propose
          </button>
        </footer>
      )}

      {ws && reviewing && (
        <Review
          ws={ws}
          token={token}
          pendingProposals={pending}
          onClose={() => setReviewing(false)}
          onCreated={(proposal) => {
            setReviewing(false)
            for (const upload of Object.values(ws.uploads)) if (upload.previewUrl) URL.revokeObjectURL(upload.previewUrl)
            setWs(freshWorkspace(ws))
            setProposals((list) => [proposal, ...(list ?? [])])
            setTab('changes')
          }}
        />
      )}
    </div>
  )
}

function Connect({ onConnected }: { onConnected(token: string): void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function connect() {
    setBusy(true)
    setError('')
    try {
      await checkToken(value.trim())
      saveToken(value.trim())
      onConnected(value.trim())
    } catch (e) {
      setError(`GitHub did not accept the token: ${(e as Error).message}`)
    }
    setBusy(false)
  }
  return (
    <div className="connect">
      <h1>
        Trail <b>Studio</b>
      </h1>
      <p>To read and propose changes to the game, connect your GitHub account with a token (once in this browser).</p>
      <ol>
        <li>
          Abre{' '}
          <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
            GitHub → Fine-grained token
          </a>
          .
        </li>
        <li>
          Name: <i>Trail Studio</i>. Repository access: <i>Only select repositories → TRAILGAME</i>.
        </li>
        <li>
          Repository permissions: <i>Contents: Read and write</i>, <i>Pull requests: Read and write</i>, <i>Commit statuses: Read</i>.
        </li>
        <li>Generate the token, copy it and paste it here.</li>
      </ol>
      <label htmlFor="token">Token</label>
      <input id="token" type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="github_pat_…" />
      {error && <p className="error">{error}</p>}
      <button type="button" className="primary" disabled={!value.trim() || busy} onClick={connect}>
        {busy ? 'Checking…' : 'Connect'}
      </button>
    </div>
  )
}

function Review({
  ws,
  token,
  pendingProposals,
  onClose,
  onCreated,
}: {
  ws: Workspace
  token: string
  pendingProposals: number
  onClose(): void
  onCreated(p: Proposal): void
}) {
  const errors = validate(ws)
  const { races, equipment, coach, announcements, balance, texts, basecamp } = summary(ws)
  const media = Object.values(ws.uploads).map((u) => (u.base64 === null ? u.label : `${u.label}${u.bytes ? ` (${megabytes(u.bytes)})` : ''}`))
  const migration = needsRankingMigration(ws)
  const [title, setTitle] = useState(() => {
    const parts = [
      races.length && `${races.length} race${races.length > 1 ? 's' : ''}`,
      equipment.length && `${equipment.length} item${equipment.length > 1 ? 's' : ''}`,
      coach.length && 'coach',
      announcements.length && `${announcements.length} announcement${announcements.length > 1 ? 's' : ''}`,
      balance.length && 'balance',
      basecamp.length && `${basecamp.length} Base Camp piece${basecamp.length > 1 ? 's' : ''}`,
      texts.length && `${texts.length} text${texts.length > 1 ? 's' : ''}`,
      media.length && `${media.length} file${media.length > 1 ? 's' : ''}`,
    ].filter(Boolean)
    return `Studio: changes to ${parts.join(', ')}`
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function propose() {
    setBusy(true)
    setError('')
    const lines = [
      'Changes made in **Trail Studio** by the designer.',
      '',
      ...(races.length ? ['### Races', ...races.map((l) => `- ${l}`), ''] : []),
      ...(equipment.length ? ['### Equipment', ...equipment.map((l) => `- ${l}`), ''] : []),
      ...(coach.length ? ['### Coach', ...coach.map((l) => `- ${l}`), ''] : []),
      ...(announcements.length ? ['### Announcements to every player', ...announcements.map((l) => `- ${l}`), ''] : []),
      ...(balance.length ? ['### Balance', ...balance.map((l) => `- ${l}`), ''] : []),
      ...(basecamp.length ? ['### Base Camp', ...basecamp.map((l) => `- ${l}`), ''] : []),
      ...(texts.length ? ['### Texts', ...texts.map((l) => `- ${l}`), ''] : []),
      ...(media.length ? ['### Photos and videos', ...media.map((l) => `- ${l}`), ''] : []),
      ...(migration
        ? ['⚠️ Includes a rankings migration (race levels or difficulties, points per place or NPC rivals). After publishing it must be applied in Supabase: ask Claude.', '']
        : []),
      'The game preview shows the changes; the server uses the published data until this proposal is published.',
    ]
    try {
      onCreated(await createProposal(token, proposalFiles(ws, new Date()), title, lines.join('\n'), new Date(), proposalMedia(ws)))
    } catch (e) {
      setError(`GitHub did not accept the proposal: ${(e as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <div className="dialogBack" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="review-title">
        <h2 id="review-title">Review changes</h2>
        {races.length > 0 && (
          <>
            <h3>Races</h3>
            <ul className="changes">
              {races.map((line) => (
                <li key={line}>
                  <Rich line={line} />
                </li>
              ))}
            </ul>
          </>
        )}
        {equipment.length > 0 && (
          <>
            <h3>Equipment</h3>
            <ul className="changes">
              {equipment.map((line) => (
                <li key={line}>
                  <Rich line={line} />
                </li>
              ))}
            </ul>
          </>
        )}
        {(
          [
            ['Coach', coach],
            ['Announcements', announcements],
            ['Balance', balance],
            ['Base Camp', basecamp],
            ['Texts', texts],
          ] as const
        ).map(([title, lines]) =>
          lines.length ? (
            <div key={title}>
              <h3>{title}</h3>
              <ul className="changes">
                {lines.map((line) => (
                  <li key={line}>
                    <Rich line={line} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
        {media.length > 0 && (
          <>
            <h3>Photos and videos</h3>
            <ul className="changes">
              {media.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        )}
        {migration && <p className="warning">Ranking data changes: the proposal includes its migration. After publishing, tell Claude to apply it.</p>}
        {pendingProposals > 0 && <p className="warning">You have another proposal not published yet: if they touch the same tables, publish one before the other.</p>}
        {errors.length > 0 ? (
          <div className="error">
            <p>The game would refuse these changes. Fix them before proposing:</p>
            <ul>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <label htmlFor="proposal-title">Title</label>
            <input id="proposal-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </>
        )}
        {error && <p className="error">{error}</p>}
        <div className="dialogActions">
          <button type="button" className="ghost" onClick={onClose}>
            Keep editing
          </button>
          <button type="button" className="primary" disabled={errors.length > 0 || busy || !title.trim()} onClick={propose}>
            {busy ? 'Creating…' : 'Create proposal'}
          </button>
        </div>
      </section>
    </div>
  )
}

/** A summary line: **bold** parts in bold. */
function Rich({ line }: { line: string }) {
  return (
    <>
      {line.split('**').map((part, i) => (i % 2 ? <b key={i}>{part}</b> : <span key={i}>{part}</span>))}
    </>
  )
}

const STATE_TEXT: Record<Proposal['state'], string> = {
  checking: 'Checking… (the tests take about 4 minutes)',
  ready: 'Ready to publish',
  failed: 'The tests failed: see the details on GitHub or ask Claude for help',
  conflict: 'It clashes with another published change: discard it and make it again',
}

function ProposalsPanel({
  onDone,
  unsent,
  onReview,
  token,
  proposals,
  refresh,
  reload,
}: {
  /** A proposal was published or discarded: it leaves the list at once, with a message. */
  onDone(number: number, message: string): void
  /** Changes or uploads not proposed yet. */
  unsent: boolean
  onReview(): void
  token: string
  proposals: Proposal[] | null
  refresh(): Promise<void>
  reload(): Promise<void>
}) {
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')
  async function act(p: Proposal, action: 'publish' | 'discard') {
    if (action === 'publish' && !window.confirm(`Publish «${p.title}» to the game?`)) return
    if (action === 'discard' && !window.confirm(`Discard «${p.title}»?`)) return
    setBusy(p.number)
    setError('')
    try {
      if (action === 'publish') await publishProposal(token, p)
      else await discardProposal(token, p)
      onDone(p.number, action === 'publish' ? `«${p.title}» is published: the game updates in a few minutes.` : `«${p.title}» was discarded.`)
      await refresh()
      await reload()
    } catch (e) {
      setError(`GitHub did not allow it: ${(e as Error).message}`)
    }
    setBusy(null)
  }
  if (!proposals) return <p className="loading">Leyendo propuestas…</p>
  return (
    <section className="proposals">
      <div className="paneHead">
        <h2>Proposals</h2>
        <button type="button" className="ghost" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {unsent && (
        <p className="warning">
          You have changes or files not proposed yet: they show here once you create the proposal.{' '}
          <button type="button" className="link" onClick={onReview}>
            Review and propose
          </button>
        </p>
      )}
      {proposals.length === 0 && <p className="muted">No pending proposals. Edit races or equipment and press «Review and propose».</p>}
      <ul>
        {proposals.map((p) => (
          <li key={p.number} className={`proposal ${p.state}`}>
            <div>
              <strong>{p.title}</strong>
              <span className="state">{STATE_TEXT[p.state]}</span>
            </div>
            <div className="proposalActions">
              <a href={p.previewUrl} target="_blank" rel="noreferrer">
                Try in the game
              </a>
              <a href={p.url} target="_blank" rel="noreferrer">
                See on GitHub
              </a>
              <button type="button" className="ghost" disabled={busy !== null} onClick={() => act(p, 'discard')}>
                Discard
              </button>
              <button type="button" className="primary" disabled={busy !== null || p.state !== 'ready'} onClick={() => act(p, 'publish')}>
                {busy === p.number ? 'One moment…' : 'Publish'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="muted small">
        Publish merges the proposal into the game: Cloudflare deploys it in a few minutes and the server gets the new data. «Try in the game» opens Cloudflare's
        preview once it is ready.
      </p>
    </section>
  )
}
