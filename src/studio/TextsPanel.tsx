import { useEffect, useMemo, useState } from 'react'
import { listFolder, readFile } from './github'
import { jsonText, type TextFile, type TextValue, type Workspace } from './model'

const LANGUAGES = ['en', 'es', 'fr', 'it', 'de'] as const
const SCREENS: Record<string, string> = {
  common: 'Common (menu, attributes, sessions)',
  dashboard: 'Dashboard',
  training: 'Training',
  equipment: 'Equipment',
  looks: 'Look',
  races: 'Races',
  raceRun: 'Race in progress',
  raceResult: 'Race result',
  career: 'Career',
  setup: 'Create runner',
  settings: 'Settings',
  account: 'Account and cloud',
  coach: 'Coach (welcome and buttons)',
}
const pathOf = (language: string, screen: string) => `src/i18n/locales/${language}/${screen}.json`
const placeholders = (value: TextValue | undefined) =>
  [...new Set([...(typeof value === 'string' ? value : Object.values(value ?? {}).join(' ')).matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort().join(',')

/**
 * The game's texts (owner request, 9 November 2026): every screen's texts in the five languages side
 * by side, with a search. Only the wording changes here: the keys are the game's (a new text needs
 * code). Placeholders such as {name} must stay as in English.
 */
export function TextsPanel({
  token,
  ws,
  addTexts,
  setText,
  drafts,
  only,
}: {
  /** Only these texts (one screen, keys starting with `prefix`), without the screen list. */
  only?: { screen: string; prefix: string }
  token: string
  ws: Workspace
  addTexts(files: Record<string, TextFile>): void
  setText(path: string, key: string, value: TextValue): void
  drafts: Record<string, { base: string; text: string }>
}) {
  const [screens, setScreens] = useState<string[] | null>(null)
  const [error, setError] = useState('')
  const [screen, setScreen] = useState(only?.screen ?? 'dashboard')
  const [search, setSearch] = useState('')
  const [onlyProblems, setOnlyProblems] = useState(false)
  const loaded = screens !== null && screens.every((s) => LANGUAGES.every((l) => ws.texts[pathOf(l, s)]))

  useEffect(() => {
    if (screens !== null) return
    let live = true
    void (async () => {
      try {
        const files = await listFolder(token, 'src/i18n/locales/en')
        const names = files.filter((f) => f.name.endsWith('.json')).map((f) => f.name.slice(0, -5))
        const missing = names.flatMap((s) => LANGUAGES.map((l) => pathOf(l, s))).filter((p) => !ws.texts[p])
        const read = await Promise.all(missing.map(async (p) => [p, await readFile(token, p)] as const))
        if (!live) return
        const texts: Record<string, TextFile> = {}
        for (const [p, base] of read) {
          // A draft of this file from an earlier visit is used while main has not changed.
          const draft = drafts[p]
          texts[p] = { base, data: JSON.parse(draft && draft.base === base ? draft.text : base) as Record<string, TextValue> }
        }
        addTexts(texts)
        setScreens(names)
      } catch (e) {
        if (live) setError(`Could not read the texts: ${(e as Error).message}`)
      }
    })()
    return () => {
      live = false
    }
  }, [token, screens, ws.texts, addTexts, drafts])

  const keys = useMemo(() => {
    if (!loaded || !screens) return []
    const query = search.trim().toLowerCase()
    const pool = query ? screens : [screen]
    const out: { screen: string; key: string }[] = []
    for (const s of pool) {
      const english = ws.texts[pathOf('en', s)]!.data
      for (const key of Object.keys(english)) {
        if (only && !key.startsWith(only.prefix)) continue
        const values = LANGUAGES.map((l) => ws.texts[pathOf(l, s)]!.data[key])
        if (query && !key.toLowerCase().includes(query) && !values.some((v) => JSON.stringify(v ?? '').toLowerCase().includes(query))) continue
        if (onlyProblems && !values.some((v) => v === undefined || placeholders(v) !== placeholders(english[key]) || (typeof v === 'string' && !v.trim()))) continue
        out.push({ screen: s, key })
      }
    }
    return out
  }, [loaded, screens, screen, search, onlyProblems, ws.texts, only])

  if (error) return <p className="error">{error}</p>
  if (!loaded || !screens) return <p className="loading">Reading the game's texts (5 languages)…</p>

  const changedIn = (s: string) => LANGUAGES.filter((l) => jsonText(ws.texts[pathOf(l, s)]!.data) !== ws.texts[pathOf(l, s)]!.base).length

  return (
    <div className={only ? '' : 'textsLayout'}>
      {!only && (
      <aside className="listPane screens" aria-label="Screens">
        <input type="search" placeholder="Search every text…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="check">
          <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Only with problems
        </label>
        <ul>
          {screens.map((s) => (
            <li key={s}>
              <button type="button" aria-pressed={!search && s === screen} onClick={() => { setSearch(''); setScreen(s) }}>
                {changedIn(s) > 0 && <span className="dot" />}
                {SCREENS[s] ?? s}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      )}
      <section className="editPane textsTable" aria-label="Texts">
        <p className="hint">
          {search ? `${keys.length} texts found.` : `${SCREENS[screen] ?? screen}: ${keys.length} texts.`} Words in braces, like {'{name}'}, are replaced by a
          value: keep them in every language.
        </p>
        <table>
          <thead>
            <tr>
              <th>Text</th>
              {LANGUAGES.map((l) => (
                <th key={l}>{l.toUpperCase()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.map(({ screen: s, key }) => {
              const english = ws.texts[pathOf('en', s)]!.data[key]
              return (
                <tr key={`${s}.${key}`}>
                  <td className="keyCell">
                    {search && <span className="rowId">{SCREENS[s] ?? s}</span>}
                    {key.split('.').slice(1).join('.')}
                  </td>
                  {LANGUAGES.map((l) => {
                    const path = pathOf(l, s)
                    const value = ws.texts[path]!.data[key]
                    const base = (JSON.parse(ws.texts[path]!.base) as Record<string, TextValue>)[key]
                    const changed = JSON.stringify(value) !== JSON.stringify(base)
                    const wrong = value === undefined || placeholders(value) !== placeholders(english)
                    const forms = typeof english === 'object' ? Object.keys(english) : null
                    return (
                      <td key={l} className={`${changed ? 'changed' : ''}${wrong ? ' wrong' : ''}`}>
                        {forms ? (
                          forms.map((form) => (
                            <label key={form} className="form1">
                              <span>{form}</span>
                              <textarea
                                rows={1}
                                value={(value as Record<string, string> | undefined)?.[form] ?? ''}
                                onChange={(e) => setText(path, key, { ...(value as Record<string, string>), [form]: e.target.value })}
                              />
                            </label>
                          ))
                        ) : (
                          <textarea rows={2} aria-label={`${key} ${l}`} value={(value as string | undefined) ?? ''} onChange={(e) => setText(path, key, e.target.value)} />
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </div>
  )
}
