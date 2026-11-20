import { describe, expect, it, vi } from 'vitest'
import { insertRow, rows, updateRow } from './csvDoc'
import { changedFiles, jsonText, needsRankingMigration, openWorkspace, proposalFiles, summary, validate, type FileId, type Workspace } from './model'

vi.unmock('../data/ranking_points.csv?raw')
vi.unmock('../data/races.csv?raw')
vi.unmock('../data/equipment.csv?raw')
vi.unmock('../data/levels.csv?raw')
vi.unmock('../data/achievements.csv?raw')
vi.unmock('../data/race_field.csv?raw')
vi.unmock('../data/ranking_npcs.csv?raw')
vi.unmock('../data/basecamp.csv?raw')
vi.unmock('../data/economy.csv?raw')
const base = {
  races: (await import('../data/races.csv?raw')).default,
  points: (await import('../data/ranking_points.csv?raw')).default,
  equipment: (await import('../data/equipment.csv?raw')).default,
  coach: (await import('../data/coach_moments.csv?raw')).default,
  levels: (await import('../data/levels.csv?raw')).default,
  achievements: (await import('../data/achievements.csv?raw')).default,
  raceField: (await import('../data/race_field.csv?raw')).default,
  npcs: (await import('../data/ranking_npcs.csv?raw')).default,
  announcements: (await import('../data/announcements.csv?raw')).default,
  basecamp: (await import('../data/basecamp.csv?raw')).default,
  economy: (await import('../data/economy.csv?raw')).default,
  notifications: (await import('../data/notifications.csv?raw')).default,
}

function edit(ws: Workspace, id: FileId, key: (v: Record<string, string>) => boolean, changes: Record<string, string>): Workspace {
  return { ...ws, docs: { ...ws.docs, [id]: updateRow(ws.docs[id], (r) => key(r.values), changes) } }
}

