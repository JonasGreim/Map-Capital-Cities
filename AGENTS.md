# Map Capital Cities

## Project

- Follow the local, gitignored `Testaufgabe-Fullstack.pdf` as the primary domain
  reference when readable; otherwise use README and relevant live issues/comments.
  Report gaps instead of inventing requirements.
- Stack: React 18, TypeScript, Vite 5, Zustand, Mapbox GL JS, plain CSS;
  Node.js, Fastify 5 and PostgreSQL via `pg`. Keep the existing npm workspaces.
- Use Node 24.22.1 and npm 11.19.1. Preserve root `.env` loading, API port 3001
  (unless `PORT` overrides it) and DB-backed `GET /health`.
- Keep implementations simple and focused on the requested task.

## Workflow

- Read relevant code; inspect Git status, remotes and current `origin/main`
  before editing. Preserve existing local changes.
- Work on feature branches. Never push directly to main, merge automatically,
  force-push or rewrite history. Leave PRs against `main` open for user review.
- Never commit secrets, `.env`, the assignment PDF, browser sessions or generated
  artifacts. Use `.env.example` for variable names; never log secret values.
- Before a PR, run `npm run check`, `npm test` and `git diff --check`; review the
  complete diff and staged files. Report actual results and unavailable services;
  mocks do not prove PostgreSQL integration.
- Verify UI changes in an isolated browser session without an authenticated
  profile when practical; missing browser tools must not block static checks.
- Never perform destructive database operations without explicit approval.

## Agent Skills

- `$issue-work` — GitHub issue implementation through an open PR.
- `$pr-review` — Independent PR or local-diff review.
- `$impeccable` — UI audit, critique and polish.
- `$web-design-guidelines` — Accessibility, usability and responsive design.
- `$fastify-http` — Fastify routes, validation and HTTP contracts.

Load only skills relevant to the current task.
