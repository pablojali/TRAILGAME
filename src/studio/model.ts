import { parseCsv } from '../data/csv'
import { isCountryCode } from '../domain/athlete/countries'
import { parseLevels } from '../domain/athlete/levels'
import { parseEquipment } from '../domain/equipment/items'
import { parseRaceField } from '../domain/races/raceField'
import { parseRaces } from '../domain/races/races'
import { parseRankingTable } from '../domain/ranking/ranking'
import { parseCoachMoments } from '../features/coach/moments'
import { parseAchievementTable } from '../game-engine/achievements'
import { diffDocs, parseDoc, rows, serializeDoc, type CsvDoc, type RowChange } from './csvDoc'
import type { Upload } from './media'
import { migrationPath, npcRows, racePointsRows, rankingMigration } from './migration'

/** The tables Trail Studio edits, by repository path. */
export const FILES = {
  races: 'src/data/races.csv',
  points: 'src/data/ranking_points.csv',
  equipment: 'src/data/equipment.csv',
  coach: 'src/data/coach_moments.csv',
  levels: 'src/data/levels.csv',
  achievements: 'src/data/achievements.csv',
  raceField: 'src/data/race_field.csv',
  npcs: 'src/data/ranking_npcs.csv',
} as const
export type FileId = keyof typeof FILES
export const FILE_IDS = Object.keys(FILES) as FileId[]

/** A game text value: a sentence, or plural forms ({ one, other }). */
export type TextValue = string | Record<string, string>
/** One text file (src/i18n/locales/{lang}/{screen}.json): as on main, and as edited. */
export interface TextFile {
  base: string
  data: Record<string, TextValue>
}

export interface Workspace {
  /** The tables as they are on main. */
  base: Record<FileId, string>
  /** The tables on main, read (to mark what changed). */
  docsBase: Record<FileId, CsvDoc>
  docs: Record<FileId, CsvDoc>
  /** Pictures and videos added (or removed: base64 null), by repository path. Not kept as a draft. */
  uploads: Record<string, Upload>
  /** Game texts by path, once the Textos tab has read them. */
  texts: Record<string, TextFile>
}

export function openWorkspace(base: Record<FileId, string>, drafts?: Partial<Record<FileId, string>>): Workspace {
  const read = (text: (id: FileId) => string) => Object.fromEntries(FILE_IDS.map((id) => [id, parseDoc(text(id))])) as Record<FileId, CsvDoc>
  return { base, docsBase: read((id) => base[id]), docs: read((id) => drafts?.[id] ?? base[id]), uploads: {}, texts: {} }
}

export function textOf(ws: Workspace, id: FileId): string {
  return serializeDoc(ws.docs[id])
}

export function changedFiles(ws: Workspace): FileId[] {
  return FILE_IDS.filter((id) => textOf(ws, id) !== ws.base[id])
}

export const jsonText = (data: Record<string, TextValue>) => `${JSON.stringify(data, null, 2)}\n`

export function changedTexts(ws: Workspace): string[] {
  return Object.keys(ws.texts).filter((path) => jsonText(ws.texts[path]!.data) !== ws.texts[path]!.base)
}

/** Whether anything is waiting to be proposed: a table, a text or an upload. */
export function hasChanges(ws: Workspace): boolean {
  return changedFiles(ws).length > 0 || changedTexts(ws).length > 0 || Object.keys(ws.uploads).length > 0
}

