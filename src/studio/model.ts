import { parseEquipment } from '../domain/equipment/items'
import { parseRaces } from '../domain/races/races'
import { diffDocs, parseDoc, rows, serializeDoc, type CsvDoc, type RowChange } from './csvDoc'
import type { Upload } from './media'
import { migrationPath, racePointsMigration, racePointsRows } from './migration'

/** The tables Trail Studio edits, by repository path. */
export const FILES = {
  races: 'src/data/races.csv',
  points: 'src/data/ranking_points.csv',
  equipment: 'src/data/equipment.csv',
} as const
export type FileId = keyof typeof FILES

export interface Workspace {
  /** The tables as they are on main. */
  base: Record<FileId, string>
  /** The tables on main, read (to mark what changed). */
  docsBase: Record<FileId, CsvDoc>
  docs: Record<FileId, CsvDoc>
  /** Pictures and videos added (or removed: base64 null), by repository path. Not kept as a draft. */
  uploads: Record<string, Upload>
}

export function openWorkspace(base: Record<FileId, string>, drafts?: Partial<Record<FileId, string>>): Workspace {
  const read = (text: (id: FileId) => string) => ({
    races: parseDoc(text('races')),
    points: parseDoc(text('points')),
    equipment: parseDoc(text('equipment')),
  })
  return { base, docsBase: read((id) => base[id]), docs: read((id) => drafts?.[id] ?? base[id]), uploads: {} }
}

export function textOf(ws: Workspace, id: FileId): string {
  return serializeDoc(ws.docs[id])
}

export function changedFiles(ws: Workspace): FileId[] {
  return (Object.keys(FILES) as FileId[]).filter((id) => textOf(ws, id) !== ws.base[id])
}

/** Every problem the game would refuse, in words (empty: the tables are valid). */
export function validate(ws: Workspace): string[] {
  const errors: string[] = []
  const raceIds = rows(ws.docs.races).map((row) => row.values.id!)
  try {
    parseRaces(textOf(ws, 'races'))
  } catch (error) {
    errors.push(`Carreras: ${(error as Error).message}`)
  }
  try {
    parseEquipment(textOf(ws, 'equipment'))
  } catch (error) {
    errors.push(`Equipamiento: ${(error as Error).message}`)
  }
  const points = rows(ws.docs.points).map((row) => row.values)
  const difficulties = new Set(points.filter((p) => p.kind === 'difficulty').map((p) => p.key))
  for (const id of raceIds) {
    const row = points.find((p) => p.kind === 'race' && p.key === id)
    if (!row) errors.push(`Carreras: ${id} no tiene dificultad (I–V)`)
    else if (!difficulties.has(row.value)) errors.push(`Carreras: ${id} tiene una dificultad desconocida "${row.value}"`)
  }
  return errors
}

/** Whether the NPC rankings in Supabase need the new race levels or difficulties. */
export function needsRankingMigration(ws: Workspace): boolean {
  return (
    racePointsRows(textOf(ws, 'races'), textOf(ws, 'points')).join('\n') !== racePointsRows(ws.base.races, ws.base.points).join('\n')
  )
}

const RACE_COLUMNS: Record<string, string> = {
  name: 'nombre',
  category: 'categoría interna',
  distance_km: 'distancia (km)',
  elevation_gain_m: 'desnivel (m)',
  recommended_level: 'nivel recomendado',
  technicality: 'técnica',
  terrain: 'terreno (EN)',
  terrain_es: 'terreno (ES)',
  terrain_fr: 'terreno (FR)',
  terrain_it: 'terreno (IT)',
  terrain_de: 'terreno (DE)',
  difficulty: 'dificultad',
}

