Security preparation review — `prep-design-0`

**Verdict: pass for requirements and design.** No confirmed vulnerabilities, blocking findings, unresolved security questions, or requested policy exceptions. Tasks and implementation remain unreviewed.

Reviewed `spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, and `contracts/retirement.md` against source baseline `5cfd6233e9d466e9a525f2fe18a30d1aa90015f7`, constitution 1.1.0, team protocol, and applicable engineering guides.

The design preserves booking assets and trust boundaries: browser/API admission, bounded input and equipment validation, Inventory HTTP responses, PostgreSQL transactions/outbox, broker envelopes, notification inbox deduplication, and exported telemetry. It removes hello handlers, transient state, workers, topology declarations, and telemetry without expanding authentication or tenant scope.

Security-critical preservation is explicit:

- Same browser-write protections, local exposure, bounded inputs, safe errors, and dependency budgets.
- Unchanged reservation wire contracts, event validation, strict trace headers, persistent delivery, confirms, manual settlement, and repeat safety.
- Unchanged database/HTTP production instrumentation and privacy processors, with safe bounded metrics and representative failure/recovery evidence.
- Exact secret-store identity and existing persisted data retained; no broker purge/delete or developer-state manipulation.
- Isolated legacy-resource fixtures may establish preservation without making old resources active production interfaces.
- Removed endpoints receive direct plain/local negative tests, independently of shared host-level protections.

Required implementation evidence is adequately defined: baseline failing removal assertions, booking-based security/privacy/broker regression coverage, complete quality checks, browser/axe checks, representative Aspire traces, residual-name audit, historical-evidence comparison, and revision-matched independent review.

**Changed files:** none.
**Checks performed:** read-only artifact/source review; no commands exercising running services, tests, or intrusive probes.
**Next gate:** review generated tasks, then independently review the frozen implementation and its current-revision evidence.
