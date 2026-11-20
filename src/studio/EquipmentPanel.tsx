import { useMemo, useState } from 'react'
import { ATTRIBUTE_IDS } from '../domain/athlete/athlete'
import { ITEM_LANGUAGES, parseEquipment, type EquipmentItem } from '../domain/equipment/items'
import { itemEffect, itemLabel } from '../i18n/equipmentText'
import { translate } from '../i18n/i18n'
import { insertRow, rows, serializeDoc, updateRow, type CsvDoc } from './csvDoc'
import { Field, NumberField, SelectField, TextField } from './fields'
import { Picker } from './MediaPanels'
import { itemPicture, layerColumn, layerLabel, layerPicture, layerSources, layerStem, withUploads } from './uploads'
import { thumbnailPath } from './media'
import type { Workspace } from './model'

const SHOP = import.meta.glob<string>('../../assets/ui/shop/*.webp', { eager: true, query: '?url', import: 'default' })
const SOURCES = Object.keys(import.meta.glob(['../../assets/ui/thumbnails/*.png', '../../assets/ui/equipment/*.webp'])).map((p) => p.slice(p.lastIndexOf('/') + 1))

const TYPES: { value: string; label: string }[] = [
  { value: 'shoes', label: 'Shoes' },
  { value: 'pack', label: 'Pack' },
  { value: 'poles', label: 'Poles' },
  { value: 'nutrition', label: 'Gels and bars' },
  { value: 'gel', label: 'Gels' },
  { value: 'bar', label: 'Bars' },
  { value: 'watch', label: 'Watch' },
  { value: 'glasses', label: 'Glasses (Look)' },
  { value: 'cap', label: 'Cap (Look)' },
]
const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.value, t.label]))
const ATTRIBUTE_LABELS: Record<string, string> = {
  endurance: 'Endurance',
  climbing: 'Climbing',
  speed: 'Speed',
  technical: 'Technique',
  recovery: 'Recovery',
  consistency: 'Consistency',
}
const MULTIPLIERS: { column: string; label: string }[] = [
  { column: 'flat', label: 'Time on the flat' },
  { column: 'climb', label: 'Time on climbs' },
  { column: 'descent', label: 'Time on descents' },
  { column: 'technical_penalty', label: 'Penalty on technical descents' },
  { column: 'wear', label: 'Wear with distance' },
]
const LANGUAGE_LABELS: Record<string, string> = { es: 'Spanish', fr: 'French', it: 'Italian', de: 'German' }
const t = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) => translate('en', key, vars)

/** The shop picture of a thumbnail column (men's file for {sex}). */
function pictureOf(file: string): string | undefined {
  const stem = file.replace('{sex}', 'men').replace(/\.\w+$/, '')
  return SHOP[`../../assets/ui/shop/${stem}.webp`]
}

/** A multiplier (0.99) as a change in percent (-1); empty is no change. */
function toPercent(value: string): string {
  if (value === '') return ''
  const n = Number(value)
  return Number.isFinite(n) ? String(Math.round((n - 1) * 10000) / 100) : value
}

function fromPercent(value: string): string {
  if (value === '' || Number(value) === 0) return ''
  const n = Number(value)
  return Number.isFinite(n) ? String(Math.round((1 + n / 100) * 10000) / 10000) : value
}

function readItem(doc: CsvDoc, values: Record<string, string>): { item?: EquipmentItem; error?: string } {
  const text = serializeDoc({ header: doc.header, lines: [{ kind: 'header', text: `${doc.header.join(',')}\n` }, { kind: 'row', row: { raw: null, values } }] })
  try {
    return { item: parseEquipment(text)[0]! }
  } catch (error) {
    return { error: (error as Error).message.replace(/^equipment\.csv row 1 \([^)]*\): /, '') }
  }
}

function Card({ values, item, picture }: { values: Record<string, string>; item?: EquipmentItem; picture?: string }) {
  return (
    <div className="itemCard">
      <span className="itemTop">
        {values.level ? <span className="level">Lv {values.level}</span> : <span />}
        <span className="type">{TYPE_LABEL[values.type!] ?? values.type}</span>
      </span>
      <strong>{item ? itemLabel(item, 'en') : values.name || values.name_es}</strong>
      <span className="art">{picture ? <img src={picture} alt="" /> : <span className="noArt">no picture</span>}</span>
      <span className="effect">{item ? itemEffect(item, 'en', t) ?? 'No attribute bonus' : ''}</span>
      <span className="price">{values.price === '' ? 'Not for sale' : values.price === '0' ? 'Free' : `● ${values.price}`}</span>
    </div>
  )
}

