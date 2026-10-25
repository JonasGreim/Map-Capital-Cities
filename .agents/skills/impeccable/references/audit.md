# Existing-product audit (adapted)

Derived from Impeccable skill/reference/audit.md at
bbcb29d9dee6c94915d760bcfc36818ad5be66ad; see [../NOTICE.md](../NOTICE.md).
Modified for Map Capital Cities: existing React/CSS conventions and list/map tasks.

Audit the named surface without fixing it. The unique local focus is
implementation integrity: does it express a coherent product-specific system?

Inspect repeated shortcuts, design-system drift, misleading or decorative content,
and structure interchangeable with an unrelated product. Compare CSS values,
shared components, spacing, typography and interaction states with neighboring
Capital Cities flows (list, map, dialogs and popups). Check that emphasis reflects
task priority and loading, error, empty, pending and success states tell the truth. Verify findings in context; preference alone
is not a defect.

Use `$web-design-guidelines` for relevant accessibility and responsive checks
instead of duplicating findings. Preserve the 32 × 32 px square markers and
list/map consistency; do not impose an unrelated design system. No deterministic
detector is bundled; do not invent detector results or certify WCAG conformance
from source inspection.

Prioritize verified findings:

- P0: prevents task completion.
- P1: significant user difficulty or an inaccessible task path.
- P2: annoyance with a usable workaround.
- P3: cosmetic polish with little practical impact.

For each finding give component/file:line, evidence, user impact, category and a
specific recommendation. Group recurring causes instead of counting the same
problem repeatedly. State positive patterns to preserve and browser/measurement
limitations. Recommend scoped next steps without automatically running them.
