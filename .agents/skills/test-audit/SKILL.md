---
name: test-audit
description: This skill should be used when the user asks to "write a test", "review these tests", "audit tests", "prune low-value tests", or "find duplicate tests", and whenever writing, changing, reviewing, or sweeping tests. Gates new tests and audits low-value, implementation-coupled, or duplicative tests and the test-only production seams they demand.
---

# Test Audit

Adapted for Map Capital Cities from the upstream skill; see [NOTICE.md](NOTICE.md).
Use React/TypeScript Node/tsx units, Fastify injection, explicitly selected disposable
PostgreSQL and existing browser suites as appropriate. Follow `AGENTS.md` and
`docs/testing.md`; keep changes within the task, including production-code scope.

- Authoring gates every new/changed test.
- Audits: remove low-value proof in coherent owner batches; never chase deletion counts.
- Use the focused audit below; no campaign, extra agents, framework or harness is required.

## Authoring gate

Before adding test, answer:

1. Protected observable behavior, invariant, or independent contract?
2. Credible regression that makes it fail?
3. Why existing proof misses it? Each contract: one primary owner at strongest
   boundary. Another layer needs distinct transport/lifecycle risk. Extend
   tables/shared fixtures; consolidate repeated setup.
4. Export, flag, wrapper, injection hook with no production caller needed?
   Move proof to real boundary instead.

- Use the repository testing guide for boundary and cost decisions.
- Regressions must fail pre-fix for intended reason, pass after repair; report
  unavailable baseline proof.
- One owner regression covers bug; never replay at every crossed layer.
- Behavior-preserving refactors should not break test.

## Junk patterns

- Reject self-comparisons, copied inventories, source greps,
  implementation/call-shape assertions, duplicate contracts, test-only seams,
  subject-generated expected values, mocks supplying asserted behavior.
- Fixtures must not fabricate owner receipts/order or claim persistence path
  never writes.
- Negative controls must fail at intended guard; names must match exercised behavior.
- Auditing candidates: use [full checklist](references/audit.md#junk-patterns).

## Retention bar

- Keep independent API, SDK, protocol, config, migration, storage, security,
  platform, default, prompt-byte, generated-language, package, release,
  architecture, observable-ordering contracts. Static/slow ≠ disposable.
- Source inspection must survive identifier-only refactors and guard independent
  user-facing contract.
- Baseline failures may be bugs to repair, not tests to delete.

## Audit and validation

- Before audit edit: read [candidate evidence and workflow](references/audit.md#candidate-evidence);
  inspect full owners/callers/history; record remaining proof before deletion.
- Delete obsolete production seams with tests; never optimize for deletion counts.
- Follow the repository testing guide; preserve active test checkouts;
  run owner and sibling tests plus required checks, then review the full diff.
- Report causes, retained contracts, proof/cost, production versus test LOC,
  follow-ups. Commit/push/land only with task authority.
