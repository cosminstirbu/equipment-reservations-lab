# Research: Database Operation Tracing

Research date: 2026-10-15; baseline `6241fb1495412274b3de3242d7ec3eb36f9ee4b6`. Planning unknowns resolved; implementation verification pending.

## Supported native tracing

**Decision — authorized delta 2026-10-15**: Retain Npgsql 10.0.3 and add `Npgsql.OpenTelemetry` 10.0.3 to ServiceDefaults, using documented `.AddNpgsql()`. This supersedes the original direct `.AddSource("Npgsql")` choice. Preserve historical review/test reports rather than treating them as validation of this delta.

**Rationale**: Driver already emits command Client activities and physical connection spans. The owner explicitly selected the documented registration surface. The pinned adapter delegates solely to `.AddSource("Npgsql")`; it adds no alternate provider, sampler, processor, enrichment or sanitization. Existing source-purpose policy, reviewed SQL catalog, exception recorder, pre-export normalization and bounded bootstrap drain remain necessary and unchanged. Text commands otherwise use a generic name; internal transaction wire messages are not promised distinct spans.

**Alternatives**: Direct AddSource remains technically equivalent but is superseded by the owner’s documented-API preference. Do not retain both registration calls or alter privacy controls. Custom command wrappers duplicate supported instrumentation; workflow metrics cannot establish command tracing.

Sources: [Npgsql guide](https://www.npgsql.org/doc/diagnostics/tracing.html), [pinned 10.0.3 ActivitySource](https://github.com/npgsql/npgsql/blob/v10.0.3/src/Npgsql/NpgsqlActivitySource.cs), [command lifecycle](https://github.com/npgsql/npgsql/blob/v10.0.3/src/Npgsql/NpgsqlCommand.cs).

Delta source: [pinned Npgsql.OpenTelemetry 10.0.3 AddNpgsql implementation](https://github.com/npgsql/npgsql/blob/v10.0.3/src/Npgsql.OpenTelemetry/TracerProviderBuilderExtensions.cs). Add the package only to the shared registration owner; restore affected committed lockfiles and confirm existing pinned Npgsql/OpenTelemetry versions remain compatible and unchanged. Repeat the isolated registration-removal mutation against `.AddNpgsql()` and existing behavior/privacy tests. An implementation-mirroring test of the extension’s one-line body is unnecessary.

### Physical connection name export boundary

Native Npgsql physical connection activities set immutable `OperationName` to `CONNECT ` plus the configured database or inferred user. No supported callback replaces that internal property. Preserve the actual database selection, including isolated test database names; never switch databases for telemetry naming. The pinned OTLP exporter 1.19.1 serializes `Activity.DisplayName` as the span name and does not serialize `OperationName`: [WriteSpan, line 248](https://github.com/open-telemetry/opentelemetry-dotnet/blob/core-1.19.1/src/OpenTelemetry.Exporter.OpenTelemetryProtocol/Implementation/Serializer/ProtobufOtlpTraceSerializer.cs#L248), matching installed NuGet repository commit `5fbeba3a3d8bbd4f4235170ddeb6329fe0b8b86e`.

Normalize exported DisplayName and approved attributes before export. A capture exporter must snapshot that exported name; recording internal OperationName as though it were an additional transmitted field would assert a different contract. Internal diagnostic observation can remain separate from the exported privacy scan. This is an exporter-boundary clarification, not approval to emit arbitrary database identity or change the specification. Any future exporter requires checking its actual serialization fields.

## SQL and source identity

**Decision**: Per-source exact reviewed templates, shared executing SQL constants, explicit embedded-migration content approval, fixed source/database names; administrative source purpose always prevents SQL text.

**Rationale**: Bootstrap interpolates password literals in ALTER ROLE. Disabled parameter logging cannot redact literals. Source/connection-derived identity is not presumed safe. Whole-template admission fails closed; changed content requires review. Bootstrap administrative SQL and bootstrap service migrations have different policy under FR-008.

**Alternatives**: All SQL on leaks; all off violates owner choice; regex/placeholder heuristics are unsound; automatic trust in every embedded migration bypasses review; blanket bootstrap text-off suppresses approved migration text unnecessarily.

Source: [pinned tracing callbacks](https://github.com/npgsql/npgsql/blob/v10.0.3/src/Npgsql/NpgsqlTracingOptionsBuilder.cs). Local construction inventory: ServiceDefaults one site; DatabaseProvisioner three sites. All must use the policy, including per-service migration sources.

## Exception privacy

**Decision**: Production non-sampling Npgsql `ActivityListener.ExceptionRecorder` sanitizes event fields before creation; end processor normalizes names/tags/status before all exporters.

**Rationale**: Npgsql calls `Activity.AddException`, and raw message/exception.ToString can contain forbidden data. Non-Postgres status description can also contain a message. Supported Activity processor APIs cannot remove event collections. .NET10 ExceptionRecorder receives mutable ref TagList; prepopulate safe type/message/stack to prevent raw defaults. No sampling callbacks means this listener does not activate spans. Installed net10 reference XML confirms the API exists.

**Alternatives**: Removing tags does not sanitize events; reflection unsupported; one-exporter redaction misses other exporters; replacing every native operation with manual spans increases complexity and coverage risk.

Sources: [pinned .NET10 AddException implementation](https://github.com/dotnet/runtime/blob/v10.0.0/src/libraries/System.Diagnostics.DiagnosticSource/src/System/Diagnostics/Activity.cs), [ExceptionRecorder API](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.activitylistener.exceptionrecorder?view=net-10.0), pinned Npgsql source above. Use fixed safe values for message/stack rather than inspect arbitrary error text.

## Host lifecycle and tests

**Decision**: Host-neutral shared telemetry; bootstrap host Start before work, bounded stop/flush/dispose afterward; real PostgreSQL production registration and exporter-only tests; isolated missing-registration mutation.

**Rationale**: Bootstrap currently only Build, without ServiceDefaults/provider startup. Web registration alone cannot collect it, and short lifetime can lose batched export. Existing test ActivityListeners can activate sources missing from production. Mutation must fail even with the production exception recorder installed. API/worker/bootstrap entry points provide public behavior coverage; a production telemetry-host integration is justified for unknown commands/errors without new endpoints.

**Alternatives**: Direct exporter calls duplicate SDK; dashboard health is not span evidence; independent listener tests repeat the original blind spot. Existing broker doubles/contract tests remain sufficient since broker behavior is unchanged.
