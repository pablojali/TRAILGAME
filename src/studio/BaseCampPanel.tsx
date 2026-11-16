import { useEffect, useState } from 'react'
import { ITEM_LANGUAGES, type ItemLanguage } from '../domain/equipment/items'
import { parseCampCatalog, type CampScene } from '../domain/basecamp/catalog'
import { insertRow, rows, serializeDoc, updateRow, type CsvDoc } from './csvDoc'
import { Field, NumberField, SelectField, TextField } from './fields'
import { listFolder, type RepoFile } from './github'
import { fileBase64, imageSize, megabytes } from './media'
import { Picker } from './MediaPanels'
import type { Workspace } from './model'
import { folders, withUploads } from './uploads'

/** Every piece of a scene is drawn on this canvas (owner decision, 16 November 2026). */
const CAMP_CANVAS = { width: 3200, height: 1600 }
const MAX_BYTES = 20 * 1024 * 1024
const EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const

const campSourceFolder = (scene: CampScene) => `assets/ui/basecamp/source/${scene}`
const campOutputFolder = (scene: CampScene) => `assets/ui/basecamp/${scene}`

/** The house is part of each background (owner, 16 November 2026): cabins only for old rows. */
const KINDS = [
  { value: 'background', label: 'Fondo con la casa (toda la escena)' },
  { value: 'decor', label: 'Agregado (buzón, banners, banderas…)' },
]
const CABIN_KIND = { value: 'cabin', label: 'Cabaña (sobre el fondo)' }
const KIND_LABEL: Record<string, string> = { background: 'Fondo', cabin: 'Cabaña', decor: 'Agregado' }
const CURRENCIES = [
  { value: 'coins', label: 'Créditos (monedas)' },
  { value: 'premium', label: 'Premium Coins' },
]
const LANGUAGE_LABELS: Record<ItemLanguage, string> = { es: 'Español', fr: 'Français', it: 'Italiano', de: 'Deutsch' }
const SCENE_TITLE: Record<CampScene, string> = { exterior: 'Base Camp (exterior)', interior: 'Base Camp (interior)' }
const ACTIONS = [
  { value: '', label: 'Ninguna' },
  { value: 'enter', label: 'Entrar (ir al interior)' },
  { value: 'exit', label: 'Salir (ir al exterior)' },
  { value: 'gear', label: 'Equipo' },
  { value: 'look', label: 'Look (apariencia)' },
  { value: 'mailbox', label: 'Buzón (felicitaciones y visitas)' },
  { value: 'training', label: 'Entreno' },
  { value: 'races', label: 'Carreras' },
  { value: 'career', label: 'Trayectoria' },
]
const ESSENTIAL: Record<CampScene, string> = { exterior: 'Entrar', interior: 'Equipo' }
const ESSENTIAL_ACTION: Record<CampScene, string> = { exterior: 'enter', interior: 'gear' }
const isFree = (values: Record<string, string>) => values.level === '0' && values.price === '0'

function useFolder(token: string, path: string): RepoFile[] | null {
  const [files, setFiles] = useState<{ path: string; files: RepoFile[] } | null>(null)
  useEffect(() => {
    let live = true
    if (!folders().has(path)) folders().set(path, listFolder(token, path).catch(() => []))
    void folders().get(path)!.then((list) => live && setFiles({ path, files: list }))
    return () => {
      live = false
    }
  }, [token, path])
  return files?.path === path ? files.files : null
}

/** The game's check on one row, in words (empty: valid). */
function rowError(doc: CsvDoc, values: Record<string, string>): string {
  // A row is checked with the table's free pieces, which every scene needs.
  const free = rows(doc).filter((r) => isFree(r.values) && r.values.id !== values.id)
  const text = serializeDoc({
    header: doc.header,
    lines: [{ kind: 'header', text: `${doc.header.join(',')}\n` }, ...[...free, { raw: null, values }].map((row) => ({ kind: 'row' as const, row: { raw: null, values: row.values } }))],
  })
  try {
    parseCampCatalog(text)
    return ''
  } catch (error) {
    return (error as Error).message.replace(/^basecamp\.csv( row \d+ \([^)]*\))?: /, '')
  }
}

