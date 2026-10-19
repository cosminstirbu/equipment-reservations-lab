# Observability

Applies to backend operations, external dependencies, and relevant client workflows.
Read with the constitution's [telemetry policy](../../.specify/memory/constitution.md#v-correlated-observability)
and [resilience](resilience.md).

## Instrument behavior

Required: use OpenTelemetry for traces, structured logs, and metrics. On .NET, prefer
`ActivitySource` for workflow spans, `ILogger` for logs, and `Meter` for measurements.
Use existing ASP.NET Core and HTTP client instrumentation before adding duplicate spans.
Propagate trace context across service calls and correlate logs where context exists.

Add business signals for reservation, approval, collection, and return outcomes alongside
request latency, errors, and dependency health. Keep metric dimensions bounded, such as
operation and outcome. Inspect labels from automatic instrumentation as well as custom
metrics against the constitutional cardinality constraint. Use bounded operation names
or route templates rather than raw URLs as metric dimensions.

Source: [.NET OpenTelemetry](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/observability-with-otel).

Apply the constitutional privacy policy to URLs, tags, exception details, and automatic
instrumentation on both server and browser. Review the actual exported fields; configuring
a safe custom log message does not establish that automatic instrumentation is safe.

## Instrument every external dependency

Required: when adding or changing an external dependency, explicitly configure and
verify its telemetry. This includes databases, HTTP services, message brokers, object
storage, and other external systems. Adding an Aspire resource, a connection string,
or a client library does not establish that dependency spans are collected or exported.
Workflow spans and dependency metrics alone do not establish operation-level tracing.

Required: before implementing custom dependency instrumentation, research the official
OpenTelemetry integration maintained by the dependency's client/vendor or the
OpenTelemetry project. Include a suitable supported dependency-specific library/package
and use its documented production registration API. Use its supported configuration and
extension points before writing custom instrumentation. Native client instrumentation
remains the source of dependency spans where available; do not duplicate those spans.

Official instrumentation must still meet our coverage, correlation, and privacy rules.
Add custom code only for documented gaps, such as SQL admission or exception redaction
that the integration cannot provide. Record why the official integration is insufficient
or unavailable and why the custom code is necessary; the presence of an official package
does not by itself establish safe telemetry.

For each dependency, the feature plan must record:

- The official integrations evaluated, their compatibility with the selected client
  version, and the chosen library/package, activity sources, and documented production
  registration API. Identify any required custom code, the specific gap it addresses,
  and why supported configuration or extension points do not suffice.
- The operations expected to produce spans, including database queries/writes and
  message publication/consumption where applicable. Preserve parent/child trace context
  for synchronous calls; document context propagation and parent/link relationships for
  asynchronous delivery and retries.
- The useful diagnostic attributes and signals: dependency/operation identity, duration,
  outcome, and failure information. Inspect automatic attributes, span names, and exception
  events under the telemetry privacy rules. Do not export credentials, connection strings,
  SQL parameter values, message bodies, or raw exception details containing forbidden data.
- The tests and runtime evidence that will establish successful operation, controlled
  failure, trace correlation, and privacy. Unsupported instrumentation or deliberately
  omitted operations require a documented limitation and explicit owner approval.

## Verify telemetry

Check that representative workflows produce correlated telemetry and useful failure
signals. Verify handled exceptions remain observable in .NET 10. Select exporter,
retention, sampling, and dashboard configuration during planning; the Aspire dashboard
is the local inspection tool, not a production monitoring strategy.

Required: exercise each new or changed dependency against the real external system and
capture exported spans through the application's production OpenTelemetry registration.
Tests may add an in-memory exporter, but must not independently subscribe to activity
sources or add instrumentation missing from production. A separate `ActivityListener`
can activate otherwise uncollected activities and therefore cannot prove production
tracing works.

Assert that representative dependency operations produce spans with the expected
workflow trace relationships, useful timing/outcome information, and safe attributes.
Include a controlled failure and inspect exported exception events as well as tags.
The test must fail when the required production instrumentation registration is removed.

Before accepting the change, inspect a representative Aspire trace containing the
dependency operations and record the trace/test evidence and any approved limitations.
Reviewers must check each dependency against the plan's expected spans; passing workflow
tests, aggregate metrics, or the presence of some spans is insufficient evidence of
dependency tracing. Reviewers must also verify that suitable official integrations were
used before custom instrumentation and that any remaining custom code has a documented
purpose the integration does not cover.
