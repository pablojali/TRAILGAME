/**
 * A small CSV reader for the owner's tables in src/data (owner request, 3 November 2026): comma
 * separated, the first row is the header, fields may be "quoted" (with "" for a quote inside),
 * blank lines and lines starting with # are ignored. Each row becomes an object keyed by header.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        quoted = false
      } else {
        field += c
      }
    } else if (c === '"') {
      quoted = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  const meaningful = rows.filter((r) => !(r.length === 1 && r[0]!.trim() === '') && !r[0]!.trim().startsWith('#'))
  const [header, ...body] = meaningful
  if (!header) return []
  const keys = header.map((h) => h.trim())
  return body.map((r, line) => {
    if (r.length !== keys.length) throw new Error(`CSV row ${line + 2}: ${r.length} fields, expected ${keys.length}`)
    return Object.fromEntries(keys.map((key, i) => [key, r[i]!.trim()]))
  })
}

/** A whole number from a CSV field, or an error naming the table and row. */
export function csvInt(value: string | undefined, where: string): number {
  const n = Number(value)
  if (value === undefined || value === '' || !Number.isInteger(n)) throw new Error(`${where}: "${value}" is not a whole number`)
  return n
}

/** A number from a CSV field (empty: `fallback`). */
export function csvNumber(value: string | undefined, where: string, fallback?: number): number {
  if ((value === undefined || value === '') && fallback !== undefined) return fallback
  const n = Number(value)
  if (value === undefined || value === '' || !Number.isFinite(n)) throw new Error(`${where}: "${value}" is not a number`)
  return n
}
