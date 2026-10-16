# QUAL-006 — Frozen design review

**Verdict: pass.** No blocking or nonblocking findings identified.

**Feature:** `specs/006-identity-access`  
**Snapshot:** `36348a74a4a6ec000d87eb119e99c6d20f04f32866fb0a5f19536e1ccb2d95b2`  
**Manifest:** `team/design-manifest.json`  
**Application baseline:** `87bd4bc6964ed8dd75b8fdba8a227b530675b22d`

## Review scope and evidence

Reviewed the frozen spec, plan, research, data model, HTTP/identity/messaging contracts, quickstart and confirmed scope against the constitution and all applicable engineering guides. This evaluates the proposed design; it does not establish implementation correctness or runtime compatibility.

| Area | Assessment and evidence |
|---|---|
| Requirements coverage | Plan’s requirement mapping covers FR-001–019, including additive human roles, real-provider validation, own-only reservations/inbox and retained allocation/messaging guarantees. |
| Stable ownership | Shared framed issuer/subject hash, opaque-subject validation, owner-filtered queries and cancellation locking are specified. Global overlap exclusion remains independent of owner. Data model preserves transactional outbox and inbox deduplication. |
| HTTP boundaries | Contract distinguishes 401, 403 and concealed foreign/unknown 404. Forged body/query/header ownership is rejected. Human/service principal policies and API audiences are explicit. |
| Browser lifecycle | Memory-only credentials, callback cleanup, bounded token validity, session generations, stale-response rejection and no mutation replay implement confirmed scope. Provider logout failure is visible and retryable. |
| Service authentication | Dedicated Inventory-only client authority; independent browser authority; bounded acquisition/cache; no expired fallback; safe dependency failure before reservation/outbox mutation. |
| Provisioning and persistence | Finite privileged processes isolate administration credentials from workers. Ordinary provisioning preserves account subjects/passwords and durable application/broker state. Owner reset remains manual; checksum mismatch fails safely. |
| Broker restrictions | Exact runtime configure/write/read permissions, bootstrap-owned topology and independent allow/deny contracts are specified without changing confirms, acknowledgments, poison handling or recovery guarantees. |
| Test-first/public boundaries | Red/green recording is required per batch. Public HTTP behavior retains real internal collaborators and PostgreSQL. Faithful identity doubles have real-provider contracts; browser login uses actual code flow. No removal-only tests or private-state seams proposed. |
| Resilience | Discovery/JWKS, client credentials, Inventory and bootstrap dependencies have explicit budgets, retry/repeat-safety decisions, cancellation and breaker rationale. Rejections are not retried into success. |
| Observability | Official production HTTP instrumentation is selected for provider operations; actual production export, controlled failure, privacy and negative-registration evidence are required. Existing SQL/broker instrumentation and SQL admission remain applicable. |
| Engineering | Minimal APIs and existing architecture are retained. Known JSON/logging/configuration generation and diagnostic inspection are required. Applicable formatter, analyzer, Angular accessibility and manual review gates remain intact. |
| Governance | Preparation review, revision-matched checks, independent implementation reviews, convergence and separate final human acceptance remain pending gates. No constitutional exception or unauthorized external action is proposed. |

## Findings

None. No unresolved product questions identified.

## Remaining gates

Dependency/package compatibility and behavior claims require implementation evidence; the plan expressly preserves that obligation. Selected versions and preview integration are design selections, not validated runtime results.

Generate dependency-ordered tasks, then assign `$speckit-analyze` against the frozen spec/plan/tasks snapshot. The task analysis must check concrete coverage of red/green evidence, real-provider and broker contracts, authenticated browser/accessibility coverage, normal restart persistence, and production dependency telemetry/privacy.

**Changed files:** none.  
**Checks executed:** read-only artifact inspection only; no source checks, tests or write-producing skills.
