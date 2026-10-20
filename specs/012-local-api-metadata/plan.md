# Implementation Plan: API metadata beside contracts and endpoints

**Branch**: `main` (feature selection: `012-local-api-metadata`) | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)

## Summary

Apply local metadata ownership across all eight documented business operations and five application schemas (33 properties). Add accurate prose without changing non-description contract structure or HTTP behavior. Place model/property descriptions on records, parameter descriptions on existing bound parameters, and operation corrections on their endpoint chains. Retain narrow shared framework-error/schema/security configuration.

## Technical Context

**Language/Version**: C# 14, .NET 10; pinned SDK 10.0.301.
**Primary Dependencies**: Existing Microsoft.AspNetCore.OpenApi 10.0.13, Microsoft.OpenApi 2.12.2, Scalar.AspNetCore 2.18.0; existing locked Spectral packages unchanged.
**Storage**: Existing PostgreSQL; no schema or persistence changes.
**Testing**: xUnit v3/Microsoft Testing Platform, WebApplicationFactory and isolated Testcontainers PostgreSQL; existing identity/provider fixtures retained.
**Target Platform**: Existing ASP.NET Core services and Development documentation routes.
**Project Type**: Three HTTP APIs with shared documentation support.
**Performance Goals**: No request execution change or new dependency; startup/document generation retains current lifecycle.
**Constraints**: Preserve all non-description document fields and request processing. No validation attributes, binding/type changes, enums, formats, routes or new operations solely for documentation.
**Scale/Scope**: Eight operations, five application models/33 properties, shared ProblemDetails model/standard properties/extensions, three path and three query parameters, one documented request body and one response header. See [coverage matrix](contracts/coverage.md).

## Constitution Check

Pre-research and post-design assessment: compliant design; independent verdicts remain reviewer-owned.

- I: Built-in attributes and local endpoint transformers; no new documentation DSL, module framework or dependencies. Description attributes are consumer documentation metadata, not redundant source comments.
- II–IV: Add failing HTTP-generated description assertions before adding prose. Preserve existing shape/behavior expectations. Test design record below defines boundary and meaningful regressions.
- V–VI: Existing telemetry, exporters/dashboard and all dependency timeouts/retry/circuit policies unchanged; no new dependency calls or instrumentation. Documentation-only metadata must contain no credentials, tokens or personal examples.
- Governance: Approved OpenAPI guide amendment is input, not a policy change in this feature. No exception approval needed. Required independent quality/security reviews, convergence and explicit human acceptance remain pending until executed.

Applicable guides: [OpenAPI](../../docs/engineering/openapi.md), [ASP.NET Core](../../docs/engineering/aspnet-core.md), [Testing](../../docs/engineering/testing.md), [Formatting](../../docs/engineering/formatting-and-linting.md), and their required [Observability](../../docs/engineering/observability.md), [Resilience](../../docs/engineering/resilience.md), [Aspire](../../docs/engineering/aspire.md) references. No AppHost changes or lifecycle operations are planned.

## Design and ownership

