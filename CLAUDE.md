# TRAILGAME — instructions for Claude Code

Trail Manager: a trail-running career management game (React + TypeScript + Vite, Supabase backend).

- Technical specification: `DEVELOPMENT.md`. Game design: `docs/GAME_DESIGN_BIBLE.md`.
- **If you were given a stream (A or B) or a PM brief, start at `docs/pm/README.md`.** It defines who
  owns which files, the branch and report rules, and what not to touch.
- Definition of Done: `DEVELOPMENT.md` section 12. `npm run check` must pass before a PR.
- Never hand-edit generated files (`supabase/functions/*/index.js`, prepared art); CI rebuilds them.
- Never change a balance value or mark a milestone complete without the owner's approval.
- The owner's tables (`src/data/*.csv`) and art (`assets/**`) are edited through Trail Studio; do not
  edit them unless your task says so.
