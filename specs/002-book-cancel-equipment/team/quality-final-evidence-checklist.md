Final evidence checklist prepared from approved artifacts and prior reviews. These are expected Batch 5 deliverables, not new findings or approval.

Every entry must identify the final frozen source hash, command/action, environment, actual result and supporting report/test. Earlier batch evidence supplies traceability; affected checks must be current.

| Criterion | Required final evidence |
|---|---|
| SC-001 | T039/T040: documented fresh startup provisions databases/migrations/seeds; repeat startup preserves edited data without duplicate seeds. |
| SC-002 | Persistent Confirmed booking with stable ID/UTC interval after Reservations restart. |
| SC-003 | Invalid dates/offsets/precision, unknown/non-operational item: safe rejection and zero reservation/outbox effects. |
| SC-004 | Real production-schema overlap cases reject without modifying existing allocation. |
| SC-005 | Both adjacent boundaries and different-item bookings succeed. |
| SC-006 | Controlled concurrent public requests yield one success, one conflict and one reservation/event. |
| SC-007 | Stale available result cannot bypass subsequent allocation conflict. |
| SC-008 | Cancelled history survives restart; released interval rebooks successfully. |
| SC-009 | Repeated/concurrent cancellation retains one stable transition/event/inbox entry, including repeat after original start. |
| SC-010 | Controlled before/exactly-at/after-start cancellation boundary with zero effects on rejection. |
| SC-011 | T039: service and ordinary AppHost/broker restart preserve equipment, reservations, pending events and inbox; actual persistent-volume evidence. |
| SC-012 | Real broker/consumer outage recovery, duplicate delivery and publication/ACK crash windows; permanent faults require documented repair without loss/false success. |
| SC-013 | Inventory unavailable/timeout/unusable response produces safe dependency error and zero committed effects. |
| SC-014 | T038/T041: real browser complete journey and failure states, browser axe, native keyboard/focus/status review, timezone/DST evidence. |
| SC-015 | Preserved hello API/broker/browser journey; intentional seed/navigation changes documented with equivalent checks. |
| SC-016 | T042/T046: actual loopback sockets/mappings, own-role negative connections, secret/dependency audits, hostile-browser zero effects and legitimate proxy journey. |
| SC-017 | T037/T042: correlated booking/cancel/conflict/outage traces and structured logs; outcome/latency/pending-age/dependency metrics; captured evidence excludes forbidden data and identifier labels. |
| SC-018 | T044: independent source/artifact/UI scope review confirms exclusions and no unauthorized external actions. |

Remaining task evidence:

- **T037:** telemetry-specific intended reds before remaining new instrumentation; useful gauges/signals and correlation/privacy assertions.
- **T038:** actual browser journey/state/keyboard/axe results on final AppHost.
- **T039:** actual orchestration restart/persistent-volume acceptance checks.
- **T040:** verified README/quickstart, exact secrets setup and volume/reset instructions.
- **T041:** native accessibility report covering booking, history, cancellation, inbox and preserved hello. Original reviewer closes PRE-Q-001/legacy Q-001 through a new revision-matched report; historical reports remain unchanged.
- **T042:** exposure, privilege, secrets, dependencies and captured telemetry inspections.
- **T043:** final format-check/lint/check/browser results, counts, skips and warnings.
- **T044:** frozen independent quality/security verdicts, latest convergence with no gaps, complete task history and acceptance mapping.
- **T046:** real hostile-page browser submissions demonstrate server rejection and unchanged durable state; original security reviewer closes SEC-001.

Final completion requires explicit human feature acceptance of the reviewable result. The T008 exception remains narrowly scoped and recorded; it does not supply acceptance or waive other gates.

No files changed, source WIP reviewed or checks executed.
