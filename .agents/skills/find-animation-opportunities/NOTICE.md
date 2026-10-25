# Provenance and local use

- Skill: `find-animation-opportunities` by Emil Kowalski.
- Upstream: https://github.com/emilkowalski/skills
- Reviewed revision: `2d228630ba1446365f614a108cb8252f1feda202`.
- Source: `skills/find-animation-opportunities/SKILL.md` (unmodified).
- License: MIT, Copyright (c) 2026 Emil Kowalski; upstream root LICENSE is
  included unchanged in this directory. No separate skill version is published;
  use the full upstream commit as the version pin.
- SKILL.md SHA-256: `d52a377819b84a71930f0c822cfe2849f40301605a2d5c7eccbfa3b257700df2`.

Installed with the bundled Codex skill-installer's
`install-skill-from-github.py`, using explicit `--ref`, `--path`, `--dest` and
`--method download`. See [the audit](../../../docs/animation-opportunities-audit.md)
for the exact command, security review, CLI help review and recognition evidence.
The additional files here are this provenance notice and the upstream license;
no scripts, other skills, dependencies, telemetry or configuration are installed.

From this repository, invoke the skill with a concrete question:

```text
$find-animation-opportunities Find purposeful animation opportunities in the current Map Capital Cities interface. Prioritize usability, clarity, spatial consistency, responsiveness, accessibility and performance. Explicitly identify interactions that should not animate. This is a read-only audit. Do not modify application code. Provide a prioritized report with precise recommendations.
```

Codex CLI 0.114.0 app-server `skills/list` with this repository in `cwds` and
`forceReload: true` returned this SKILL.md with `scope: repo`, `enabled: true`
and no errors. Existing project skills were also recognized. No parent-chat
restart was required to read and apply the installed instructions explicitly;
a fresh local app-server provided the discovery check. If the IDE's skill picker
is stale, start a new turn/session or restart Codex, then use the invocation above.

This installation does not authorize motion implementation. For Issue #33,
stop after the audit until the user explicitly selects recommendations.
Other skills named as possible handoffs by upstream are not installed or invoked.