export const EQUIPMENT_COLUMNS: Record<string, string> = {
  name: 'nombre (EN)',
  type: 'tipo',
  level: 'nivel',
  price: 'precio',
  pack: 'unidades por pack',
  thumbnail: 'imagen',
  avatar_layer: 'capa en el corredor',
  speed: 'Velocidad',
  endurance: 'Resistencia',
  climbing: 'Subida',
  technical: 'Técnica',
  recovery: 'Recuperación',
  consistency: 'Regularidad',
  flat: 'llano',
  climb: 'subidas',
  descent: 'bajadas',
  technical_penalty: 'bajadas técnicas',
  wear: 'desgaste',
  effect_text: 'texto del efecto (EN)',
  description: 'descripción (EN)',
}

function columnLabel(labels: Record<string, string>, column: string): string {
  if (labels[column]) return labels[column]
  const m = /^(name|effect_text|description)_(es|fr|it|de)$/.exec(column)
  if (m) return `${{ name: 'nombre', effect_text: 'texto del efecto', description: 'descripción' }[m[1] as 'name']} (${m[2]!.toUpperCase()})`
  return column
}

const shown = (value: string) => (value === '' ? '—' : value)

function describe(changes: RowChange[], labels: Record<string, string>, nameOf: (key: string) => string): string[] {
  return changes.map((change) => {
    if (change.kind === 'added') return `**${nameOf(change.key)}** (nueva)`
    const fields = change.fields.map((f) => `${columnLabel(labels, f.column)} ${shown(f.before)} → ${shown(f.after)}`)
    return `**${nameOf(change.key)}**: ${fields.join('; ')}`
  })
}

/** The changes in words, one line per race or item (for the review and the pull request). */
export function summary(ws: Workspace): { races: string[]; equipment: string[] } {
  const before = { docs: ws.docsBase }
  const raceName = (key: string) => {
    const row = rows(ws.docs.races).find((r) => r.values.id === key)
    return `${key} ${row?.values.name ?? ''}`.trim()
  }
  const raceChanges = diffDocs(before.docs.races, ws.docs.races, (v) => v.id!)
  // Difficulty changes (ranking_points.csv) join their race's line.
  const difficulty = diffDocs(before.docs.points, ws.docs.points, (v) => `${v.kind}|${v.key}`).filter((c) => c.key.startsWith('race|'))
  for (const change of difficulty) {
    const id = change.key.slice('race|'.length)
    const value = change.fields.find((f) => f.column === 'value')
    if (change.kind !== 'changed' || !value) continue
    const field = { column: 'difficulty', before: value.before, after: value.after }
    const existing = raceChanges.find((c) => c.key === id)
    if (existing) existing.fields.push(field)
    else raceChanges.push({ key: id, kind: 'changed', fields: [field] })
  }
  const races = describe(raceChanges, RACE_COLUMNS, raceName)
  const itemName = (key: string) => {
    const row = rows(ws.docs.equipment).find((r) => r.values.id === key)
    return `${row?.values.name_es || row?.values.name || key} (${key})`
  }
  return { races, equipment: describe(diffDocs(before.docs.equipment, ws.docs.equipment, (v) => v.id!), EQUIPMENT_COLUMNS, itemName) }
}

/** Whether anything is waiting to be proposed: a table or an upload. */
export function hasChanges(ws: Workspace): boolean {
  return changedFiles(ws).length > 0 || Object.keys(ws.uploads).length > 0
}

/** The pictures and videos of a proposal (base64 null: delete the file). */
export function proposalMedia(ws: Workspace): { path: string; base64: string | null }[] {
  return Object.entries(ws.uploads).map(([path, upload]) => ({ path, base64: upload.base64 }))
}

/** The files of a proposal: the changed tables, and the ranking migration when it is needed. */
export function proposalFiles(ws: Workspace, now: Date): { path: string; text: string }[] {
  const files: { path: string; text: string }[] = changedFiles(ws).map((id) => ({ path: FILES[id], text: textOf(ws, id) }))
  if (needsRankingMigration(ws)) {
    files.push({
      path: migrationPath(now, 'studio_race_points'),
      text: racePointsMigration(textOf(ws, 'races'), textOf(ws, 'points'), 'Race levels or difficulties changed in Trail Studio'),
    })
  }
  return files
}
