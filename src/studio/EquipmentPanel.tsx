import { useMemo, useState } from 'react'
import { ATTRIBUTE_IDS } from '../domain/athlete/athlete'
import { ITEM_LANGUAGES, parseEquipment, type EquipmentItem } from '../domain/equipment/items'
import { itemEffect, itemLabel } from '../i18n/equipmentText'
import { translate } from '../i18n/i18n'
import { insertRow, rows, serializeDoc, updateRow, type CsvDoc } from './csvDoc'
import { Field, NumberField, SelectField, TextField } from './fields'
import type { Workspace } from './model'

const SHOP = import.meta.glob<string>('../../assets/ui/shop/*.webp', { eager: true, query: '?url', import: 'default' })
const SOURCES = Object.keys(import.meta.glob(['../../assets/ui/thumbnails/*.png', '../../assets/ui/equipment/*.webp'])).map((p) => p.slice(p.lastIndexOf('/') + 1))

const TYPES: { value: string; label: string }[] = [
  { value: 'shoes', label: 'Zapatillas' },
  { value: 'pack', label: 'Mochila' },
  { value: 'poles', label: 'Bastones' },
  { value: 'nutrition', label: 'Geles y barritas' },
  { value: 'gel', label: 'Geles' },
  { value: 'bar', label: 'Barritas' },
]
const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.value, t.label]))
const ATTRIBUTE_LABELS: Record<string, string> = {
  endurance: 'Resistencia',
  climbing: 'Subida',
  speed: 'Velocidad',
  technical: 'Técnica',
  recovery: 'Recuperación',
  consistency: 'Regularidad',
}
const MULTIPLIERS: { column: string; label: string }[] = [
  { column: 'flat', label: 'Tiempo en llano' },
  { column: 'climb', label: 'Tiempo en subidas' },
  { column: 'descent', label: 'Tiempo en bajadas' },
  { column: 'technical_penalty', label: 'Penalización en bajadas técnicas' },
  { column: 'wear', label: 'Desgaste con la distancia' },
]
const LANGUAGE_LABELS: Record<string, string> = { es: 'Español', fr: 'Français', it: 'Italiano', de: 'Deutsch' }
const t = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) => translate('es', key, vars)

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

function Card({ values, item }: { values: Record<string, string>; item?: EquipmentItem }) {
  const picture = values.thumbnail ? pictureOf(values.thumbnail) : undefined
  return (
    <div className="itemCard">
      <span className="itemTop">
        {values.level ? <span className="level">Nv {values.level}</span> : <span />}
        <span className="type">{TYPE_LABEL[values.type!] ?? values.type}</span>
      </span>
      <strong>{item ? itemLabel(item, 'es') : values.name_es || values.name}</strong>
      <span className="art">{picture ? <img src={picture} alt="" /> : <span className="noArt">sin imagen</span>}</span>
      <span className="effect">{item ? itemEffect(item, 'es', t) ?? 'Sin bonus de atributos' : ''}</span>
      <span className="price">{values.price === '' ? 'No a la venta' : values.price === '0' ? 'Gratis' : `● ${values.price}`}</span>
    </div>
  )
}