export function EquipmentPanel({
  ws,
  setWs,
  selected,
  select,
}: {
  ws: Workspace
  setWs(ws: Workspace): void
  selected: string | null
  select(id: string): void
}) {
  const [filter, setFilter] = useState('all')
  const [pictureError, setPictureError] = useState('')
  const [layerError, setLayerError] = useState('')
  // A picture uploaded in this visit is shown before the published one.
  const pictureFor = (values: Record<string, string>) =>
    values.thumbnail ? (ws.uploads[thumbnailPath(values.thumbnail)]?.previewUrl ?? pictureOf(values.thumbnail)) : undefined
  const itemRows = rows(ws.docs.equipment)
  const baseRows = useMemo(() => new Map(rows(ws.docsBase.equipment).map((r) => [r.values.id!, JSON.stringify(r.values)])), [ws.docsBase])
  const shownRows = itemRows.filter((r) => filter === 'all' || r.values.type === filter)
  const current = itemRows.find((r) => r.values.id === selected) ?? shownRows[0]
  const v = current?.values
  const read = v ? readItem(ws.docs.equipment, v) : {}

  const setItem = (changes: Record<string, string>) =>
    current && setWs({ ...ws, docs: { ...ws.docs, equipment: updateRow(ws.docs.equipment, (r) => r.values.id === current.values.id, changes) } })

  function addItem() {
    let n = 1
    while (itemRows.some((r) => r.values.id === `new-item-${n}`)) n++
    const id = `new-item-${n}`
    setWs({
      ...ws,
      docs: { ...ws.docs, equipment: insertRow(ws.docs.equipment, { id, name: 'New item', type: 'shoes', level: '1', price: '50', description: '', name_es: 'Artículo nuevo' }) },
    })
    select(id)
  }

  return (
    <div className="split">
      <section className="listPane" aria-label="Equipment">
        <div className="paneHead">
          <h2>Equipment ({itemRows.length})</h2>
          <button type="button" className="ghost" onClick={addItem}>
            + New item
          </button>
        </div>
        <div className="chips" role="group" aria-label="Type">
          {[{ value: 'all', label: 'All' }, ...TYPES.filter((ty) => itemRows.some((r) => r.values.type === ty.value))].map((ty) => (
            <button key={ty.value} type="button" aria-pressed={filter === ty.value} onClick={() => setFilter(ty.value)}>
              {ty.label}
            </button>
          ))}
        </div>
        <ul className="cards">
          {shownRows.map((row) => (
            <li key={row.values.id}>
              <button type="button" aria-pressed={row.values.id === v?.id} onClick={() => select(row.values.id!)}>
                {baseRows.get(row.values.id!) !== JSON.stringify(row.values) && <span className="dot" title="Changed" />}
                <Card values={row.values} item={readItem(ws.docs.equipment, row.values).item} picture={pictureFor(row.values)} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {v && (
        <section className="editPane" aria-label={`Edit ${v.name}`}>
          <div className="editHead">
            <div>
              <span className="eyebrow">{v.id}</span>
              <h2>{v.name || v.name_es}</h2>
            </div>
          </div>
          <div className="previewRow">
            <Card values={v} item={read.item} picture={pictureFor(v)} />
            <div className="previewNote">
              <p>How it looks in the shop (in English).</p>
            </div>
          </div>
          {read.error && <p className="error">The game would refuse this item: {read.error}</p>}

          <h3>Shop</h3>
          <div className="form">
            <SelectField label="Type" value={v.type!} options={TYPES} onChange={(x) => setItem({ type: x })} />
            <NumberField label="Level" value={v.level!} min={1} onChange={(x) => setItem({ level: x })} hint="Empty: no level" />
            <NumberField label="Price (coins)" value={v.price!} min={0} onChange={(x) => setItem({ price: x })} hint="Empty: not for sale · 0: free" />
            {['gel', 'bar', 'nutrition'].includes(v.type!) && (
              <NumberField label="Units per pack" value={v.pack!} min={1} onChange={(x) => setItem({ pack: x })} />
            )}
            <Field label="Shop picture" hint="Upload a picture (best a PNG with a transparent background) or choose a file of assets/ui/thumbnails ({sex} = men or women)" wide>
              {(id) => (
                <>
                  <div className="inputRow">
                    <input id={id} list="studio-thumbnails" value={v.thumbnail} onChange={(e) => setItem({ thumbnail: e.target.value })} />
                    <Picker
                      accept="image/*"
                      label="Upload picture"
                      onFile={async (file) => {
                        setPictureError('')
                        try {
                          const { path, upload, column } = await itemPicture(v.id!, file)
                          const next = withUploads(ws, { [path]: upload })
                          setWs({ ...next, docs: { ...next.docs, equipment: updateRow(next.docs.equipment, (r) => r.values.id === v.id, { thumbnail: column }) } })
                        } catch (e) {
                          setPictureError((e as Error).message)
                        }
                      }}
                    />
                  </div>
                  {pictureError && <span className="error">{pictureError}</span>}
                  <datalist id="studio-thumbnails">
                    {SOURCES.map((file) => (
                      <option key={file} value={file} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <TextField label="Layer on the runner" value={v.avatar_layer!} onChange={(x) => setItem({ avatar_layer: x })} hint="File in assets/runner/avatar" wide />
            {v.type === 'shoes' ? (
              <p className="hint wide">Claude prepares the shoes on the runner (send it the picture).</p>
            ) : (
              <Field
                label="Picture on the runner"
                hint="PNG with a transparent background on the runner's canvas (1024 × 1536), in its place. Converted when published. {sex} in the name: one for men and one for women (the men's one serves both if missing). {tone}: one per skin tone (caps, with their face). Glasses and caps are sold in Look › Accessories and carry no race bonus."
                wide
              >
                {() => {
                  const stem = layerStem(v.id!, v.type!, v.level!, v.avatar_layer!)
                  return (
                    <>
                      <div className="inputRow">
                        {layerSources(stem).map(({ sex, tone, path }) => (
                          <span key={path} className="layerSource">
                            {ws.uploads[path]?.previewUrl && <img className="layerPreview" src={ws.uploads[path]!.previewUrl} alt="" />}
                            <Picker
                              accept="image/png"
                              label={layerLabel(sex, tone)}
                              onFile={async (file) => {
                                setLayerError('')
                                try {
                                  const upload = await layerPicture(path, file, `Runner layer of ${v.id}${sex || tone ? ` (${[sex, tone ? `tone ${tone}` : ''].filter(Boolean).join(', ')})` : ''}`)
                                  const next = withUploads(ws, { [path]: upload })
                                  setWs({ ...next, docs: { ...next.docs, equipment: updateRow(next.docs.equipment, (r) => r.values.id === v.id, { avatar_layer: layerColumn(stem) }) } })
                                } catch (e) {
                                  setLayerError((e as Error).message)
                                }
                              }}
                            />
                          </span>
                        ))}
                      </div>
                      {layerError && <span className="error">{layerError}</span>}
                    </>
                  )
                }}
              </Field>
            )}
          </div>

          <h3>Race effect</h3>
          <div className="form">
            {ATTRIBUTE_IDS.map((id) => (
              <NumberField key={id} label={ATTRIBUTE_LABELS[id]!} value={v[id]!} step={0.5} onChange={(x) => setItem({ [id]: x === '0' ? '' : x })} hint="+ race bonus" />
            ))}
            {MULTIPLIERS.map((m) => (
              <NumberField
                key={m.column}
                label={`${m.label} (%)`}
                value={toPercent(v[m.column]!)}
                step={0.5}
                onChange={(x) => setItem({ [m.column]: fromPercent(x) })}
                hint="negative = faster / less"
              />
            ))}
            <TextField
              label="Own effect text (English)"
              value={v.effect_text!}
              onChange={(x) => setItem({ effect_text: x })}
              placeholder="empty = written from the bonuses"
              wide
            />
          </div>

          <h3>Name and texts</h3>
          <div className="form">
            <TextField label="Name (English)" value={v.name!} onChange={(x) => setItem({ name: x })} />
            <TextField label="Description (English)" value={v.description!} onChange={(x) => setItem({ description: x })} wide multiline />
            {ITEM_LANGUAGES.map((language) => (
              <div className="langBlock" key={language}>
                <span className="langTitle">{LANGUAGE_LABELS[language]}</span>
                <TextField label="Name" value={v[`name_${language}`] ?? ''} placeholder="empty = English" onChange={(x) => setItem({ [`name_${language}`]: x })} />
                <TextField label="Description" value={v[`description_${language}`] ?? ''} placeholder="empty = English" onChange={(x) => setItem({ [`description_${language}`]: x })} wide multiline />
                <TextField label="Own effect text" value={v[`effect_text_${language}`] ?? ''} placeholder="empty = automatic" onChange={(x) => setItem({ [`effect_text_${language}`]: x })} wide />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
