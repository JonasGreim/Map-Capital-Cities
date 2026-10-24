---
name: issue-work
description: Implement a Map Capital Cities GitHub issue through checks, commit, push and an open PR. Use for an issue implementation request or $issue-work with a number or URL; not for review-only or planning-only requests.
---

# Issue work

Use `$issue-work #N` for `JonasGreim/Map-Capital-Cities`; verify repository context
for a URL. A full implementation request includes a feature branch, validation,
commit, push and an open PR. A narrower request limits that scope; automatic skill
selection never expands authorization. Follow root `AGENTS.md`.

1. Read the complete live issue, all comments and acceptance criteria with `gh` or
   an available GitHub connector. Read the local assignment PDF when available,
   README and relevant code/configuration. Do not invent missing requirements.
2. Inspect status, remotes, current `origin/main` and overlapping branches/PRs.
   Protect local changes; never auto-stash, reset or overwrite them. Create a
   focused non-main branch from the verified base. Give a short implementation
   and validation plan; resolve essential scope conflicts before dependent edits.
3. Implement only the issue. Preserve the npm workspaces and existing contracts.
   Avoid unrelated refactors, product features and dependencies. Keep optional
   tooling proportional to the remaining time and functional MUSTs.
4. Use Node 24.22.1/npm 11.19.1. Run `npm ci`, `npm run check`, relevant tests and
   `git diff --check`; check individual acceptance commands when required. Review
   dependency advisories without `npm audit fix --force`. Distinguish mock tests
   from real DB/browser evidence and report failures or unavailable services.
5. Review the full tracked/untracked diff against acceptance criteria. Stage only
   intended files; exclude `.env`, secrets, the assignment PDF and generated state.
   Verify branch and destination, commit and push an explicit feature-branch ref.
6. Create a PR against `main` with issue link, changes, actual checks and remaining
   risks. Use `Closes #N` only when required acceptance is complete; otherwise use
   `Refs #N` and explain gaps (draft for unresolved implementation/check failures).
   Inspect CI for the actual PR head; pending CI is not a passing result.

Leave the PR open. Never merge, enable auto-merge, push directly to main, force
history changes or perform destructive DB actions. Do not post unrelated messages
or change issue/project metadata. If authentication or a tool fails, use an
available authorized alternative or report the exact unfinished step; do not claim
success. Finish with branch, commit, PR link, real checks, audit findings, optional
work deferred and necessary manual verification.
