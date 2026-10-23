# Operational harness security review

Reviewer: security_reviewer. Date: 2026-10-23. Scope: disposable
.cache/remote-kustomize-live.mjs; this is not product implementation approval.

## Initial verdict (verbatim)

Harness review: **changes requested** before execution.

The removal inventory stays within authorized Argo resources and preserves namespaces, CRDs, Secrets and application storage. Forwarding, TLS checks and private output handling are appropriately bounded.

Blocking issue: the top-level catch discards safe actionable failure metadata. Preserve the existing `safeFailure` projection alongside the phase, including available process and HTTP failure details.

Also establish recovery instructions if replacement fails after removing the Application. No files changed or live actions performed.

## Original reviewer closure (verbatim)

HARNESS CLOSURE: pass / safe-to-run scoped preflight and execute (execute contingent on your current source/static readiness). Original blocking diagnostics finding CLOSED: catch preserves trusted OperationalFailure via safeFailure and HTTP includes fixed category/status/duration without raw payload/error. Recovery concern CLOSED: exact captured seven Argo workloads + AppProject/Application restored, controller held0 then resumed, all attempts reported and failed exit retained, private desired-state file retained only on incomplete rollback. Destructive boundary still exact namespace/name inventory, no CRD/namespace/storage/Secret deletion; sentinel ownership precedes PUT to cover uncertain result. Read-only source review, no executions/writes. This is authorization-scope security review of scratch harness only, not final product approval or acceptance.

## Parser follow-up (verbatim)

Parser-only scratch followup reviewed: existing spectral parser, reject error diagnostics and exactly1 Application/1 AppProject across2 docs, JSON-as-YAML serialization; no scope/privacy change. Harness safe-to-run verdict remains PASS, original diagnostics finding CLOSED and recovery concern resolved. No execution by reviewer.
