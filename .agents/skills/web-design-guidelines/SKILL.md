---
name: web-design-guidelines
description: "Review or improve Capital Cities web UI accessibility, semantic HTML, keyboard/focus, responsive layouts, forms, dialogs and loading/error feedback. Use for UI correctness; not backend-only work or unsolicited redesign."
license: MIT
---

# Web Design Guidelines

Read [references/guidelines.md](references/guidelines.md), the local curated
accessibility and usability checklist. Follow root AGENTS.md, README and the
active task; inspect only the affected components and callers.

Work with React 18, TypeScript, Vite 5, Zustand, Mapbox GL JS and plain CSS.
Inspect `frontend/src/styles.css` and the relevant list, form, dialog, map or
marker components. Preserve English UI terminology, the existing visual language,
shared store and API loading/mutation semantics. Keep the assignment's square
32 × 32 px markers; generic target-size advice does not override that contract.

Use semantic native controls before adding ARIA or custom keyboard behavior.
Review dialog focus, validation and async feedback across the complete action.
Treat performance, copy and URL-state advice as contextual prompts, not reasons
to add dependencies, routing, themes or a design system. Use `$impeccable` when
the task also asks for design critique or polish; avoid duplicate findings.

Report verified findings with file:line, user impact and a concrete correction.
Use available isolated browser tools for keyboard, focus, responsive and touch
checks when practical. A source review or passing build cannot establish those
behaviors; report untested states and unavailable services explicitly.

## Attribution

Adapted from [Quiz-Mate at 97a36aa](https://github.com/Toiibox/Quiz-Mate/tree/97a36aa2427392755cf6cd3ee4542bebece99fc7/.agents/skills/web-design-guidelines),
based on Vercel's [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/434b7f91364665f2f733b310ec54809bf8f37937/command.md).
Modified for this React/Vite app: removed foreign product/framework assumptions
and narrowed the checklist to applicable UI concerns. Copyright (c) 2025 Vercel
Labs; [MIT license](LICENSE) retained unchanged. No runtime fetching or tooling.
