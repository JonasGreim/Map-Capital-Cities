> Modified for Map Capital Cities from Quiz-Mate's adapted Impeccable polish.md;
> see [../NOTICE.md](../NOTICE.md).

Polish is refinement, never concealed redesign. Preserve the incumbent visual world, content, behavior, and everything outside scope. If the concept itself is wrong, say so and recommend redesign instead of smuggling in a replacement.

Inspect the rendered experience and real interaction path.

## 1. Establish the system

Read README, the assignment and affected components in `frontend/src/`, including
`styles.css` and neighboring list/map/dialog flows. Use the existing plain CSS
values and patterns; a formal token or theme system is not required.

Classify each drift before fixing it:

- **inconsistent value:** a repeated CSS value differs from the established pattern;
- **one-off implementation:** an existing shared component or pattern should replace it;
- **conceptual mismatch:** the flow, information architecture, or hierarchy differs from comparable product areas;
- **local defect:** the implementation is simply incomplete or inconsistent.

Fix the cause at the narrowest correct level. Ask when a binding system principle cannot be inferred.

## 2. Gather the evidence

Use the actual feature at representative narrow and wide web sizes in an
isolated browser session. Establish the states, content lengths and input methods
users will encounter. Incorporate relevant existing findings supplied in the task; no
snapshot persistence or detector is installed. State browser limitations honestly.

## 3. Triage

Separate functional defects from cosmetic ones and fix in this order:

1. broken or blocked tasks, data loss, misleading state, and inaccessible paths;
2. missing loading, empty, error, success and disabled states;
3. flow, hierarchy, responsive layout and drift from existing conventions;
4. visual and motion inconsistencies;
5. code and asset cleanup.

Do not perfect one corner while leaving the rest below the same quality bar.

## 4. Polish the whole path

### Flow and hierarchy

- Match neighboring mental models, terminology, disclosure, navigation, save behavior, and optimistic or pessimistic patterns.
- Make the primary task and current state obvious without flattening every element to equal weight.
- Ensure arrival, transition, empty, and recovery paths connect instead of behaving as isolated screens.

### Layout and type

- Align to the existing grid and CSS spacing; fix optical as well as mathematical alignment.
- Group related content tightly and separate distinct groups generously.
- Keep same-role typography consistent; test measure, wrapping, localization expansion, zoom, and font loading.
- Verify representative affected viewports per AGENTS.md rather than only the current screenshot.

### Color, imagery, and icons

- Use existing CSS color values consistently; preserve marker color choices.
- Verify text, control, and focus contrast in every state.
- Keep icon families, stroke/weight, sizing, and optical alignment coherent.
- Prevent image layout shift; use correct aspect ratios, responsive sources, and useful alt text.

### Interaction and state

- Every control needs appropriate default, hover, focus, active, disabled, loading, error, and success behavior.
- Preserve visible keyboard focus, logical tab order, labels, and platform-appropriate touch targets.
- Keep motion coherent, interruptible, and performant. Do not add animation merely to make polish visible.
- Validate long, missing, localized, offline and slow content where the product can encounter it.

### Content and code

- Keep terminology, capitalization, punctuation, and factual copy consistent. Keep factual copy grounded in the assignment and README.
- Remove debug output, dead code, unused imports, obsolete styles, and polish-created duplication.
- Replace custom implementations with shared components where the system owns the pattern.
- Reuse genuinely repeated CSS values or existing classes; do not build a token system for one local exception.

## 5. Verify and finish

Walk the complete path again with mouse, keyboard, and touch where applicable. Check:

- representative mobile, intermediate, and wide web layouts;
- loading, empty, error, success, disabled, long-content, and missing-content states;
- zoom, contrast, focus, semantics, and screen-reader names;
- console errors, layout shift, interaction latency, and image loading in the affected flow;
- agreement with README, the assignment, existing component conventions and the user's scope.

Preserve 32 × 32 px square markers and shared Zustand list/map state.
Run relevant repository checks and real-browser verification per AGENTS.md. A
clean check does not replace visual judgment. Finish with a source diff: remove
accidental churn and temporary artifacts; report completed refinements and any
untested states. No hook, detector, critique-storage or automatic follow-up runs.