1. Add `System.ComponentModel.Description` to each exposed record and each positional property (`property:` target). EquipmentItem remains in EquipmentStore.cs unless ordinary readability warrants relocation; no persistence model redesign. Describe only already public fields.
2. Preserve existing endpoint chains, operation IDs/tags/status declarations and DescribeBusinessOperation helper. Expand useful operation prose at its call sites. Add Description attributes to existing string path parameters. Do not bind the manually read availability query/body to new parameters.
3. Attach `AddOpenApiOperationTransformer` on owning endpoints for response prose, manual query definitions, creation body prose/Location header and write403 variants. Prefer supported declarative response descriptions if they preserve current generated shape; local transformers are the bounded fallback. Existing shared helper can own common empty401/403 descriptions but must not become a configuration DSL or operation-ID switch.
4. Reduce ReservationDocumentation to a named narrow ReservationInput schema correction: retain required equipmentId/startAt/endAt, non-null string schemas and additionalProperties=false. Remove operation transformer dispatch and property-description overrides. Nullable storage types/custom validation deliberately remain unchanged; retain explicit correction rather than introducing Required or other runtime validation metadata.
5. Shared ApiDocumentation schema transformer owns ProblemDetails model and standard type/title/status/detail/instance prose plus code/field extension prose because framework declarations are not application-owned. Do not change optionality, types or extension semantics. Shared OAuth/server/security document configuration stays unchanged, including Inventory service-bearer dispatch; it is shared security configuration rather than relocated reservation operation prose.
6. Add type-level descriptions through supported record metadata. If generation does not surface type-level Description on the pinned framework, prove the gap with the HTTP test and read that same attribute through a narrow schema bridge; do not duplicate prose in global dictionaries. This is a documented fallback, not permission for broad reflection-based schema replacement.

## Trust boundaries and trade-offs

Public descriptions expose only contract meaning and approved access requirements. Framework-owned errors require a central correction; manually validated requests require strict valid-input schema correction despite nullable input storage. Moving ownership must not change identity/ownership enforcement, browser guards, operational-route exclusion or Development-only exposure. Preserve both empty authorization denial and optional browser-write Problem Details content variants. No sample identity values, persistence internals, SQL, broker models or credentials are added.

Small endpoint callbacks repeat a little response prose but keep ownership visible; avoid a giant reusable options model. Source review establishes placement, because HTTP tests intentionally do not assert internal extension names or file layout.

## Test design and review record

Extend existing `/openapi/v1.json` HTTP tests via tests/TestSupport/OpenApiAssertions.cs rather than create standalone metadata reflection tests. Real production routing, source-generated serialization, endpoint metadata, OpenAPI generation, authentication middleware and document transformers remain active; isolated migrated PostgreSQL uses existing fixtures. Existing identity authority/test hosting boundaries and provider fidelity contracts are retained without adding doubles. No solitary tests are planned.

Assert descriptions for the exact five public application models and ProblemDetails, every declared property, all eight operations, their parameters/responses, present request bodies and documented headers. Coverage assertions check nonempty prose without freezing wording. Keep targeted semantic assertions for meaningful distinctions (nullable cancellation lifecycle, advisory availability, timestamp constraints and empty authorization versus browser403) where existing assertions are insufficient. A missing description on a required public field or operation must fail through the real generated document; retain red result before implementation. Existing status/schema/requiredness/nullability/security/visibility expectations remain unchanged and full application tests guard HTTP outcomes.

Optionally capture baseline generated documents in temporary untracked files and compare after recursively excluding description fields to strengthen structural preservation evidence; do not add a saved-schema compatibility framework or committed exports. Description coverage and source review do not alone prove unchanged shape.

Verification: focused `npm run check:openapi`, then required `npm run format-check`, `npm run lint`, `npm run check`, whitespace/link/readability inspection. Inspect API metadata placement and factual prose manually. No new UI/login behavior; existing browser smoke evidence is historical, not newly claimed runtime evidence. If presentation rendering is manually inspected, record actual observations only.

## Project Structure

Feature artifacts: plan.md, research.md, data-model.md, contracts/coverage.md, quickstart.md; tasks.md generated only after preparation review.

Owned application scope for later implementation: src/Inventory/EquipmentStore.cs and Program.cs; src/Reservations/ReservationContracts.cs, ReservationEndpoints.cs, ReservationDocumentation.cs; src/Notifications/NotificationContracts.cs and Program.cs; src/ApiDocumentation/ApiDocumentationExtensions.cs; tests/TestSupport/OpenApiAssertions.cs and existing service OpenApiTests.cs only as needed. No frontend, AppHost, identity, dependency, CI or Kubernetes changes.

## Complexity Tracking

No constitutional exceptions or added architectural layers. Narrow inference gaps and their rationale are recorded above.
