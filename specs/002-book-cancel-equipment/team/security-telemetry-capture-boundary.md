That boundary is reasonable if established by the emitting component, not merely the filename or presence of an inconvenient value.

- **Application telemetry:** API/worker console output, structured OTLP logs, scopes/resource attributes, HTTP spans and metrics must meet the approved privacy policy. Application-emitted Lifetime/ContentRoot messages remain in scope.
- **Development tooling:** DCP resource configuration, launcher/build diagnostics and installer output may contain workstation paths or sensitive configuration. Keep these private and distinguish them from instrumented application telemetry. They must not enter shared review artifacts or be described as sanitized.
- **Mixed console streams:** Attribute residual lines to their actual producer. A launcher line surrounding application output does not justify excluding application-emitted content from review.

Final evidence should identify exactly which entries/categories were inspected and excluded, with reasons. Report “no live-secret matches in the inspected application telemetry,” not “the Dashboard export contains no secrets.” The resource configuration is already known to contain credentials.

Fresh startup inspection should confirm application-path removal and identify remaining tooling-origin paths without printing them. Browser-controlled query/header/body values must remain excluded from application telemetry regardless of which framework emitted them.

This clarification grants no permission to log application secrets, request bodies or personal data, and makes no final privacy approval.
