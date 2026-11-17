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
/** The canvas of each scene (owner, 17 November 2026: the living room narrower than outside). */
const CAMP_CANVASES: Record<CampScene, { width: number; height: number }> = {
  exterior: { width: 3200, height: 1600 },
  interior: { width: 2600, height: 1600 },
}
const MAX_BYTES = 20 * 1024 * 1024
const EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const

const campSourceFolder = (scene: CampScene) => `assets/ui/basecamp/source/${scene}`
const campOutputFolder = (scene: CampScene) => `assets/ui/basecamp/${scene}`

/** The house is part of each background (owner, 16 November 2026): cabins only for old rows. */
const KINDS = [
  { value: 'background', label: 'Fondo con la casa (toda la escena)' },
  { value: 'decor', label: 'Objeto (buzón, banderas…): el jugador lo pone en un hueco' },
]
/** Most objects' pictures are cut-outs, not on the canvas: their biggest side. */
const MAX_OBJECT_SIDE = 2400

type Slot = { x: number; y: number; scale: number }
const readSlots = (text: string | undefined): Slot[] =>
  (text ?? '')
    .split('|')
    .filter(Boolean)
    .map((part) => {
      const [x, y, scale] = part.split(':').map(Number)
      return { x: x ?? 0.5, y: y ?? 0.8, scale: scale ?? 1 }
    })
