import { describe, expect, it } from 'vitest'
import { parseCsv } from '../data/csv'
import { diffDocs, insertRow, parseDoc, rows, serializeDoc, updateRow } from './csvDoc'

const TABLE = `# A comment, with "quotes" and commas
id,name,terrain
RACE-001,Forest,"Paths, roots"
RACE-002,River,Dirt

# trailing note
`

describe('Studio CSV tables', () => {
  it('reads and writes a table back unchanged, comments and quoting included', () => {
    const doc = parseDoc(TABLE)
    expect(doc.header).toEqual(['id', 'name', 'terrain'])
    expect(rows(doc).map((r) => r.values.terrain)).toEqual(['Paths, roots', 'Dirt'])
    expect(serializeDoc(doc)).toBe(TABLE)
  })

  it('rewrites only the edited row, quoting where needed, and stays readable by the game', () => {
    const doc = updateRow(parseDoc(TABLE), (r) => r.values.id === 'RACE-002', { name: 'River "Run"', terrain: 'Dirt, rocks' })
    const text = serializeDoc(doc)
    expect(text).toContain('RACE-001,Forest,"Paths, roots"\n')
    expect(text).toContain('RACE-002,"River ""Run""","Dirt, rocks"\n')
    expect(parseCsv(text)[1]).toEqual({ id: 'RACE-002', name: 'River "Run"', terrain: 'Dirt, rocks' })
    // Setting a value it already has changes nothing.
    expect(serializeDoc(updateRow(parseDoc(TABLE), (r) => r.values.id === 'RACE-001', { name: 'Forest' }))).toBe(TABLE)
  })

  it('adds rows after a given row or before the trailing blank lines, and lists what changed', () => {
    const base = parseDoc(TABLE)
    const added = insertRow(base, { id: 'RACE-003', name: 'Peak', terrain: 'Rock' }, (r) => r.values.id === 'RACE-001')
    expect(rows(added).map((r) => r.values.id)).toEqual(['RACE-001', 'RACE-003', 'RACE-002'])
    const edited = updateRow(added, (r) => r.values.id === 'RACE-002', { name: 'River' + '!' })
    expect(diffDocs(base, edited, (v) => v.id!)).toEqual([
      { key: 'RACE-003', kind: 'added', fields: [
        { column: 'id', before: '', after: 'RACE-003' },
        { column: 'name', before: '', after: 'Peak' },
        { column: 'terrain', before: '', after: 'Rock' },
      ] },
      { key: 'RACE-002', kind: 'changed', fields: [{ column: 'name', before: 'River', after: 'River!' }] },
    ])
  })
})
