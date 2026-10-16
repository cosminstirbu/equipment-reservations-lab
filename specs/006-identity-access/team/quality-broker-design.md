# QUAL-006 — Broker provisioning design and task re-review

**Verdict: pass.** Quality review approves closure of **DESIGN-006-001 at the design/task level**. Security closure remains independently owned; implementation is not approved by this report.

**Feature:** `specs/006-identity-access`  
**Frozen snapshot:** `183ff764d6cbc017c8f683b4c46781dc0ab994172656f8e495dfd4ddcafce4a0`  
**Manifest:** `team/broker-design-manifest.json`

## Scope and evidence

Reviewed amended plan, research, messaging contract, quickstart and tasks against feature 006 requirements, confirmed scope, constitution, applicable engineering rules, feature 005 FR-005–007/SC-004–005 and both requirements-compatibility reports.

Verified all eleven manifest hashes with zero mismatches. Tasks retain **42 IDs and 18 completed markers**. Prior review reports remain historical evidence; this review supersedes their broker-provisioning assessment only.

## Finding disposition

| ID | Category | Severity | Blocking | Owner | Disposition |
|---|---|---|---|---|---|
| DESIGN-006-001 | Design | High | Yes until required independent closure | Architecture | Quality closure approved for this snapshot. |

**Original defect:** unconditional broker management-HTTP provisioning required an administrative listener outside the Development-only boundary preserved by feature 005.

**Closure evidence:** Plan §Provisioning and Broker and messaging contract §Boot definitions and lifecycle replace that dependency with core definitions import through run-mode container-file preparation. Management image/plugin/listener remain Development-only; other run environments and publish output retain the ordinary image with no administrative HTTP endpoint. T020–T022 explicitly implement and verify these boundaries.

## Consistency and sufficiency

| Area | Assessment |
|---|---|
| Scope compatibility | Core import changes provisioning mechanics while retaining FR-011 permission outcomes and FR-015 administration boundaries. Local-only provisioning makes no production deployment claim. |
| Privileged access | Existing administrator/default vhost are explicitly included; application workers retain only their dedicated credentials and exact ACLs. No administrator fallback is permitted. |
| Persistence | Persisted independent salt material makes unchanged credentials produce stable definitions. Import behavior distinguishes named-user/grant updates from preserved existing topology and unrelated state. No deletion or global drift-reconciliation promise is introduced. |
| File privacy | Generated named JSON contracts, protected file/directory ownership and modes, no application-created host artifacts, and explicit Aspire staging inspection are specified. Hashes remain sensitive. |
| Readiness/resilience | Local preparation and import/readiness have bounded budgets. Invalid import, wrong credentials or unusable topology block workers without granting configure rights or publishing probe messages. |
| Telemetry | T035 accurately targets remaining HTTP dependencies and safe local preparation/import-readiness outcomes. Native broker-worker dependency tracing remains required; nonexistent broker admin-HTTP spans are no longer promised. |
| Task coverage | T019 supplies test-first import/ACL/restart/failure contracts; T020 implements builder/import semantics; T021 handles runtime injection/readiness and deployment exclusion; T022 validates effective boundaries; T035 covers failure/privacy observability. |
| History | T002 remains completed, with T020 explicitly repurposing its project skeleton. Existing IDs, bounded batches and independent completion gates are preserved. |

## Source/API evidence limits

Research identifies pinned RabbitMQ importer/backend/schema sources and installed Aspire API documentation. It distinguishes the mutable official image-source reference from verification of the actual pinned image and does not claim secure staging erasure.

These are adequate design inputs. Actual callback lifecycle, image account identity, effective file/staging permissions, core import behavior, runtime ACLs and publish exclusion remain required implementation evidence under T019–T022. This review neither reran those checks nor approved their results.

## Findings

No additional findings or unresolved product questions identified.

Proceed with the amended bounded implementation after the separately required security verdict. Preserve independent implementation review and revision-matched validation.

**Changed files:** none.  
**Checks executed:** read-only artifact inspection, manifest hash verification and task ID/completed-marker counts.  
**Tests or dotnet commands executed:** none.
