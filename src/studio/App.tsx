import { useCallback, useEffect, useRef, useState } from 'react'
import { BalancePanel } from './BalancePanel'
import { MajorsPanel } from './MajorsPanel'
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
import { RacesPanel } from './RacesPanel'

const DRAFT_KEY = 'trailgame.studio.draft'
type Tab = 'races' | 'equipment' | 'coach' | 'notifications' | 'texts' | 'balance' | 'majors' | 'changes'

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
        setNotice('Recuperé tus cambios sin guardar.')
      } else {
        if (draft) setNotice('Las tablas cambiaron en el juego desde tu último borrador: empiezo desde la versión publicada.')
        storeDraft(null)
        setWsState(openWorkspace(base))
      }
    } catch (e) {
      setError(`No pude leer las tablas: ${(e as Error).message}`)
    }
  }, [])

  // Proposals published or discarded here never come back, even while GitHub's list catches up.
  const closed = useRef(new Set<number>())
  const refreshProposals = useCallback(async (tok: string) => {
    try {
      setProposals((await listProposals(tok)).filter((p) => !closed.current.has(p.number)))
      // A network hiccup earlier is over.
      setError((current) => (current.startsWith('No pude leer las propuestas') ? '' : current))
    } catch (e) {
      setError(`No pude leer las propuestas: ${(e as Error).message}`)
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
        <nav className="tabs" aria-label="Secciones">
          <button type="button" aria-pressed={tab === 'races'} onClick={() => setTab('races')}>
            Carreras
          </button>
          <button type="button" aria-pressed={tab === 'equipment'} onClick={() => setTab('equipment')}>
            Equipamiento
          </button>
          <button type="button" aria-pressed={tab === 'coach'} onClick={() => setTab('coach')}>
            Coach
          </button>
          <button type="button" aria-pressed={tab === 'notifications'} onClick={() => setTab('notifications')}>
            Notificaciones
          </button>
          <button type="button" aria-pressed={tab === 'texts'} onClick={() => setTab('texts')}>
            Textos
          </button>
          <button type="button" aria-pressed={tab === 'balance'} onClick={() => setTab('balance')}>
            Balance
          </button>
          <button type="button" aria-pressed={tab === 'majors'} onClick={() => setTab('majors')}>
            Majors
          </button>
          <button type="button" aria-pressed={tab === 'changes'} onClick={() => setTab('changes')}>
            Propuestas{pending ? ` (${pending})` : ''}
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
          Desconectar
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
        {tab === 'majors' ? (
          <MajorsPanel />
        ) : !ws ? (
          <p className="loading">Leyendo las tablas del juego…</p>
        ) : tab === 'races' ? (
          <RacesPanel token={token} ws={ws} setWs={setWs} selected={raceId} select={setRaceId} />
        ) : tab === 'equipment' ? (
          <EquipmentPanel ws={ws} setWs={setWs} selected={itemId} select={setItemId} />
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

      {/* On every tab, Propuestas included: what is waiting to be proposed is never out of sight. */}
      {ws && hasChanges(ws) && (
        <footer className="saveBar">
          <span>
            Sin guardar:{' '}
            {[changed.length && (changed.length === 1 ? '1 tabla o texto' : `${changed.length} tablas o textos`), uploads && (uploads === 1 ? '1 archivo' : `${uploads} archivos`)]
              .filter(Boolean)
              .join(' y ')}
            .
          </span>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              if (window.confirm('¿Descartar todos los cambios sin guardar?')) setWs(freshWorkspace(ws))
            }}
          >
            Descartar
          </button>
          <button type="button" className="primary" onClick={() => setReviewing(true)}>
            Revisar y proponer
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
      setError(`GitHub no aceptó el token: ${(e as Error).message}`)
    }
    setBusy(false)
  }
  return (
    <div className="connect">
      <h1>
        Trail <b>Studio</b>
      </h1>
      <p>Para leer y proponer cambios al juego, conecta tu cuenta de GitHub con un token (solo una vez en este navegador).</p>
      <ol>
        <li>
          Abre{' '}
          <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
            GitHub → Fine-grained token
          </a>
          .
        </li>
        <li>
          Nombre: <i>Trail Studio</i>. Repository access: <i>Only select repositories → TRAILGAME</i>.
        </li>
        <li>
          Permisos del repositorio: <i>Contents: Read and write</i>, <i>Pull requests: Read and write</i>, <i>Commit statuses: Read</i>.
        </li>
        <li>Genera el token, cópialo y pégalo aquí.</li>
      </ol>
      <label htmlFor="token">Token</label>
      <input id="token" type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="github_pat_…" />
      {error && <p className="error">{error}</p>}
      <button type="button" className="primary" disabled={!value.trim() || busy} onClick={connect}>
        {busy ? 'Comprobando…' : 'Conectar'}
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
  const { races, equipment, coach, announcements, balance, texts } = summary(ws)
  const media = Object.values(ws.uploads).map((u) => (u.base64 === null ? u.label : `${u.label}${u.bytes ? ` (${megabytes(u.bytes)})` : ''}`))
  const migration = needsRankingMigration(ws)
  const [title, setTitle] = useState(() => {
    const parts = [
      races.length && `${races.length} carrera${races.length > 1 ? 's' : ''}`,
      equipment.length && `${equipment.length} artículo${equipment.length > 1 ? 's' : ''}`,
      coach.length && 'coach',
      announcements.length && `${announcements.length} aviso${announcements.length > 1 ? 's' : ''}`,
      balance.length && 'balance',
      texts.length && `${texts.length} texto${texts.length > 1 ? 's' : ''}`,
      media.length && `${media.length} archivo${media.length > 1 ? 's' : ''}`,
    ].filter(Boolean)
    return `Studio: cambios en ${parts.join(', ')}`
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function propose() {
    setBusy(true)
    setError('')
    const lines = [
      'Cambios hechos en **Trail Studio** por el diseñador.',
      '',
      ...(races.length ? ['### Carreras', ...races.map((l) => `- ${l}`), ''] : []),
      ...(equipment.length ? ['### Equipamiento', ...equipment.map((l) => `- ${l}`), ''] : []),
      ...(coach.length ? ['### Coach', ...coach.map((l) => `- ${l}`), ''] : []),
      ...(announcements.length ? ['### Avisos a todos los jugadores', ...announcements.map((l) => `- ${l}`), ''] : []),
      ...(balance.length ? ['### Balance', ...balance.map((l) => `- ${l}`), ''] : []),
      ...(texts.length ? ['### Textos', ...texts.map((l) => `- ${l}`), ''] : []),
      ...(media.length ? ['### Fotos y vídeos', ...media.map((l) => `- ${l}`), ''] : []),
      ...(migration
        ? ['⚠️ Incluye una migración de los rankings (niveles o dificultades de carreras, puntos por puesto o rivales NPC). Después de publicar hay que aplicarla en Supabase: pídeselo a Claude.', '']
        : []),
      'La vista previa del juego muestra los cambios; el servidor usa los datos publicados hasta que se publique esta propuesta.',
    ]
    try {
      onCreated(await createProposal(token, proposalFiles(ws, new Date()), title, lines.join('\n'), new Date(), proposalMedia(ws)))
    } catch (e) {
      setError(`GitHub no aceptó la propuesta: ${(e as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <div className="dialogBack" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="review-title">
        <h2 id="review-title">Revisar cambios</h2>
        {races.length > 0 && (
          <>
            <h3>Carreras</h3>
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
            <h3>Equipamiento</h3>
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
            ['Avisos a todos', announcements],
            ['Balance', balance],
            ['Textos', texts],
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
            <h3>Fotos y vídeos</h3>
            <ul className="changes">
              {media.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        )}
        {migration && <p className="warning">Cambian datos de los rankings: la propuesta incluye su migración. Después de publicar, avisa a Claude para aplicarla.</p>}
        {pendingProposals > 0 && <p className="warning">Tienes otra propuesta sin publicar: si tocan las mismas tablas, publica una antes de la otra.</p>}
        {errors.length > 0 ? (
          <div className="error">
            <p>El juego no aceptaría estos cambios. Corrígelos antes de proponer:</p>
            <ul>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <label htmlFor="proposal-title">Título</label>
            <input id="proposal-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </>
        )}
        {error && <p className="error">{error}</p>}
        <div className="dialogActions">
          <button type="button" className="ghost" onClick={onClose}>
            Seguir editando
          </button>
          <button type="button" className="primary" disabled={errors.length > 0 || busy || !title.trim()} onClick={propose}>
            {busy ? 'Creando…' : 'Crear propuesta'}
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
  checking: 'Comprobando… (los tests tardan unos 4 minutos)',
  ready: 'Lista para publicar',
  failed: 'Los tests fallaron: revisa el detalle en GitHub o pídele ayuda a Claude',
  conflict: 'Choca con otro cambio publicado: descártala y vuelve a hacerla',
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
    if (action === 'publish' && !window.confirm(`¿Publicar «${p.title}» en el juego?`)) return
    if (action === 'discard' && !window.confirm(`¿Descartar «${p.title}»?`)) return
    setBusy(p.number)
    setError('')
    try {
      if (action === 'publish') await publishProposal(token, p)
      else await discardProposal(token, p)
      onDone(p.number, action === 'publish' ? `«${p.title}» está publicada: el juego se actualiza en unos minutos.` : `«${p.title}» se descartó.`)
      await refresh()
      await reload()
    } catch (e) {
      setError(`GitHub no lo permitió: ${(e as Error).message}`)
    }
    setBusy(null)
  }
  if (!proposals) return <p className="loading">Leyendo propuestas…</p>
  return (
    <section className="proposals">
      <div className="paneHead">
        <h2>Propuestas</h2>
        <button type="button" className="ghost" onClick={() => void refresh()}>
          Actualizar
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {unsent && (
        <p className="warning">
          Tienes cambios o archivos sin proponer: no aparecen aquí hasta que crees la propuesta.{' '}
          <button type="button" className="link" onClick={onReview}>
            Revisar y proponer
          </button>
        </p>
      )}
      {proposals.length === 0 && <p className="muted">No hay propuestas pendientes. Edita carreras o equipamiento y pulsa «Revisar y proponer».</p>}
      <ul>
        {proposals.map((p) => (
          <li key={p.number} className={`proposal ${p.state}`}>
            <div>
              <strong>{p.title}</strong>
              <span className="state">{STATE_TEXT[p.state]}</span>
            </div>
            <div className="proposalActions">
              <a href={p.previewUrl} target="_blank" rel="noreferrer">
                Probar en el juego
              </a>
              <a href={p.url} target="_blank" rel="noreferrer">
                Ver en GitHub
              </a>
              <button type="button" className="ghost" disabled={busy !== null} onClick={() => act(p, 'discard')}>
                Descartar
              </button>
              <button type="button" className="primary" disabled={busy !== null || p.state !== 'ready'} onClick={() => act(p, 'publish')}>
                {busy === p.number ? 'Un momento…' : 'Publicar'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="muted small">
        Publicar une la propuesta al juego: Cloudflare lo despliega en unos minutos y el servidor recibe los datos nuevos. «Probar en el juego» abre la vista previa
        de Cloudflare cuando está lista.
      </p>
    </section>
  )
}
