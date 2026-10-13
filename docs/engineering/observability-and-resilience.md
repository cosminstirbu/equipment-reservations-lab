# Observability and resilience

Applies to backend operations, external dependencies, and relevant client workflows.
Read with the constitution's telemetry privacy and repeat-safety rules.

## Instrument behavior

Required: use OpenTelemetry for traces, structured logs, and metrics. On .NET, prefer
`ActivitySource` for workflow spans, `ILogger` for logs, and `Meter` for measurements.
Use existing ASP.NET Core and HTTP client instrumentation before adding duplicate spans.
Propagate trace context across service calls and correlate logs where context exists.

Add business signals for reservation, approval, collection, and return outcomes alongside
request latency, errors, and dependency health. Keep metric dimensions bounded, such as
operation and outcome; do not use user IDs, equipment IDs, or raw URLs as dimensions.

Source: [.NET OpenTelemetry](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/observability-with-otel).

Required: exclude credentials, tokens, request bodies, and unapproved personal data from
all telemetry, including URLs, tags, exception details, and automatic instrumentation.
User/equipment identifiers are allowed for correlation in traces or logs under the
constitution. Browser instrumentation must follow the same privacy rules.

## Configure each dependency

Prefer `IHttpClientFactory` with `Microsoft.Extensions.Http.Resilience` for outbound HTTP.
Use one deliberately configured resilience pipeline; do not stack handlers accidentally.
The standard handler supplies timeouts, retries, and a circuit breaker, but its defaults
are not our policy. Disable unsafe-method retries with `DisableForUnsafeHttpMethods()`
until repeat safety is established; method names alone do not prove repeat safety.

Required: retry only transient failures, with bounded attempts, exponential backoff, and
jitter. Set an overall time budget and per-attempt timeout. Respect cancellation.
Do not retry business rejection or permanent errors. Record whether a circuit breaker
is warranted and its settings. Do not hedge side-effecting operations without an explicit
repeat-safety design.

Source: [HTTP resilience](https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience).

## Verify operational behavior

For each dependency, the plan must record timeouts, retryable failures, retry bounds,
repeat-safety guarantees, circuit-breaker choice, and failure signals. Prove relevant
behavior with controlled failure tests, including no duplicate effects on retries.

Check that representative workflows produce correlated telemetry and useful failure
signals. Verify handled exceptions remain observable in .NET 10. Select exporter,
retention, sampling, and dashboard configuration during planning; the Aspire dashboard
is the local inspection tool, not a production monitoring strategy.