const placeholders = (value: TextValue | undefined) =>
  [...new Set([...(typeof value === 'string' ? value : Object.values(value ?? {}).join(' ')).matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort().join(',')

/** Every problem the game would refuse, in words (empty: everything is valid). */
export function validate(ws: Workspace): string[] {
  const errors: string[] = []
  const check = (label: string, read: () => unknown) => {
    try {
      read()
    } catch (error) {
      errors.push(`${label}: ${(error as Error).message}`)
    }
  }
  const raceIds = rows(ws.docs.races).map((row) => row.values.id!)
  check('Carreras', () => parseRaces(textOf(ws, 'races')))
  check('Equipamiento', () => parseEquipment(textOf(ws, 'equipment')))
  check('Coach', () => parseCoachMoments(textOf(ws, 'coach')))
  check('Niveles', () => parseLevels(textOf(ws, 'levels')))
  check('Desafíos', () => parseAchievementTable(textOf(ws, 'achievements')))
  check('Rivales por categoría', () => parseRaceField(textOf(ws, 'raceField')))
  check('Puntos de ranking', () => parseRankingTable(textOf(ws, 'points'), raceIds))
  const points = rows(ws.docs.points).map((row) => row.values)
  const difficulties = new Set(points.filter((p) => p.kind === 'difficulty').map((p) => p.key))
  for (const id of raceIds) {
    const row = points.find((p) => p.kind === 'race' && p.key === id)
    if (!row) errors.push(`Carreras: ${id} no tiene dificultad (I–V)`)
    else if (!difficulties.has(row.value)) errors.push(`Carreras: ${id} tiene una dificultad desconocida "${row.value}"`)
  }
  // NPC runners (the same rules as src/data/rankingNpcs.test.ts).
  const npcs = parseCsv(textOf(ws, 'npcs'))
  const names = new Set<string>()
  npcs.forEach((n, i) => {
    const where = `Rivales NPC, fila ${i + 1} (${n.id})`
    const name = (n.name ?? '').toLowerCase()
    if (!n.name || n.name.length > 16) errors.push(`${where}: el nombre debe tener de 1 a 16 caracteres`)
    if (names.has(name)) errors.push(`${where}: el nombre ${n.name} está repetido`)
    names.add(name)
    if (!isCountryCode(n.country)) errors.push(`${where}: país desconocido "${n.country}"`)
    if (n.sex !== 'male' && n.sex !== 'female') errors.push(`${where}: sexo debe ser male o female`)
    const int = (v: string | undefined, min: number, max: number) => /^\d+$/.test(v ?? '') && Number(v) >= min && Number(v) <= max
    if (!int(n.level, 1, 999) || !int(n.xp, 0, 99_999_999)) errors.push(`${where}: nivel y XP deben ser números enteros`)
    if (!int(n.strength, 0, 100)) errors.push(`${where}: fuerza de 0 a 100`)
    if (!int(n.races_per_week, 0, 7)) errors.push(`${where}: carreras por semana de 0 a 7`)
  })
  // Texts: every language keeps the English texts' placeholders ({name}), nothing empty.
  const byScreen = new Map<string, Record<string, Record<string, TextValue>>>()
  for (const [path, file] of Object.entries(ws.texts)) {
    const m = /locales\/(\w+)\/(\w+)\.json$/.exec(path)
    if (!m) continue
    byScreen.set(m[2]!, { ...byScreen.get(m[2]!), [m[1]!]: file.data })
  }
  for (const path of changedTexts(ws)) {
    const [, , screen] = /locales\/(\w+)\/(\w+)\.json$/.exec(path)!
    const languages = byScreen.get(screen!)!
    const english = languages.en ?? {}
    for (const [language, data] of Object.entries(languages)) {
      for (const key of Object.keys(english)) {
        const value = data[key]
        if (value === undefined || (typeof value === 'string' ? value.trim() === '' : Object.values(value).some((v) => !v.trim()))) {
          errors.push(`Textos ${language.toUpperCase()}: ${key} está vacío`)
        } else if (placeholders(value) !== placeholders(english[key])) {
          errors.push(`Textos ${language.toUpperCase()}: ${key} debe llevar ${placeholders(english[key]) || 'ninguna variable'} como el inglés`)
        }
      }
    }
  }
  return [...new Set(errors)]
}

const rankingRows = (races: string, points: string) =>
  [...racePointsRows(races, points), ...parseCsv(points).filter((p) => p.kind === 'position').map((p) => `${p.key}|${p.value}`)].join('\n')

/** Whether the rankings in Supabase need the new data: race levels or difficulties, positions, NPCs. */
export function needsRankingMigration(ws: Workspace): boolean {
  return rankingRows(textOf(ws, 'races'), textOf(ws, 'points')) !== rankingRows(ws.base.races, ws.base.points) || npcsChanged(ws)
}

function npcsChanged(ws: Workspace): boolean {
  return npcRows(textOf(ws, 'npcs')).join('\n') !== npcRows(ws.base.npcs).join('\n')
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
  const m = /^(name|effect_text|description|title|text)_(es|fr|it|de)$/.exec(column)
  if (m) return `${{ name: 'nombre', effect_text: 'texto del efecto', description: 'descripción', title: 'título', text: 'texto' }[m[1] as 'name']} (${m[2]!.toUpperCase()})`
  return column
}

const shown = (value: string) => (value === '' ? '—' : value.length > 60 ? `${value.slice(0, 57)}…` : value)

function describe(changes: RowChange[], labels: Record<string, string>, nameOf: (key: string) => string): string[] {
  return changes.map((change) => {
    if (change.kind === 'added') return `**${nameOf(change.key)}** (nueva)`
    if (change.kind === 'removed') return `**${nameOf(change.key)}** (quitada)`
    const fields = change.fields.map((f) => `${columnLabel(labels, f.column)} ${shown(f.before)} → ${shown(f.after)}`)
    return `**${nameOf(change.key)}**: ${fields.join('; ')}`
  })
}

/** The balance tables (Balance tab): title, how a row is named and what changes need. */
export const BALANCE: { id: FileId; title: string; key: (v: Record<string, string>) => string; canAdd: boolean }[] = [
  { id: 'levels', title: 'Niveles', key: (v) => `Nivel ${v.level}`, canAdd: true },
  { id: 'achievements', title: 'Desafíos', key: (v) => `${v.achievement} nivel ${v.level}`, canAdd: true },
  { id: 'points', title: 'Puntos de ranking', key: (v) => `${v.kind} ${v.key}`, canAdd: true },
  { id: 'raceField', title: 'Rivales por categoría', key: (v) => v.category!, canAdd: false },
  { id: 'npcs', title: 'Rivales NPC del ranking', key: (v) => `${v.id} ${v.name}`, canAdd: false },
]

export interface Summary {
  races: string[]
  equipment: string[]
  coach: string[]
  balance: string[]
  texts: string[]
}

/** The changes in words, one line per race, item, moment step, table row or text. */
export function summary(ws: Workspace): Summary {
  const before = ws.docsBase
  const raceName = (key: string) => {
    const row = rows(ws.docs.races).find((r) => r.values.id === key) ?? rows(before.races).find((r) => r.values.id === key)
    return `${key} ${row?.values.name ?? ''}`.trim()
  }
  const raceChanges = diffDocs(before.races, ws.docs.races, (v) => v.id!)
  // Difficulty changes (ranking_points.csv) join their race's line.
  const pointChanges = diffDocs(before.points, ws.docs.points, (v) => `${v.kind}|${v.key}`)
  for (const change of pointChanges.filter((c) => c.key.startsWith('race|'))) {
    const id = change.key.slice('race|'.length)
    const value = change.fields.find((f) => f.column === 'value')
    if (change.kind !== 'changed' || !value) continue
    const field = { column: 'difficulty', before: value.before, after: value.after }
    const existing = raceChanges.find((c) => c.key === id)
    if (existing) existing.fields.push(field)
    else raceChanges.push({ key: id, kind: 'changed', fields: [field] })
  }
  const itemName = (key: string) => {
    const row = rows(ws.docs.equipment).find((r) => r.values.id === key)
    return `${row?.values.name_es || row?.values.name || key} (${key})`
  }
  const balance: string[] = []
  for (const table of BALANCE) {
    let changes = diffDocs(before[table.id], ws.docs[table.id], (v) => table.key(v))
    // Race difficulties are listed with the races.
    if (table.id === 'points') changes = changes.filter((c) => !c.key.startsWith('race '))
    balance.push(...describe(changes, { value: 'valor', xp: 'XP', attribute_points: 'puntos de atributo', target: 'objetivo', coins: 'monedas' }, (k) => `${table.title} · ${k}`))
  }
  const texts: string[] = []
  for (const path of changedTexts(ws)) {
    const [, language, screen] = /locales\/(\w+)\/(\w+)\.json$/.exec(path)!
    const file = ws.texts[path]!
    const old = JSON.parse(file.base) as Record<string, TextValue>
    for (const key of Object.keys(file.data)) {
      const a = JSON.stringify(old[key] ?? '')
      const b = JSON.stringify(file.data[key])
      if (a !== b) texts.push(`**${screen} · ${key} (${language!.toUpperCase()})**: ${shown(JSON.parse(a).toString())} → ${shown(typeof file.data[key] === 'string' ? (file.data[key] as string) : JSON.stringify(file.data[key]))}`)
    }
  }
  return {
    races: describe(raceChanges, RACE_COLUMNS, raceName),
    equipment: describe(diffDocs(before.equipment, ws.docs.equipment, (v) => v.id!), EQUIPMENT_COLUMNS, itemName),
    coach: describe(diffDocs(before.coach, ws.docs.coach, (v) => `${v.moment} paso ${v.step}`), { trigger: 'disparador', after: 'después de', unless: 'salvo', targets: 'señala', tap: 'espera toque', title: 'título (EN)', text: 'texto (EN)' }, (k) => `Coach · ${k}`),
    balance,
    texts,
  }
}

/** The pictures and videos of a proposal (base64 null: delete the file). */
export function proposalMedia(ws: Workspace): { path: string; base64: string | null }[] {
  return Object.entries(ws.uploads).map(([path, upload]) => ({ path, base64: upload.base64 }))
}

/** The files of a proposal: the changed tables and texts, and the ranking migration when it is needed. */
export function proposalFiles(ws: Workspace, now: Date): { path: string; text: string }[] {
  const files: { path: string; text: string }[] = changedFiles(ws).map((id) => ({ path: FILES[id], text: textOf(ws, id) }))
  for (const path of changedTexts(ws)) files.push({ path, text: jsonText(ws.texts[path]!.data) })
  if (needsRankingMigration(ws)) {
    files.push({
      path: migrationPath(now, 'studio_rankings'),
      text: rankingMigration(textOf(ws, 'races'), textOf(ws, 'points'), npcsChanged(ws) ? textOf(ws, 'npcs') : null, 'Ranking data changed in Trail Studio'),
    })
  }
  return files
}
