Revised preparation verdict: **pass**, no findings.

Confirmed the [pinned OTLP serializer](https://github.com/open-telemetry/opentelemetry-dotnet/blob/core-1.19.1/src/OpenTelemetry.Exporter.OpenTelemetryProtocol/Implementation/Serializer/ProtobufOtlpTraceSerializer.cs#L248) transmits `DisplayName`, not internal `OperationName`. Normalizing exported names while preserving actual database selection resolves the watchpoint.

Exporter ordering and sanitization still require implementation evidence. No files changed.
