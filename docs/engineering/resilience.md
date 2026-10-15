# Resilience

Applies to backend operations, external dependencies, and relevant client workflows.
Read with the constitution's repeat-safety rules and [observability](observability.md).

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