describe('Studio workspace', () => {
  it('starts with nothing changed and valid tables', () => {
    const ws = openWorkspace(base)
    expect(changedFiles(ws)).toEqual([])
    expect(validate(ws)).toEqual([])
    expect(needsRankingMigration(ws)).toBe(false)
  })

  it('describes race and equipment changes in Spanish and adds no migration for course changes', () => {
    let ws = openWorkspace(base)
    // The current values come from the tables, which the owner edits in Studio: the test must not pin them.
    // A race without segments (with them, the distance and elevation are the segments' sums).
    const race = rows(ws.docs.races).find((r) => r.values.id?.startsWith('RACE-') && !r.values.segments)!.values
    const poles = rows(ws.docs.equipment).find((r) => r.values.id === 'poles')!.values
    const gain = String(Number(race.elevation_gain_m) + 50)
    const technicality = String((Number(race.technicality) % 5) + 1)
    const price = String(Number(poles.price || 0) + 7)
    const climbing = String(Number(poles.climbing || 0) + 1)
    ws = edit(ws, 'races', (v) => v.id === race.id, { elevation_gain_m: gain, technicality })
    ws = edit(ws, 'equipment', (v) => v.id === 'poles', { climbing, price })
    expect(summary(ws).races).toEqual([
      `**${race.id} ${race.name}**: desnivel (m) ${race.elevation_gain_m} → ${gain}; técnica ${race.technicality} → ${technicality}`,
    ])
    expect(summary(ws).equipment[0]).toMatch(new RegExp(`^\\*\\*Bastones \\(poles\\)\\*\\*: .*precio ${poles.price || '—'} → ${price}.*Subida`))
    expect(validate(ws)).toEqual([])
    expect(proposalFiles(ws, new Date(0)).map((f) => f.path)).toEqual(['src/data/races.csv', 'src/data/equipment.csv'])
  })

  it('adds the ranking migration when a level or a difficulty changes', () => {
    let ws = openWorkspace(base)
    ws = edit(ws, 'points', (v) => v.kind === 'race' && v.key === 'RACE-005', { value: 'III' })
    expect(summary(ws).races).toEqual(['**RACE-005 Stone Path Classic**: dificultad II → III'])
    const files = proposalFiles(ws, new Date(Date.UTC(2026, 10, 9)))
    expect(files.map((f) => f.path)).toEqual(['src/data/ranking_points.csv', 'supabase/migrations/20261109000000_studio_rankings.sql'])
    expect(files[1]!.text).toContain("('RACE-005', 14, 160)")
  })

  it('refuses what the game would refuse', () => {
    let ws = openWorkspace(base)
    // Without segments (with them, the technicality is theirs): the owner may have cut RACE-001.
    ws = edit(ws, 'races', (v) => v.id === 'RACE-001', { technicality: '7', segments: '' })
    ws = { ...ws, docs: { ...ws.docs, races: insertRow(ws.docs.races, { id: 'RACE-099', name: 'New', category: 'open', distance_km: '5', elevation_gain_m: '100', recommended_level: '3', technicality: '0', terrain: 'Paths' }) } }
    const errors = validate(ws)
    expect(errors.some((e) => e.includes('technicality must be 0 to 5'))).toBe(true)
    expect(errors).toContain('Carreras: RACE-099 no tiene dificultad (I–V)')
  })

  it('describes coach, balance and text changes; NPC changes bring their migration', () => {
    let ws = openWorkspace(base)
    ws = edit(ws, 'coach', (v) => v.moment === 'dashboard' && v.step === '1', { title_es: 'Tus fuerzas' })
    ws = edit(ws, 'levels', (v) => v.level === '2', { xp: '120' })
    ws = edit(ws, 'npcs', (v) => v.id === 'NPC-001', { strength: '70' })
    const en = { 'dashboard.title': 'Dashboard', 'dashboard.week': 'Week {week}' }
    ws = {
      ...ws,
      texts: {
        'src/i18n/locales/en/dashboard.json': { base: jsonText(en), data: en },
        'src/i18n/locales/es/dashboard.json': { base: jsonText({ ...en, 'dashboard.title': 'Inicio' }), data: { ...en, 'dashboard.title': 'Panel', 'dashboard.week': 'Semana' } },
      },
    }
    const s = summary(ws)
    expect(s.coach).toEqual(['**Coach · dashboard paso 1**: título (ES) Tus atributos → Tus fuerzas'])
    expect(s.balance).toEqual(['**Niveles · Nivel 2**: XP 100 → 120', '**Rivales NPC del ranking · NPC-001 Ana91**: strength 68 → 70'])
    expect(s.texts).toEqual(['**dashboard · dashboard.title (ES)**: Inicio → Panel', '**dashboard · dashboard.week (ES)**: Week {week} → Semana'])
    // "Semana" lost {week}: refused.
    expect(validate(ws)).toEqual(['Textos ES: dashboard.week debe llevar week como el inglés'])
    expect(needsRankingMigration(ws)).toBe(true)
    const files = proposalFiles(ws, new Date(Date.UTC(2026, 10, 9)))
    expect(files.map((f) => f.path)).toEqual([
      'src/data/coach_moments.csv',
      'src/data/levels.csv',
      'src/data/ranking_npcs.csv',
      'src/i18n/locales/es/dashboard.json',
      'supabase/migrations/20261109000000_studio_rankings.sql',
    ])
    expect(files.at(-1)!.text).toContain("('NPC-001', 'Ana91', 'MX', 'female', 19, 9822, 70, 2, 1)")
  })

  it('writes announcements and describes them', () => {
    const ws = openWorkspace(base)
    const added = { ...ws, docs: { ...ws.docs, announcements: insertRow(ws.docs.announcements, { id: 'hello', from: '2026-11-10T09:00Z', title: 'Hi', text: 'All' }) } }
    expect(validate(added)).toEqual([])
    expect(summary(added).announcements).toEqual(['**Aviso · hello** (nueva)'])
    const wrong = { ...ws, docs: { ...ws.docs, announcements: insertRow(ws.docs.announcements, { id: 'hello', from: 'mañana', title: 'Hi', text: 'All' }) } }
    expect(validate(wrong)[0]).toMatch(/^Avisos: .*UTC date/)
  })
})

describe('Base Camp in the Studio', () => {
  it('asks for the picture of a new piece before proposing it', () => {
    const ws = openWorkspace(base)
    const added = { ...ws, docs: { ...ws.docs, basecamp: insertRow(ws.docs.basecamp, { id: 'flag', scene: 'exterior', kind: 'decor', level: '2', price: '40', currency: 'coins', art: 'lvl2_flag', name: 'Flag' }) } }
    expect(validate(added)).toEqual(['Base Camp: «Flag» necesita su imagen (súbela en Multimedia)'])
    const withPicture = { ...added, uploads: { 'assets/ui/basecamp/source/exterior/lvl2_flag.png': { base64: 'AAAA', label: 'flag' } } }
    expect(validate(withPicture)).toEqual([])
    expect(summary(withPicture).basecamp).toEqual(['**Base Camp · flag (flag)** (nueva)'])
  })
})
