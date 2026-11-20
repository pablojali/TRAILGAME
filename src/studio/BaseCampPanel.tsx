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
  { value: 'upgrade', label: 'Mejora de un fondo (otra imagen del mismo fondo, con sus puntos)' },
  { value: 'decor', label: 'Objeto (buzón, soporte de equipo…): imagen del tamaño del fondo, transparente salvo el objeto' },
]
const CABIN_KIND = { value: 'cabin', label: 'Cabaña (sobre el fondo)' }
const KIND_LABEL: Record<string, string> = { background: 'Fondo', upgrade: 'Mejora', cabin: 'Cabaña', decor: 'Objeto' }
type Focus = { x: number; y: number; zoom: number }
const readFocus = (text: string | undefined): Focus => {
  const [x, y, zoom] = (text ?? '').split(':').map(Number)
  return { x: Number.isFinite(x) ? x! : 0.5, y: Number.isFinite(y) ? y! : 0.5, zoom: Number.isFinite(zoom) && zoom! >= 1 ? zoom! : 3 }
}
const writeFocus = (f: Focus) => `${+f.x.toFixed(3)}:${+f.y.toFixed(3)}:${+f.zoom.toFixed(1)}`
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
/** Outside, every background has the door; inside, the owner picks each background's button (17 November 2026). */
const ESSENTIAL: Partial<Record<CampScene, string>> = { exterior: 'Entrar' }
const ESSENTIAL_ACTION: Partial<Record<CampScene, string>> = { exterior: 'enter' }
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
  // A row is checked with the table's free pieces, which every scene needs, and an upgrade with its background.
  const free = rows(doc).filter((r) => (isFree(r.values) || r.values.id === values.base) && r.values.id !== values.id)
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

  /**
   * The list in groups (owner request, 20 November 2026): backgrounds, upgrades of a background,
   * then one group per family (each evolution of a firepit, a sofa…), then objects with none.
   */
  const families = [...new Set(sceneRows.map((r) => r.values.family).filter((f): f is string => !!f))]
  const groups: { key: string; title: string; family?: string; rows: typeof sceneRows }[] = [
    { key: 'background', title: 'Fondos', rows: sceneRows.filter((r) => r.values.kind === 'background' || r.values.kind === 'cabin') },
    { key: 'upgrade', title: 'Mejoras de un fondo', rows: sceneRows.filter((r) => r.values.kind === 'upgrade' && !r.values.family) },
    ...families.map((family) => ({
      key: `family:${family}`,
      family,
      title: `Familia «${family}» (evoluciones)`,
      rows: sceneRows.filter((r) => r.values.family === family).sort((x, y) => Number(x.values.level) - Number(y.values.level)),
    })),
    { key: 'decor', title: 'Objetos sin familia', rows: sceneRows.filter((r) => r.values.kind === 'decor' && !r.values.family) },
  ].filter((group) => group.rows.length > 0 || group.key === 'background')

  /** The next level of a family: a copy of its last one, one level up, that requires it. */
  function addEvolution(family: string) {
    const last = sceneRows.filter((r) => r.values.family === family).sort((x, y) => Number(x.values.level) - Number(y.values.level)).at(-1)
    if (!last) return
    let n = 1
    while (rows(doc).some((r) => r.values.id === `${scene}-${n}`)) n++
    const id = `${scene}-${n}`
    setWs({
      ...ws,
      docs: {
        ...ws.docs,
        basecamp: insertRow(doc, {
          ...last.values,
          id,
          art: id.replace(/-/g, '_'),
          level: String(Number(last.values.level || 0) + 1),
          requires: last.values.id!,
          name: `${last.values.name || family} +`,
          name_es: `${last.values.name_es || last.values.name || family} +`,
        }),
      },
    })
    select(id)
  }

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
          action: ESSENTIAL_ACTION[scene] ?? '',
          spot_x: ESSENTIAL_ACTION[scene] ? '0.5' : '',
          spot_y: ESSENTIAL_ACTION[scene] ? '0.5' : '',
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
    // Every piece is on the scene's canvas (objects too since 20 November 2026: transparent but for the object).
    if (width !== CAMP_CANVAS.width || height !== CAMP_CANVAS.height) {
      return setError(`Tiene que medir ${CAMP_CANVAS.width} × ${CAMP_CANVAS.height} px (esta mide ${width} × ${height}).`)
    }
    if ((values.kind === 'cabin' || values.kind === 'decor') && ext !== 'png' && ext !== 'webp') return setError('Las cabañas y los objetos van en PNG con fondo transparente.')
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
        {groups.map((group) => (
          <div key={group.key} className="campGroup">
            <div className="paneHead">
              <h3>{group.title}</h3>
              {group.family && (
                <button type="button" className="ghost small" onClick={() => addEvolution(group.family!)}>
                  + Nueva evolución
                </button>
              )}
            </div>
            <ul className="cards">
              {group.rows.map((row) => {
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
          </div>
        ))}
      </section>

      {v && (
        <section className="editPane" aria-label={`Editar ${v.name}`}>
          <div className="editHead">
            <div>
              <span className="eyebrow">{v.id}</span>
              <h2>{v.name_es || v.name}</h2>
            </div>
          </div>

          {v.kind === 'upgrade' || v.kind === 'decor' ? (
            (() => {
              // Its own picture over its background (an upgrade's, or the scene's free one for an
              // object), and the part the shop shows: a click moves it. An object's button sits at
              // the centre of that frame.
              const base = v.kind === 'upgrade' ? sceneRows.find((r) => r.values.id === v.base)?.values : backgroundRow?.values
              const focus = readFocus(v.focus)
              return (
                <CampPreview
                  ratio={CAMP_CANVAS.width / CAMP_CANVAS.height}
                  background={base ? pictureOf(base) : undefined}
                  layers={[pictureOf(v)].filter((url): url is string => !!url)}
                  marks={[
                    ...(v.kind === 'upgrade' && base?.action && base.spot_x && base.spot_y
                      ? [{ label: ESSENTIAL[scene] ? '🚪' : '●', x: Number(base.spot_x), y: Number(base.spot_y), on: false }]
                      : []),
                    ...(v.kind === 'decor' && v.action ? [{ label: '●', x: focus.x, y: focus.y, on: true }] : []),
                  ]}
                  frame={focus}
                  onPick={({ x, y }) => setPiece({ focus: writeFocus({ ...focus, x, y }) })}
                />
              )
            })()
          ) : (
            <CampPreview
              ratio={CAMP_CANVAS.width / CAMP_CANVAS.height}
              background={v.kind === 'background' ? pictureOf(v) : backgroundRow && pictureOf(backgroundRow.values)}
              layers={[...freeLayers(v), ...(v.kind === 'background' ? [] : [pictureOf(v)])].filter((url): url is string => !!url)}
              marks={v.action && v.spot_x !== '' && v.spot_y !== '' ? [{ label: ESSENTIAL[scene] ? '🚪' : '●', x: Number(v.spot_x), y: Number(v.spot_y), on: true }] : []}
              onPick={({ x, y }) => {
                if (v.action) setPiece({ spot_x: x.toFixed(3), spot_y: y.toFixed(3) })
              }}
            />
          )}
          {v.kind === 'background' ? (
            <p className="hint">Haz clic en la imagen para colocar el botón de su acción{ESSENTIAL[scene] ? ` («${ESSENTIAL[scene]}»)` : ''}.</p>
          ) : v.kind === 'upgrade' ? (
            <p className="hint">
              Una mejora es el mismo fondo redibujado (otra cabaña, otra estufa…), del mismo tamaño. Usa el botón de su fondo: si lo mueves en el fondo, se
              mueve también aquí. El recuadro es lo que muestra la tienda: haz clic sobre lo que cambia y ajusta el zoom. El jugador elige una
              mejora de cada fondo, o ninguna. Se dibuja encima de su fondo: lo que dejes transparente (PNG) muestra el fondo de debajo, así puedes
              subir solo lo que cambia (un fogón, una estufa).
            </p>
          ) : (
            <p className="hint">
              {v.kind === 'decor'
                ? 'Un objeto es una imagen del tamaño del fondo, transparente salvo el objeto, dibujada encima (como una mejora). Haz clic sobre el objeto: ese recuadro es lo que muestra la tienda y, si tiene acción, su botón va en el centro. El jugador puede poner todos los que tenga a la vez.'
                : v.action
                  ? 'Haz clic en la imagen para colocar el botón de la acción.'
                  : 'Sin acción: la pieza solo decora.'}{' '}
              {ESSENTIAL[scene] && <>Las piezas gratis de la escena tienen que incluir «{ESSENTIAL[scene]}».</>}
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
                  kind === 'upgrade'
                    ? {
                        kind,
                        action: '',
                        spot_x: '',
                        spot_y: '',
                        slots: '',
                        size: '',
                        base: v.base || sceneRows.find((r) => r.values.kind === 'background')?.values.id || '',
                        focus: v.focus || '0.5:0.5:3',
                      }
                    : kind === 'background'
                    ? ESSENTIAL_ACTION[scene]
                      ? { kind, action: ESSENTIAL_ACTION[scene], spot_x: v.spot_x || '0.5', spot_y: v.spot_y || '0.5', size: '', base: '', focus: '' }
                      : { kind, size: '', base: '', focus: '' }
                    : kind === 'decor'
                      ? { kind, spot_x: '', spot_y: '', slots: '', size: '', base: '', focus: v.focus || '0.5:0.5:3' }
                      : { kind, slots: '', size: '', base: '', focus: '' },
                )
              }
            />
            {v.kind === 'upgrade' ? (
              <>
                <SelectField
                  label="Mejora del fondo"
                  value={v.base ?? ''}
                  options={sceneRows.filter((r) => r.values.kind === 'background').map((r) => ({ value: r.values.id!, label: r.values.name_es || r.values.name || r.values.id! }))}
                  onChange={(base) => setPiece({ base })}
                />
                <NumberField
                  label="Zoom en la tienda"
                  value={String(readFocus(v.focus).zoom)}
                  step={0.5}
                  min={1}
                  max={8}
                  onChange={(x) => setPiece({ focus: writeFocus({ ...readFocus(v.focus), zoom: Math.min(8, Math.max(1, Number(x) || 1)) }) })}
                  hint="1 = la imagen entera; 4 = un cuarto de ancho"
                />
              </>
            ) : null}
            {v.kind === 'decor' && (
              <NumberField
                label="Zoom en la tienda"
                value={String(readFocus(v.focus).zoom)}
                step={0.5}
                min={1}
                max={8}
                onChange={(x) => setPiece({ focus: writeFocus({ ...readFocus(v.focus), zoom: Math.min(8, Math.max(1, Number(x) || 1)) }) })}
                hint="1 = la imagen entera; 4 = un cuarto de ancho"
              />
            )}
            {v.kind === 'upgrade' ? null : v.kind === 'background' && ESSENTIAL[scene] ? (
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
            {(v.kind === 'decor' || v.kind === 'upgrade') && (
              <Field label="Familia (evoluciones)" hint="Mismo nombre = niveles de lo mismo (p. ej. fogata): el jugador usa uno a la vez, el nuevo reemplaza al anterior. Vacío: ninguna.">
                {(id) => (
                  <>
                    <input
                      id={id}
                      list={`${id}-families`}
                      value={v.family ?? ''}
                      placeholder="p. ej. fogata"
                      onChange={(e) => setPiece({ family: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                    />
                    <datalist id={`${id}-families`}>
                      {families.map((f) => (
                        <option key={f} value={f} />
                      ))}
                    </datalist>
                  </>
                )}
              </Field>
            )}
            <Field label="Requiere" hint="Piezas que el jugador debe tener antes de comprar esta (p. ej. la fogata nivel 2 requiere la casa nivel 1)." wide>
              {(id) => {
                const required = (v.requires ?? '').split(/\s+/).filter(Boolean)
                const nameOf = (rid: string) => {
                  const row = rows(doc).find((r) => r.values.id === rid)?.values
                  return row ? `${row.name_es || row.name} (${row.scene === 'exterior' ? 'ext' : 'int'}, nv ${row.level})` : rid
                }
                return (
                  <div className="chips">
                    {required.map((rid) => (
                      <button key={rid} type="button" className="ghost small" title="Quitar" onClick={() => setPiece({ requires: required.filter((x) => x !== rid).join(' ') })}>
                        {nameOf(rid)} ✕
                      </button>
                    ))}
                    <select id={id} value="" onChange={(e) => e.target.value && setPiece({ requires: [...required, e.target.value].join(' ') })}>
                      <option value="">+ Añadir…</option>
                      {rows(doc)
                        .filter((r) => r.values.id !== v.id && !required.includes(r.values.id!))
                        .map((r) => (
                          <option key={r.values.id} value={r.values.id}>
                            {nameOf(r.values.id!)}
                          </option>
                        ))}
                    </select>
                  </div>
                )
              }}
            </Field>
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
                  ? `${CAMP_CANVAS.width} × ${CAMP_CANVAS.height} px, PNG transparente salvo el objeto. Se convierte solo al publicar la propuesta.`
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

/** The scene as a new player sees it: the piece in its place, its button marked. */
function CampPreview({
  ratio,
  background,
  layers,
  marks,
  frame,
  onPick,
}: {
  ratio: number
  background?: string
  layers: string[]
  marks: { label: string; x: number; y: number; on: boolean }[]
  /** An upgrade's shop frame: 1/zoom of the picture each way, around its centre (kept inside). */
  frame?: Focus
  onPick?(spot: { x: number; y: number }): void
}) {
  const side = frame ? 1 / frame.zoom : 0
  const start = (centre: number) => Math.min(Math.max(centre - side / 2, 0), 1 - side)
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
      {frame && <span className="campFrame" style={{ left: `${start(frame.x) * 100}%`, top: `${start(frame.y) * 100}%`, width: `${side * 100}%`, height: `${side * 100}%` }} />}
      {marks.map((m) => (
        <span key={m.label} className={`campSpot${m.on ? ' on' : ''}`} style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}>
          {m.label}
        </span>
      ))}
    </div>
  )
}