const writeSlots = (slots: Slot[]) => slots.map((sl) => `${+sl.x.toFixed(3)}:${+sl.y.toFixed(3)}:${+sl.scale.toFixed(2)}`).join('|')
const CABIN_KIND = { value: 'cabin', label: 'Cabaña (sobre el fondo)' }
const KIND_LABEL: Record<string, string> = { background: 'Fondo', cabin: 'Cabaña', decor: 'Objeto' }
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
  const CAMP_CANVAS = CAMP_CANVASES[scene]
  const sceneRows = rows(doc).filter((r) => r.values.scene === scene)
  const [selected, select] = useState<string | null>(null)
  const [error, setError] = useState('')
  /** What a click on a background's preview places: its door (0) or slot 1 to 4. */
  const [target, setTarget] = useState(0)
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
      .filter((r) => r.values.kind === 'cabin' && isFree(r.values) && r.values.id !== values.id && values.kind !== 'cabin')
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
    if (values.kind === 'decor') {
      // An object is a cut-out: any size up to MAX_OBJECT_SIDE, transparent.
      if (ext !== 'png' && ext !== 'webp') return setError('Un objeto va en PNG con fondo transparente, recortado.')
      if (Math.max(width, height) > MAX_OBJECT_SIDE) return setError(`Como mucho ${MAX_OBJECT_SIDE} px por lado (esta mide ${width} × ${height}).`)
    } else {
      if (width !== CAMP_CANVAS.width || height !== CAMP_CANVAS.height) {
        return setError(`Tiene que medir ${CAMP_CANVAS.width} × ${CAMP_CANVAS.height} px (esta mide ${width} × ${height}).`)
      }
      if (values.kind !== 'background' && ext !== 'png' && ext !== 'webp') return setError('Las cabañas van en PNG con fondo transparente.')
    }
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

          {v.kind === 'decor' ? (
            <CampPreview
              ratio={CAMP_CANVAS.width / CAMP_CANVAS.height}
              background={backgroundRow && pictureOf(backgroundRow.values)}
              layers={[]}
              objects={(() => {
                // The object in slot 1 of the scene's free background (or low in the middle).
                const at = readSlots(backgroundRow?.values.slots)[0] ?? { x: 0.5, y: 0.9, scale: 1 }
                const url = pictureOf(v)
                return url ? [{ url, ...at, height: (Number(v.size) || 0.2) * at.scale }] : []
              })()}
              marks={[]}
            />
          ) : (
            <CampPreview
              ratio={CAMP_CANVAS.width / CAMP_CANVAS.height}
              background={v.kind === 'background' ? pictureOf(v) : backgroundRow && pictureOf(backgroundRow.values)}
              layers={[...freeLayers(v), ...(v.kind === 'background' ? [] : [pictureOf(v)])].filter((url): url is string => !!url)}
              objects={(() => {
                // The free objects fill the slots in order, as a new player sees them.
                if (v.kind !== 'background') return []
                const slots = readSlots(v.slots)
                const free = sceneRows.filter((r) => r.values.kind === 'decor' && isFree(r.values))
                return free.slice(0, slots.length).flatMap((r, i) => {
                  const url = pictureOf(r.values)
                  const at = slots[i]!
                  return url ? [{ url, x: at.x, y: at.y, height: (Number(r.values.size) || 0.2) * at.scale }] : []
                })
              })()}
              marks={[
                ...(v.action && v.spot_x !== '' && v.spot_y !== '' ? [{ label: '🚪', x: Number(v.spot_x), y: Number(v.spot_y), on: target === 0 }] : []),
                ...(v.kind === 'background' ? readSlots(v.slots).map((sl, i) => ({ label: String(i + 1), x: sl.x, y: sl.y, on: target === i + 1 })) : []),
              ]}
              onPick={({ x, y }) => {
                if (v.kind === 'background' && target > 0) {
                  const slots = readSlots(v.slots)
                  slots[target - 1] = { x, y, scale: slots[target - 1]?.scale ?? 1 }
                  setPiece({ slots: writeSlots(slots) })
                } else if (v.action) {
                  setPiece({ spot_x: x.toFixed(3), spot_y: y.toFixed(3) })
                }
              }}
            />
          )}
          {v.kind === 'background' ? (
            <>
              <div className="chips" role="group" aria-label="Qué colocas con un clic">
                {[0, 1, 2, 3, 4].map((n) => (
                  <button key={n} type="button" aria-pressed={target === n} onClick={() => setTarget(n)} disabled={n > readSlots(v.slots).length + 1}>
                    {n === 0 ? `Puerta («${ESSENTIAL[scene]}»)` : `Hueco ${n}`}
                  </button>
                ))}
              </div>
              <p className="hint">
                Elige qué colocas y haz clic en la imagen: la puerta, o un hueco donde el jugador puede poner objetos (buzón, banderas…). Cada hueco es el punto
                donde el objeto se apoya (su base) y tiene un tamaño: más pequeño lejos, más grande cerca. Hasta 4 huecos, numerados igual en todos los
                fondos.
              </p>
            </>
          ) : (
            <p className="hint">
              {v.kind === 'decor'
                ? 'El objeto se ve en el hueco 1 del fondo gratis. En el juego, cada jugador elige en qué hueco lo pone; si tiene acción, su botón va sobre el objeto.'
                : v.action
                  ? 'Haz clic en la imagen para colocar el botón de la acción.'
                  : 'Sin acción: la pieza solo decora.'}{' '}
              Las piezas gratis de la escena tienen que incluir «{ESSENTIAL[scene]}».
            </p>
          )}
          {rowError(doc, v) && <p className="error">El juego no aceptaría esta pieza: {rowError(doc, v)}</p>}

          <h3>Pieza</h3>
          <div className="form">
            <SelectField
              label="Tipo"
              value={v.kind!}
              options={v.kind === 'cabin' ? [...KINDS, CABIN_KIND] : KINDS}
              onChange={(kind) =>
                // A background always has the scene's door (or gear bench): its spot shows at once.
                setPiece(
                  kind === 'background'
                    ? { kind, action: ESSENTIAL_ACTION[scene]!, spot_x: v.spot_x || '0.5', spot_y: v.spot_y || '0.5', size: '' }
                    : kind === 'decor'
                      ? { kind, spot_x: '', spot_y: '', slots: '', size: v.size || '0.2' }
                      : { kind, slots: '', size: '' },
                )
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
                onChange={(action) =>
                  // An object carries its button on itself; a cabin's button is placed on the picture.
                  setPiece(v.kind === 'decor' || !action ? { action, spot_x: '', spot_y: '' } : { action, spot_x: v.spot_x || '0.5', spot_y: v.spot_y || '0.5' })
                }
              />
            )}
            <NumberField label="Nivel del jugador" value={v.level!} min={0} onChange={(x) => setPiece({ level: x })} hint="Desde qué nivel se puede comprar" />
            <NumberField label="Precio" value={v.price!} min={0} onChange={(x) => setPiece({ price: x })} hint="0 con nivel 0: la tienen todos" />
            <SelectField label="Moneda" value={v.currency || 'coins'} options={CURRENCIES} onChange={(x) => setPiece({ currency: x })} />
            {v.kind === 'decor' && (
              <NumberField
                label="Altura en la escena (%)"
                value={v.size ? String(Math.round(Number(v.size) * 1000) / 10) : ''}
                step={1}
                min={2}
                max={90}
                onChange={(x) => setPiece({ size: x === '' ? '' : String(Math.round(Number(x) * 10) / 1000) })}
                hint="Alto del objeto respecto del alto de la imagen, en un hueco de tamaño 1"
              />
            )}
            {v.kind === 'background' &&
              readSlots(v.slots).map((sl, i) => (
                <Field key={i} label={`Hueco ${i + 1}`} hint={`x ${sl.x.toFixed(2)} · y ${sl.y.toFixed(2)}`}>
                  {(id) => (
                    <div className="inputRow">
                      <input
                        id={id}
                        type="number"
                        step={0.1}
                        min={0.2}
                        max={3}
                        value={sl.scale}
                        aria-label={`Tamaño del hueco ${i + 1}`}
                        onChange={(e) => {
                          const slots = readSlots(v.slots)
                          slots[i] = { ...slots[i]!, scale: Number(e.target.value) || 1 }
                          setPiece({ slots: writeSlots(slots) })
                        }}
                      />
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => {
                          setPiece({ slots: writeSlots(readSlots(v.slots).filter((_, j) => j !== i)) })
                          setTarget(0)
                        }}
                      >
                        Quitar
                      </button>
                    </div>
                  )}
                </Field>
              ))}
            {v.action && v.kind !== 'decor' && (
              <>
                <NumberField label="Punto: x (0–1)" value={v.spot_x ?? ''} step={0.01} min={0} max={1} onChange={(x) => setPiece({ spot_x: x })} />
                <NumberField label="Punto: y (0–1)" value={v.spot_y ?? ''} step={0.01} min={0} max={1} onChange={(x) => setPiece({ spot_y: x })} />
              </>
            )}
            <Field
              label="Imagen"
              hint={
                v.kind === 'decor'
                  ? `PNG recortado con fondo transparente, hasta ${MAX_OBJECT_SIDE} px por lado. Se convierte solo al publicar la propuesta.`
                  : `${CAMP_CANVAS.width} × ${CAMP_CANVAS.height} px. Se convierte sola al publicar la propuesta.`
              }
              wide
            >
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

/** The scene as a new player sees it: the piece in its place, its door and slots marked. */
function CampPreview({
  ratio,
  background,
  layers,
  objects,
  marks,
  onPick,
}: {
  ratio: number
  background?: string
  layers: string[]
  /** Objects standing on a point (their base), `height` as a share of the picture's height. */
  objects: { url: string; x: number; y: number; height: number }[]
  marks: { label: string; x: number; y: number; on: boolean }[]
  onPick?(spot: { x: number; y: number }): void
}) {
  return (
    <div
      className={`campPreview${onPick ? ' pick' : ''}`}
      style={{ aspectRatio: String(ratio) }}
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
      {objects.map((o) => (
        <img key={o.url} className="campObject" src={o.url} alt="" style={{ left: `${o.x * 100}%`, top: `${o.y * 100}%`, height: `${o.height * 100}%` }} />
      ))}
      {marks.map((m) => (
        <span key={m.label} className={`campSpot${m.on ? ' on' : ''}`} style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}>
          {m.label}
        </span>
      ))}
    </div>
  )
}
