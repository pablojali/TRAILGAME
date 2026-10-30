import { describe, expect, it } from 'vitest'

/** Source of every non-test module of the two pure layers, by path (read at test time by Vite). */
const SOURCES = import.meta.glob<string>(['/src/domain/**/*.{ts,tsx}', '/src/game-engine/**/*.{ts,tsx}', '!**/*.test.*'], {
  eager: true,
  query: '?raw',
  import: 'default',
})

describe('architecture boundaries', () => {
  it('finds the domain and game-engine modules', () => {
    const paths = Object.keys(SOURCES)
    expect(paths.some((p) => p.startsWith('/src/domain/'))).toBe(true)
    expect(paths.some((p) => p.startsWith('/src/game-engine/'))).toBe(true)
  })

  it.each(Object.entries(SOURCES))('%s uses no Vite runtime API, React or Supabase', (_, code) => {
    expect(code).not.toMatch(/import\.meta/)
    expect(code).not.toMatch(/from ['"](react|react-dom|react-router|@supabase\/[^'"]+)['"]/)
  })
})
