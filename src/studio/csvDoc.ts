/**
 * A CSV table as Trail Studio edits it (owner request, 9 November 2026): the same format the game
 * reads (src/data/csv.ts), kept line for line so that saving changes only the rows that were edited.
 * Comment lines (#…) and blank lines stay exactly as they were.
 */
export interface CsvRow {
  /** The row's original text (with its line break), or null once edited or added. */
  raw: string | null
  values: Record<string, string>
}

export type CsvLine = { kind: 'raw'; text: string } | { kind: 'header'; text: string } | { kind: 'row'; row: CsvRow }

export interface CsvDoc {
  header: string[]
  lines: CsvLine[]
}

/** Splits one record (from `start`) into fields; returns them and where the next record starts. */
function readRecord(text: string, start: number): { fields: string[]; end: number } {
  const fields: string[] = []
  let field = ''
  let quoted = false
  let i = start
  for (; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      fields.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      i++
      fields.push(field)
      return { fields, end: i }
    } else field += c
  }
  fields.push(field)
  return { fields, end: i }
}

export function parseDoc(text: string): CsvDoc {
  const lines: CsvLine[] = []
  let header: string[] | null = null
  let i = 0
  while (i < text.length) {
    const lineEnd = text.indexOf('\n', i)
    const line = text.slice(i, lineEnd === -1 ? text.length : lineEnd + 1)
    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      lines.push({ kind: 'raw', text: line })
      i += line.length
      continue
    }
    const { fields, end } = readRecord(text, i)
    const raw = text.slice(i, end)
    if (!header) {
      header = fields.map((f) => f.trim())
      lines.push({ kind: 'header', text: raw })
    } else {
      if (fields.length !== header.length) throw new Error(`CSV: a row has ${fields.length} fields, expected ${header.length}`)
      lines.push({ kind: 'row', row: { raw, values: Object.fromEntries(header.map((key, k) => [key, fields[k]!.trim()])) } })
    }
    i = end
  }
  if (!header) throw new Error('CSV: no header row')
  return { header, lines }
}

function quote(value: string): string {
  return /[",\r\n]/.test(value) || value !== value.trim() ? `"${value.replace(/"/g, '""')}"` : value
}

export function serializeDoc(doc: CsvDoc): string {
  return doc.lines
    .map((line) => {
      if (line.kind !== 'row') return line.text
      return line.row.raw ?? `${doc.header.map((key) => quote(line.row.values[key] ?? '')).join(',')}\n`
    })
    .join('')
}

export function rows(doc: CsvDoc): CsvRow[] {
  return doc.lines.flatMap((line) => (line.kind === 'row' ? [line.row] : []))
}

/** A copy of the table with one row's fields changed (only fields that really change mark it edited). */
export function updateRow(doc: CsvDoc, match: (row: CsvRow) => boolean, changes: Record<string, string>): CsvDoc {
  return {
    ...doc,
    lines: doc.lines.map((line) => {
      if (line.kind !== 'row' || !match(line.row)) return line
      const changed = Object.entries(changes).some(([key, value]) => (line.row.values[key] ?? '') !== value)
      return changed ? { kind: 'row', row: { raw: null, values: { ...line.row.values, ...changes } } } : line
    }),
  }
}

/** A copy with a new row after the last row matching `after` (else at the end). */
export function insertRow(doc: CsvDoc, values: Record<string, string>, after?: (row: CsvRow) => boolean): CsvDoc {
  const lines = [...doc.lines]
  let at = lines.length
  if (after) {
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]!
      if (line.kind === 'row' && after(line.row)) {
        at = i + 1
        break
      }
    }
  } else {
    // At the end, but before trailing blank lines.
    while (at > 0 && lines[at - 1]!.kind === 'raw' && (lines[at - 1] as { text: string }).text.trim() === '') at--
  }
  const full = Object.fromEntries(doc.header.map((key) => [key, values[key] ?? '']))
  lines.splice(at, 0, { kind: 'row', row: { raw: null, values: full } })
  return { ...doc, lines }
}

export interface RowChange {
  key: string
  kind: 'added' | 'changed'
  fields: { column: string; before: string; after: string }[]
}

/** What changed between two versions of a table, row by row (rows matched by `keyOf`). */
export function diffDocs(before: CsvDoc, after: CsvDoc, keyOf: (values: Record<string, string>) => string): RowChange[] {
  const old = new Map(rows(before).map((row) => [keyOf(row.values), row.values]))
  const changes: RowChange[] = []
  for (const row of rows(after)) {
    const key = keyOf(row.values)
    const previous = old.get(key)
    const fields = after.header
      .filter((column) => (previous?.[column] ?? '') !== (row.values[column] ?? ''))
      .map((column) => ({ column, before: previous?.[column] ?? '', after: row.values[column] ?? '' }))
    if (!previous) changes.push({ key, kind: 'added', fields })
    else if (fields.length) changes.push({ key, kind: 'changed', fields })
  }
  return changes
}
