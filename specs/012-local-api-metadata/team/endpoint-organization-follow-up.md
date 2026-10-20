# Endpoint organization follow-up

Date: 2026-10-20. Scope: behavior-preserving organization of all eight business
endpoints across Inventory, Reservations, and Notifications, following acceptance of
feature 012. The owner requested this experiment directly, outside the feature-team
workflow, and subsequently authorized the engineering guidance and this reconciliation.

## Current ownership

| API | Endpoint registration, operation metadata, and named handlers |
| --- | --- |
| Inventory | [EquipmentEndpoints.cs](../../../src/Inventory/EquipmentEndpoints.cs) |
| Reservations | [ReservationEndpoints.cs](../../../src/Reservations/ReservationEndpoints.cs) |
| Notifications | [NotificationEndpoints.cs](../../../src/Notifications/NotificationEndpoints.cs) |

Each API's `Program.cs` now calls its endpoint registration extension method.
Focused operation mapping methods retain the route and its OpenAPI metadata; named
handler parameters retain parameter attributes. Request/response contract metadata,
shared documentation configuration, and the narrow reservation schema correction
remain with their existing owners. The original plan and completed task paths describe
the implementation at acceptance; this note records their subsequent relocation.

The owner-approved [endpoint organization rules](../../../docs/engineering/aspnet-core.md#endpoint-organization)
are authoritative for future work. The [OpenAPI guide](../../../docs/engineering/openapi.md#keep-metadata-with-contracts-and-endpoints)
and [handoff guidance](../../../docs/engineering/formatting-and-linting.md#required-checks-for-handoff)
link to them. No product requirement, public contract, data model, or Spec Kit template
change was needed.

## Author verification

Existing behavior expectations and tests were retained without changes. Author inspection
compared the extracted handler logic and operation metadata with the original source,
including parameter descriptions, validation, authorization, responses, cancellation,
request budgets, and telemetry. No new dependencies or framework were introduced.

An intermediate test run exposed a trailing slash in the exported reservation route
template when mapping an empty child route. Group prefixes and child patterns were
adjusted to retain the original route templates; the existing telemetry regression test
then passed. This was a corrected regression, not an accepted deviation.

Final source checks, before the subsequent Markdown-only guidance and reconciliation:

- `npm run format-check` and `npm run lint`: exit 0.
- `npm run check`: exit 0; tooling 19/19, frontend 60/60, backend 513/513,
  zero skipped. This includes the three APIs' existing HTTP, OpenAPI, and telemetry tests.
- `git diff --check`: exit 0; documentation links, anchors, consistency, and readability
  were inspected separately after the documentation edits.

Tests used the running Podman socket through `DOCKER_HOST` and the documented rootless
`TESTCONTAINERS_RYUK_DISABLED=true` setting, with real isolated PostgreSQL, RabbitMQ,
and Keycloak. The full check output is temporarily available at
`/tmp/api-endpoints-final-check.log`; that local file is not a durable repository artifact.
No new browser smoke test or manual AppHost verification is claimed.

Verified source fingerprint:
`a8552e258410d2d75390e8a4cc7161d13d0e4eb8a6d827fff9adcb0b4860f6d8`.
This is SHA-256 over the six API files (the three endpoint files linked above and
each API's `Program.cs`), sorted by repository-relative path, concatenating UTF-8
path, a NUL byte, file bytes, and a NUL byte for each file. Documentation is outside
this source fingerprint.

## Historical evidence and review scope

The original [acceptance](acceptance.md), [implementation snapshot](implementation-snapshot.json),
review reports, convergence assessment, run state, and completed tasks remain unchanged.
They cover accepted snapshot
`610090abe4fed9c1710b342499df20c4d3d3ad3da58d690fff52e75c712a65d3`.
Their source-hash and completion statements are historical claims about that snapshot,
not claims that the current working tree still matches it.

This follow-up has author verification only. It does not extend the prior independent
quality/security verdicts or human feature acceptance to the refactor, and does not
claim a new team convergence assessment. The owner retains the decision whether to
keep the experiment or repeat it through the team workflow. No feature-team status
was reopened or self-approved through this reconciliation.