/**
 * Multimedia › Base Camp (owner design, 16 November 2026): the pieces of one scene of the player's
 * cabin (backgrounds, cabins, decor), their level, price and currency, and their pictures. Every
 * picture is on the same 3200 × 1600 canvas; it goes to assets/ui/basecamp/source and CI prepares
 * the game's WebP when the proposal is published.
 */
export function BaseCampPanel({ token, ws, setWs, scene }: { token: string; ws: Workspace; setWs(ws: Workspace): void; scene: CampScene }) {
  const doc = ws.docs.basecamp
  const sceneRows = rows(doc).filter((r) => r.values.scene === scene)
  const [selected, select] = useState<string | null>(null)
  const [error, setError] = useState('')
  const sources = useFolder(token, campSourceFolder(scene))
  const outputs = useFolder(token, campOutputFolder(scene))
  const current = sceneRows.find((r) => r.values.id === selected) ?? sceneRows[0]
  const v = current?.values
  const baseIds = new Set(rows(ws.docsBase.basecamp).map((r) => r.values.id))

  /** The picture of a piece: this visit's upload, else the published one. */
  const pictureOf = (values: Record<string, string>): string | undefined => {
    const pending = EXTENSIONS.map((ext) => ws.uploads[`${campSourceFolder(scene)}/${values.art}.${ext}`]).find((u) => u?.base64)
    if (pending) return pending.previewUrl
    return outputs?.find((f) => f.name === `${values.art}.webp`)?.url ?? sources?.find((f) => f.name.replace(/\.\w+$/, '') === values.art)?.url
  }
  const backgroundRow = sceneRows.find((r) => r.values.kind === 'background' && isFree(r.values))
  /** The free pieces drawn with the one being edited, so it is seen in its place. */
  const freeLayers = (values: Record<string, string>) =>
    sceneRows
      .filter((r) => r.values.kind !== 'background' && isFree(r.values) && r.values.id !== values.id && !(values.kind === 'cabin' && r.values.kind === 'cabin'))
      .map((r) => pictureOf(r.values))
      .filter((url): url is string => !!url)

  const setPiece = (changes: Record<string, string>) =>
    current && setWs({ ...ws, docs: { ...ws.docs, basecamp: updateRow(doc, (r) => r.values.id === current.values.id, changes) } })

  function addPiece() {
    let n = 1
    while (rows(doc).some((r) => r.values.id === `${scene}-${n}`)) n++
    const id = `${scene}-${n}`
    setWs({
      ...ws,
      docs: {
        ...ws.docs,
        basecamp: insertRow(doc, {
          id,
          scene,
          kind: 'background',
          level: '1',
          price: '50',
          currency: 'coins',
          art: id.replace(/-/g, '_'),
          action: ESSENTIAL_ACTION[scene],
          spot_x: '0.5',
          spot_y: '0.5',
          name: 'New piece',
          name_es: 'Pieza nueva',
        }),
      },
    })
    select(id)
  }

  async function upload(values: Record<string, string>, file: File) {
    setError('')
    const ext = file.name.toLowerCase().split('.').pop() ?? ''
    if (!(EXTENSIONS as readonly string[]).includes(ext)) return setError('Tiene que ser PNG, JPG o WebP (PNG con transparencia para cabañas y agregados).')
    if (file.size > MAX_BYTES) return setError(`${megabytes(file.size)} es demasiado (máximo ${megabytes(MAX_BYTES)}).`)
    const { width, height } = await imageSize(file)
    if (width !== CAMP_CANVAS.width || height !== CAMP_CANVAS.height) {
      return setError(`Tiene que medir ${CAMP_CANVAS.width} × ${CAMP_CANVAS.height} px (esta mide ${width} × ${height}).`)
    }
    if (values.kind !== 'background' && ext !== 'png' && ext !== 'webp') return setError('Cabañas y agregados van en PNG con fondo transparente.')
    const extension = ext === 'jpeg' ? 'jpg' : ext
    const path = `${campSourceFolder(scene)}/${values.art}.${extension}`
    // The same picture with another extension is replaced, so only one source remains.
    const others = (sources ?? []).filter((f) => f.name !== `${values.art}.${extension}` && f.name.replace(/\.\w+$/, '') === values.art)
    const changes: Parameters<typeof withUploads>[1] = {
      [path]: { base64: await fileBase64(file), previewUrl: URL.createObjectURL(file), label: `Base Camp ${scene}: ${values.name_es || values.name} (${file.name})`, bytes: file.size },
    }
    for (const other of others) changes[other.path] = { base64: null, label: `Base Camp ${scene}: imagen anterior ${other.name}` }
    setWs(withUploads(ws, changes))
  }

  return (
    <div className="split">
      <section className="listPane" aria-label={SCENE_TITLE[scene]}>
        <div className="paneHead">
          <h2>
            {SCENE_TITLE[scene]} ({sceneRows.length})
          </h2>
          <button type="button" className="ghost" onClick={addPiece}>
            + Nueva pieza
          </button>
        </div>
        <p className="hint">
          Lienzo de {CAMP_CANVAS.width} × {CAMP_CANVAS.height} px para todas las piezas. Fondos: la escena entera (JPG o PNG). Cabañas y agregados: PNG con
          fondo transparente, en su sitio sobre el lienzo. Nivel 0 y precio 0 = lo tienen todos desde el principio.
        </p>
        <ul className="cards">
          {sceneRows.map((row) => {
            const picture = pictureOf(row.values)
            return (
              <li key={row.values.id}>
                <button type="button" aria-pressed={row.values.id === v?.id} onClick={() => select(row.values.id!)}>
                  <div className="itemCard campCard">
                    <span className="itemTop">
                      <span className="level">Nv {row.values.level}</span>
                      <span className="type">{KIND_LABEL[row.values.kind!] ?? row.values.kind}</span>
                    </span>
                    <strong>{row.values.name_es || row.values.name}</strong>
                    <span className="art">{picture ? <img src={picture} alt="" /> : <span className="noArt">sin imagen</span>}</span>
                    <span className="price">
                      {row.values.price === '0' ? 'Gratis' : `${row.values.currency === 'premium' ? '◆' : '●'} ${row.values.price}`}
                    </span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {v && (
        <section className="editPane" aria-label={`Editar ${v.name}`}>
          <div className="editHead">
            <div>
              <span className="eyebrow">{v.id}</span>
              <h2>{v.name_es || v.name}</h2>
            </div>
          </div>

          <CampPreview
            background={v.kind === 'background' ? pictureOf(v) : backgroundRow && pictureOf(backgroundRow.values)}
            layers={[...(v.kind === 'background' ? [] : freeLayers(v)), ...(v.kind === 'background' ? freeLayers(v) : []), ...(v.kind === 'background' ? [] : [pictureOf(v)])].filter(
              (url): url is string => !!url,
            )}
            spot={v.action && v.spot_x !== '' && v.spot_y !== '' ? { x: Number(v.spot_x), y: Number(v.spot_y) } : null}
            onPick={v.action ? ({ x, y }) => setPiece({ spot_x: x.toFixed(3), spot_y: y.toFixed(3) }) : undefined}
          />
          <p className="hint">
            {v.action
              ? 'Haz clic en la imagen para colocar el botón de la acción.'
              : 'Sin acción: la pieza solo decora. Elige una acción para que al tocarla haga algo.'}{' '}
            Las piezas gratis de la escena tienen que incluir «{ESSENTIAL[scene]}».
          </p>
          {rowError(doc, v) && <p className="error">El juego no aceptaría esta pieza: {rowError(doc, v)}</p>}

          <h3>Pieza</h3>
          <div className="form">
            <SelectField
              label="Tipo"
              value={v.kind!}
              options={v.kind === 'cabin' ? [...KINDS, CABIN_KIND] : KINDS}
              onChange={(kind) =>
                // A background always has the scene's door (or gear bench): its spot shows at once.
                setPiece(kind === 'background' ? { kind, action: ESSENTIAL_ACTION[scene]!, spot_x: v.spot_x || '0.5', spot_y: v.spot_y || '0.5' } : { kind })
              }
            />
            {v.kind === 'background' ? (
              <Field label="Acción al tocarla" hint="Todo fondo lleva la puerta de su casa: haz clic en la imagen para colocarla.">
                {() => <p className="fixedValue">{ESSENTIAL[scene]}</p>}
              </Field>
            ) : (
              <SelectField
                label="Acción al tocarla"
                value={v.action ?? ''}
                options={ACTIONS}
                onChange={(action) => setPiece(action ? { action, spot_x: v.spot_x || '0.5', spot_y: v.spot_y || '0.5' } : { action, spot_x: '', spot_y: '' })}
              />
            )}
            <NumberField label="Nivel del jugador" value={v.level!} min={0} onChange={(x) => setPiece({ level: x })} hint="Desde qué nivel se puede comprar" />
            <NumberField label="Precio" value={v.price!} min={0} onChange={(x) => setPiece({ price: x })} hint="0 con nivel 0: la tienen todos" />
            <SelectField label="Moneda" value={v.currency || 'coins'} options={CURRENCIES} onChange={(x) => setPiece({ currency: x })} />
            {v.action && (
              <>
                <NumberField label="Punto: x (0–1)" value={v.spot_x ?? ''} step={0.01} min={0} max={1} onChange={(x) => setPiece({ spot_x: x })} />
                <NumberField label="Punto: y (0–1)" value={v.spot_y ?? ''} step={0.01} min={0} max={1} onChange={(x) => setPiece({ spot_y: x })} />
              </>
            )}
            <Field label="Imagen" hint={`${CAMP_CANVAS.width} × ${CAMP_CANVAS.height} px. Se convierte sola al publicar la propuesta.`} wide>
              {() => (
                <>
                  <div className="inputRow">
                    <code>{v.art}</code>
                    <Picker accept="image/png,image/jpeg,image/webp" label={pictureOf(v) ? 'Cambiar imagen' : 'Subir imagen'} onFile={(file) => void upload(v, file)} />
                  </div>
                  {error && <span className="error">{error}</span>}
                </>
              )}
            </Field>
          </div>

          <h3>Nombre</h3>
          <div className="form">
            <TextField label="Nombre (English)" value={v.name!} onChange={(x) => setPiece({ name: x })} />
            {ITEM_LANGUAGES.map((language) => (
              <TextField
                key={language}
                label={`Nombre (${LANGUAGE_LABELS[language]})`}
                value={v[`name_${language}`] ?? ''}
                placeholder="vacío = en inglés"
                onChange={(x) => setPiece({ [`name_${language}`]: x })}
              />
            ))}
          </div>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              const published = baseIds.has(v.id)
              if (
                published &&
                !window.confirm(
                  `¿Quitar «${v.name_es || v.name}» del juego? Desaparece también de los jugadores que la usan o la compraron, y su imagen se borra al publicar.`,
                )
              )
                return
              // Its picture goes too (published sources are deleted with the proposal).
              const pictures: Parameters<typeof withUploads>[1] = {}
              for (const ext of EXTENSIONS) {
                const path = `${campSourceFolder(scene)}/${v.art}.${ext}`
                if (ws.uploads[path]) pictures[path] = undefined
              }
              const shared = sceneRows.some((r) => r.values.id !== v.id && r.values.art === v.art)
              for (const file of shared ? [] : (sources ?? [])) {
                if (published && file.name.replace(/\.\w+$/, '') === v.art) pictures[file.path] = { base64: null, label: `Base Camp ${scene}: imagen de ${v.id} (quitada)` }
              }
              const next = withUploads(ws, pictures)
              setWs({ ...next, docs: { ...next.docs, basecamp: { ...doc, lines: doc.lines.filter((l) => l.kind !== 'row' || l.row.values.id !== v.id) } } })
              select(null)
            }}
          >
            {baseIds.has(v.id) ? 'Quitar esta pieza del juego' : 'Quitar esta pieza nueva'}
          </button>
        </section>
      )}
    </div>
  )
}

/** The scene as a new player sees it, with the piece in its place and its action's button. */
function CampPreview({
  background,
  layers,
  spot,
  onPick,
}: {
  background?: string
  layers: string[]
  spot: { x: number; y: number } | null
  onPick?(spot: { x: number; y: number }): void
}) {
  return (
    <div
      className={`campPreview${onPick ? ' pick' : ''}`}
      onClick={(e) => {
        if (!onPick) return
        const box = e.currentTarget.getBoundingClientRect()
        onPick({ x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)) })
      }}
    >
      {background ? <img src={background} alt="" /> : <span className="noArt">sin fondo</span>}
      {layers.map((url) => (
        <img key={url} src={url} alt="" />
      ))}
      {spot && <span className="campSpot" style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }} />}
    </div>
  )
}
