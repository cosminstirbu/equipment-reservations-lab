# Engineering standards

These guides define concrete engineering practices under the
[constitution's artifact ownership and governance rules](../../.specify/memory/constitution.md#governance).
Use this index to select required reading; follow the selected guides' required
cross-references. The routing table is cumulative: read every row that applies.

## Required reading by task

| Task or changed area | Required guide |
| --- | --- |
| Any source, test, or tooling/configuration work, including review | [Formatting and static analysis](formatting-and-linting.md) |
| Add, change, or review tests; investigate or increase coverage | [Testing](testing.md) |
| Scripts or test helpers, process execution, operational HTTP calls, output capture, or resource cleanup | [Tool output and operational failures](tooling.md) |
| Backend behavior, contracts, serialization, logging, or source generation | [ASP.NET Core](aspnet-core.md) |
| Application HTTP API contracts, generated documentation, or interactive API testing | [OpenAPI](openapi.md) |
| Client behavior, components, templates, accessibility, or browser interaction | [Angular](angular.md) |
| Traces, logs, metrics, correlation, or telemetry privacy | [Observability](observability.md) |
| Dependency calls, messaging, timeouts, cancellation, retries, or recovery | [Resilience](resilience.md), [Observability](observability.md), and [Testing](testing.md) |
| AppHost wiring or local orchestration | [Aspire](aspire.md) |
| Change instructions, standards, or policy | [Constitution governance](../../.specify/memory/constitution.md#governance) and the guide that owns the affected requirement |

Apply the same routing during planning, implementation, and review. Feature plans list
the applicable guides and record decisions they leave open. For ordinary work, use the
existing task response or review record; a new feature-team loop is not implied.

## Approved stack

| Area | Technology | Guide |
| --- | --- | --- |
| Client | Angular | [Angular](angular.md) |
| Backend | ASP.NET Core | [ASP.NET Core](aspnet-core.md) |
| Local orchestration | .NET Aspire | [Aspire](aspire.md) |
| Backend testing | xUnit v3, Microsoft Testing Platform, Testcontainers | [Testing](testing.md) |
| Telemetry | OpenTelemetry | [Observability](observability.md) |

See [Resilience](resilience.md) for dependency timeouts, retries, and repeat safety.
For flaky backend tests and fixture reviews, use the testing guide's
[lifecycle diagnosis and verification guidance](testing.md#diagnose-backend-flakes-at-the-lifecycle-boundary).

Use .NET 10 LTS and C# 14 as the recommended backend baseline. As of 2026-10-13,
.NET 10 is the latest stable .NET release; .NET 11 is a prerelease. Keep supported
patches current and pin the SDK at application setup. Select compatible Angular,
Node.js, and Aspire versions during planning and record them in project configuration.
The database engine, hosting platform, and telemetry backend remain planning decisions.

Source: [Microsoft support policy](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core).

## How to read and change these guides

- **Required rules** use “must” and are review criteria.
- **Defaults** use “prefer” and allow an alternative with a rationale in the feature plan.
- Examples illustrate an approach; they do not prescribe application architecture.

Use the constitution's [amendment and exception procedure](../../.specify/memory/constitution.md#governance)
when changing mandatory rules or the approved stack. Keep each concrete rule in its
owning guide and update this index when its discovery conditions change. Clarifications
and example corrections follow ordinary review. Upstream documentation changes do not
automatically amend these standards.

Guides were checked against official documentation on 2026-10-13. Recheck version-sensitive
advice when selecting or upgrading dependencies; do not copy prerelease APIs into the
application merely because the latest documentation mentions them.
