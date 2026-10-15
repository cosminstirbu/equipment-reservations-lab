# Engineering standards

These guides apply the [constitution](../../.specify/memory/constitution.md) to our stack.
Read the relevant guides during planning, implementation, and review. Feature plans must
list which guides apply and record decisions the guides deliberately leave open.

All source changes must follow [formatting and static analysis](formatting-and-linting.md), including suggestion-level .NET IDE diagnostics, per-edit formatting, and final quality checks.

## Approved stack

| Area | Technology | Guide |
| --- | --- | --- |
| Client | Angular | [Angular](angular.md) |
| Backend | ASP.NET Core | [ASP.NET Core](aspnet-core.md) |
| Local orchestration | .NET Aspire | [Aspire](aspire.md) |
| Database testing | Testcontainers | [Testing](testing.md) |
| Telemetry | OpenTelemetry | [Observability](observability.md) |

See [Resilience](resilience.md) for dependency timeouts, retries, and repeat safety.

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

The constitution takes precedence. Raise conflicts with the human owner. Changes to
required rules or the approved stack, and exceptions to required rules, need explicit
human-owner approval. Clarifications and example corrections follow ordinary review.
Upstream documentation changes do not automatically amend these standards.

Guides were checked against official documentation on 2026-10-13. Recheck version-sensitive
advice when selecting or upgrading dependencies; do not copy prerelease APIs into the
application merely because the latest documentation mentions them.
