# Proposed test-first exception: DQ-P001

**Status: approved by the human owner on 2026-10-22.** Exact reply:
“I approve the scoped test-first exception”. Recorded as EX-013-003 in
[exceptions.json](exceptions.json). Original quality-reviewer validation is required
before closing DQ-P001. Scope: this diagnostics batch in feature 013 only.

The coordinator and coders missed the required intended-behavior red sequence for
the following six contracts. Setup failures and a parent-smoke provider-fixture
failure were initially mistaken for useful regression evidence; the records now
correct that inference. Some other protections were added during inspection before
their specific tests. No historical ordering is reconstructed or claimed.

| Contract | Affected area |
| --- | --- |
| Both stdout and stderr visible before process exit | scripts/process.mjs and process.test.mjs |
| Independent 4000-character failure tails and truncation, including quiet formatter integration | process.mjs, quality.mjs and their tests |
| Malformed private smoke HTTP JSON produces safe diagnostic without raw body/cause | deployment-smoke.mjs and deployment-smoke.test.mjs |
| Malformed default OCI inspector JSON produces safe diagnostic without raw provider output/cause | deployment-validation.mjs and deployment-validation.test.mjs |
| CI Job status projection retains validated original process metadata | deployment-ci.mjs and deployment-ci.test.mjs |
| Parent smoke command propagates sanitized child stdout/stderr and HTTP phase/status | local-kubernetes.mjs and local-kubernetes.test.mjs |

**Proposed rationale:** the original sequence cannot be recovered honestly.
Current real-process/CLI and malformed-payload regressions pass, code findings are
independently closed, and privacy/cleanup security review passes. Retain this
transparent evidence and accept only the historical sequencing deviation for these
six contracts. Passing tests are current correctness evidence, not proof of the
missing original red sequence.

**Exclusions:** no general relaxation of Constitution II, no waiver for future or
unlisted fixes, no correctness/privacy/security waiver, no unavailable-test waiver,
no feature acceptance, and no commit/push/workflow/publication authorization. The
remaining deployment/runtime/release/human gates stay pending. If approved, the
coordinator must record the exact owner decision, rationale, scope and date and
request original quality-reviewer validation before closing DQ-P001 or task gates.

Authority: [Constitution II](../../../.specify/memory/constitution.md#ii-test-first-development)
and [governance](../../../.specify/memory/constitution.md#governance).
Evidence: [implementation chronology](diagnostics-implementation.md),
[quality addendum](diagnostics-quality-03.md), and
[verification](diagnostics-verification.md).
