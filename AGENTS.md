# Map Capital Cities

- Read the live issue, its comments, README and relevant code before editing. The local,
  gitignored `Testaufgabe-Fullstack.pdf` is the primary domain reference when readable.
  Otherwise use README and issue requirements; report gaps instead of inventing them.
- Keep it simple: working software first. Implement only the requested issue; avoid
  unrelated refactors, speculative abstractions and optional tooling that delays MUSTs.
- Use Node 24.22.1, npm 11.19.1 and the existing npm workspaces: `backend` (Fastify 5,
  TypeScript, PostgreSQL `pg`) and `frontend` (React, Vite, TypeScript, Zustand, Mapbox).
  Preserve root `.env` loading, port 3001 and the DB-backed `GET /health` contract.
- Inspect status, remote and current `origin/main`; protect all existing local edits.
  Work on a focused feature branch. No direct main pushes, automatic merges,
  force-pushes, history rewrites, destructive Git/DB actions or unrelated changes.
- Never commit credentials, `.env`, the assignment PDF, browser sessions or build output.
  Use `.env.example` for variable names; do not print secret values in logs or reviews.
- Before a PR run `npm run check`, relevant tests (`npm test` for health), and
  `git diff --check`. Review the complete diff and intended staged files. Record real
  results and unavailable services; mocks do not prove PostgreSQL integration.
- For issue implementation use `$issue-work #N`; for an independent review use
  `$pr-review #N`. Leave implementation PRs against `main` open for user review.
- Browser MCP tools are optional for relevant UI work. Use isolated sessions and no
  authenticated profiles; missing browser tooling must not block backend/static checks.
