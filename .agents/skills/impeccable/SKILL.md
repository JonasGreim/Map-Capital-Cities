---
name: impeccable
description: "Audit, critique or polish the existing Capital Cities UI: hierarchy, spacing, consistency and interaction quality. Use for requested UI refinement; not routine frontend edits, a new design language or backend work."
license: Apache-2.0
---

# Impeccable for Map Capital Cities

Modified for Map Capital Cities from the curated static subset in Quiz-Mate;
see [NOTICE.md](NOTICE.md) and [LICENSE](LICENSE).

Use only the requested mode and target:

- Audit: read [references/audit.md](references/audit.md) to inspect consistency
  and implementation integrity without editing.
- Critique: read [references/critique.md](references/critique.md) to assess
  hierarchy, cognitive load, terminology and user journeys without editing.
- Polish: read [references/polish.md](references/polish.md) for authorized
  refinements that preserve the existing surface's identity and behavior.

Follow root AGENTS.md, the assignment PDF, README and the active task. Inspect
the affected React components and neighboring flows in `frontend/src/`, especially
`styles.css`, `CapitalList.tsx`, `CapitalDialog.tsx`, `CapitalForm.tsx`, `Map.tsx`
and `capital-markers.ts` as relevant. The stack is React 18, TypeScript, Vite 5,
Zustand, Mapbox GL JS and plain CSS; use its existing conventions.

Judge the list/map layout, CRUD dialogs and marker popups against their actual
tasks. Preserve the assignment's 32 × 32 px square markers, shared Zustand state
and existing visual language. A generic aesthetic preference does not justify
replacing fonts, colors or components. Redesign requires a request for it.

Use `$web-design-guidelines` only for relevant accessibility/usability checks;
avoid duplicate findings. Inspect the rendered flow with available isolated
browser tools and state limitations. No upstream CLI, installer, hooks, generated
design documents or automatic follow-up workflows are needed or permitted by
this skill.

Return prioritized findings, locations, user impact, specific recommendations
and strengths to preserve. Separate observed defects from design judgment and
untested assumptions. A review does not authorize implementing its suggestions.
