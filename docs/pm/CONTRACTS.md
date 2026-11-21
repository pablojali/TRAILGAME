# Contracts and file ownership

Where two streams meet. A change to anything in "Shared contracts" needs the owner's approval and a
note in both logs before it is coded.

## File ownership

| Area | Owner | Notes |
|---|---|---|
| `src/features/**`, `src/components/**`, `src/styles/**` | A | Screens, avatar rendering, layout |
| `src/app/**` (shell, routes, inbox, wallet UI) | A | `src/app/game` and `src/app/cloud` are B's: they wire the game state and the server |
| `src/i18n/**` | A, with B adding keys only in new files | See "Language texts" below |
| `public/**`, `index.html`, PWA files | A | |
| `src/domain/**`, `src/game-engine/**` | B | Rules, formulas, simulation; deterministic and testable |
| `src/repositories/**`, `src/app/game/**`, `src/app/cloud/**` | B | Saves, sync, state |
| `supabase/**`, `src/server/**` | B | Migrations, Edge Functions, RLS, `db:test` |
| `src/data/*.csv`, `src/data/courses/**`, `assets/**` | Owner (via Trail Studio) | Sessions read these; they edit them only if the brief says so |
| `src/studio/**`, `studio/**`, `vite.studio.config.ts` | Neither | Change only on explicit owner request |
| `scripts/**`, `.github/**` | B | A asks B for a change |
| `DEVELOPMENT.md`, `README.md` | Append-only, one section each | Add your own section; do not rewrite shared ones. The PM fixes the stale status headers |

## Shared contracts

1. **Save schema** (`coins`, `raceEntries`, attributes, appearance, `sex`, equipment): B changes it,
   with a migration path for older saves. A only reads it through the repository.
2. **Server operations** (`career-ops`, `major-ops` and their request/response types): B owns them. A
   calls them through the existing client layer and never builds its own requests.
3. **Appearance and avatar layers** (`appearance` fields, `assets/runner/**` layout, `AVATAR_ART_SPEC.md`):
   A renders them; the owner supplies the art. Adding a field is a save-schema change (B).
4. **Game values** (training, XP, fatigue, prizes, equipment bonuses): B and the owner's tables. A
   never hard-codes a value in a screen; A shows what the engine returns.
5. **Race, Major and ranking identifiers** (`RACE-nnn`, season ids): never renamed; saves use them.

## Language texts

English, Spanish, French, Italian and German on every screen. A test checks that every language has
every English key with the same placeholders. To avoid both streams editing the same JSON file:
a new feature gets its **own** file (`<part>.json` in all five languages) and is registered in
`src/i18n/i18n.tsx`; edits to an existing part belong to the stream that owns that screen.

## Migrations

Timestamp names (`YYYYMMDDHHMMSS_name.sql`). Only stream B adds migrations. Never edit one that is
already in `main`; add a new one.
