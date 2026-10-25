# Web Interface Guidelines (adapted)

Derived from Vercel's command.md at
434b7f91364665f2f733b310ec54809bf8f37937, via Quiz-Mate at
97a36aa2427392755cf6cd3ee4542bebece99fc7; see [../SKILL.md](../SKILL.md)
for attribution and [../LICENSE](../LICENSE) for the unchanged MIT license.
Modified for Map Capital Cities: React 18, Vite 5, Mapbox and plain CSS.
Use the following as scoped review prompts, not automatic redesign instructions.

## Semantic HTML and accessibility

- Use native buttons for actions and anchors for navigation; avoid clickable divs.
- Give every control an accessible name. Prefer visible labels linked with
  React's `htmlFor`; give icon-only buttons a useful `aria-label`.
- Use semantic main, header, section, list and heading structure before ARIA.
  Keep heading levels logical and provide a way to skip repetitive controls.
- Give meaningful images alt text; hide decorative images/icons appropriately.
- Do not communicate status, errors, marker selection or actions through color
  alone. Check text, control and focus contrast in their actual states.
- Check meaningful reading order and names of repeated Edit/Delete controls.

## Keyboard and focus

- Keep all actions keyboard-accessible with a logical tab order and visible
  focus. Never remove an outline without an equivalent CSS replacement.
- Use `:focus-visible` and, where useful, `:focus-within`; overlays and sticky
  content must not obscure focus.
- Preserve native button/link activation rather than duplicating key handlers.
- Check scrolling, skip-to-map behavior, marker buttons and popup controls.
  Map panning/pinch gestures must not be the only way to reach a task.
- Preserve browser zoom and navigation; do not disable scaling or suppress
  page scrolling globally to conceal layout problems.

## Forms and dialogs

- Use appropriate input types, names, input modes and autocomplete only where
  meaningful. Labels remain visible; placeholders are not labels. Allow paste.
- Keep controlled React inputs paired with `onChange` and inexpensive to update.
- Show inline field errors linked with `aria-describedby` and mark invalid
  inputs with `aria-invalid`. Focus the first invalid field after submission.
- Validate required text and finite coordinate bounds without losing input.
  Preserve legitimate negative coordinates and use JSON numbers for API writes.
- Give dialogs an accessible title and sensible initial focus; keep Tab within
  a modal, support Escape/cancel when idle and restore focus after closing.
  Prefer the existing native `<dialog>` behavior over a custom focus trap.
- Keep create/edit/delete actions and consequences clear. Destructive actions
  need the existing confirmation flow; do not discard edits silently.
- Reflect pending requests and prevent duplicate writes. If closing/canceling is
  disabled during a write, explain progress and allow recovery after failure.

## Feedback and asynchronous states

- Distinguish loading, empty, error, success and disabled states. Avoid claiming
  success until the server response confirms the write.
- Announce asynchronous status politely; reserve urgent alerts for errors needing
  immediate attention. Avoid excessive repeated screen-reader announcements.
- Keep errors specific, safe and actionable with retry/recovery where appropriate.
  Preserve form values and explain uncertain write outcomes before retrying.
- Check initial fetch, refresh, slow/offline responses, invalid data, conflicts and
  missing records. Keep list, marker popups and Zustand state consistent.
- A missing Mapbox token, blocked map resource or failed API must leave readable
  feedback and usable independent tasks; never expose server credentials.

## Responsive layout and content

- Check narrow, intermediate and wide viewports, text zoom and long city/country
  names. Ensure list, map, buttons, popups and dialog content remain reachable.
- Prefer CSS grid/flex and existing breakpoints over JavaScript measurement.
  Use `min-width: 0`, wrapping and appropriate overflow to fix the cause rather
  than hiding inaccessible content.
- Keep dialogs within the viewport with reachable controls and sensible scrolling.
  Check touch targets and gesture alternatives on actual affected controls;
  preserve the assignment's 32 × 32 px square markers.
- Keep touch scrolling, selection and browser gestures usable. Apply
  `touch-action` or `overscroll-behavior` only after testing the affected surface.
- If images are introduced, set dimensions/aspect ratio to prevent layout shift;
  use native loading/priority attributes appropriate to their visibility.

## Interaction, motion and performance

- Provide coherent hover, active, focus and disabled feedback with plain CSS;
  hover must not be the sole means to discover or operate a control.
- Honor `prefers-reduced-motion`; avoid unnecessary autoplay and make motion
  interruptible. Prefer transform/opacity; list transitioned properties
  explicitly instead of `transition: all`.
- Preserve Mapbox instance/marker cleanup and resize behavior. Avoid layout reads
  during React render and unnecessary map reconstruction.
- Investigate observed slow lists before proposing virtualization or dependencies.
  A fixed item-count threshold is not evidence of a performance defect.
- Preserve existing copy and state conventions. Use specific action labels and
  helpful next steps; do not add routing, URL synchronization or themes merely
  to satisfy a generic checklist.