export function EquipmentPanel({ ws, setWs, selected, select }: { ws: Workspace; setWs(ws: Workspace): void; selected: string | null; select(id: string): void }) {
  const [filter, setFilter] = useState('all')
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
      docs: { ...ws.docs, equipment: insertRow(ws.docs.equipment, { id, name: 'New item', type: 'shoes', level: '1', price: '50', description: '', name_es: 'Nuevo artículo' }) },
    })
    select(id)
  }

  return (
    <div className="split">
      <section className="listPane" aria-label="Equipamiento">
        <div className="paneHead">
          <h2>Equipamiento ({itemRows.length})</h2>
          <button type="button" className="ghost" onClick={addItem}>
            + Nuevo artículo
          </button>
        </div>
        <div className="chips" role="group" aria-label="Tipo">
          {[{ value: 'all', label: 'Todo' }, ...TYPES.filter((ty) => itemRows.some((r) => r.values.type === ty.value))].map((ty) => (
            <button key={ty.value} type="button" aria-pressed={filter === ty.value} onClick={() => setFilter(ty.value)}>
              {ty.label}
            </button>
          ))}
        </div>
        <ul className="cards">
          {shownRows.map((row) => (
            <li key={row.values.id}>
              <button type="button" aria-pressed={row.values.id === v?.id} onClick={() => select(row.values.id!)}>
                {baseRows.get(row.values.id!) !== JSON.stringify(row.values) && <span className="dot" title="Cambiado" />}
                <Card values={row.values} item={readItem(ws.docs.equipment, row.values).item} />
              </button>
            </li>
          ))}
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
          <div className="previewRow">
            <Card values={v} item={read.item} />
            <div className="previewNote">
              <p>Así se verá en la tienda (en español).</p>
              {read.item?.effectText && <p className="muted">English: {read.item.effectText.replace(/^Races: /, '')}</p>}
            </div>
          </div>
          {read.error && <p className="error">El juego no aceptaría este artículo: {read.error}</p>}

          <h3>Tienda</h3>
          <div className="form">
            <SelectField label="Tipo" value={v.type!} options={TYPES} onChange={(x) => setItem({ type: x })} />
            <NumberField label="Nivel" value={v.level!} min={1} onChange={(x) => setItem({ level: x })} hint="Vacío: sin nivel" />
            <NumberField label="Precio (monedas)" value={v.price!} min={0} onChange={(x) => setItem({ price: x })} hint="Vacío: no se vende · 0: gratis" />
            {['gel', 'bar', 'nutrition'].includes(v.type!) && (
              <NumberField label="Unidades por pack" value={v.pack!} min={1} onChange={(x) => setItem({ pack: x })} />
            )}
            <Field label="Imagen de la tienda" hint="Un archivo de assets/ui/thumbnails ({sex} = men o women)" wide>
              {(id) => (
                <>
                  <input id={id} list="studio-thumbnails" value={v.thumbnail} onChange={(e) => setItem({ thumbnail: e.target.value })} />
                  <datalist id="studio-thumbnails">
                    {SOURCES.map((file) => (
                      <option key={file} value={file} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <TextField label="Capa en el corredor" value={v.avatar_layer!} onChange={(x) => setItem({ avatar_layer: x })} hint="Archivo de assets/runner/avatar" wide />
          </div>

          <h3>Efecto en carrera</h3>
          <div className="form">
            {ATTRIBUTE_IDS.map((id) => (
              <NumberField key={id} label={ATTRIBUTE_LABELS[id]!} value={v[id]!} step={0.5} onChange={(x) => setItem({ [id]: x === '0' ? '' : x })} hint="+ bonus en carrera" />
            ))}
            {MULTIPLIERS.map((m) => (
              <NumberField
                key={m.column}
                label={`${m.label} (%)`}
                value={toPercent(v[m.column]!)}
                step={0.5}
                onChange={(x) => setItem({ [m.column]: fromPercent(x) })}
                hint="negativo = más rápido / menos"
              />
            ))}
            <TextField
              label="Texto del efecto propio (English)"
              value={v.effect_text!}
              onChange={(x) => setItem({ effect_text: x })}
              placeholder="vacío = se escribe solo a partir de los bonus"
              wide
            />
          </div>

          <h3>Nombre y textos</h3>
          <div className="form">
            <TextField label="Nombre (English)" value={v.name!} onChange={(x) => setItem({ name: x })} />
            <TextField label="Descripción (English)" value={v.description!} onChange={(x) => setItem({ description: x })} wide multiline />
            {ITEM_LANGUAGES.map((language) => (
              <div className="langBlock" key={language}>
                <span className="langTitle">{LANGUAGE_LABELS[language]}</span>
                <TextField label="Nombre" value={v[`name_${language}`] ?? ''} placeholder="vacío = en inglés" onChange={(x) => setItem({ [`name_${language}`]: x })} />
                <TextField label="Descripción" value={v[`description_${language}`] ?? ''} placeholder="vacío = en inglés" onChange={(x) => setItem({ [`description_${language}`]: x })} wide multiline />
                <TextField label="Texto del efecto propio" value={v[`effect_text_${language}`] ?? ''} placeholder="vacío = automático" onChange={(x) => setItem({ [`effect_text_${language}`]: x })} wide />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
