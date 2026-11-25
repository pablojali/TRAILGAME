/**
 * The bundled avatar art, by path (`/assets/runner/avatar/heads/….webp` → URL). Its own module so
 * game tests can run on a fixed set of heads and shirts while the owner adds and deletes art
 * (src/test/setup.ts); avatarArt.test.ts checks the real files.
 */
export const ART: Record<string, string> = import.meta.glob<string>('/assets/runner/avatar/**/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
})
