**T037 privacy evidence assessment:** completing an intended failing export/privacy probe is appropriate within the still-open instrumentation task. Passing custom log-state/metric tests do not establish privacy of framework-generated records.

The probe should exercise the production logging/OpenTelemetry configuration and capture:

- Formatted messages, structured attributes and scopes from Hosting, Lifetime and HTTP-client instrumentation.
- Incoming availability queries and controlled dependency/error paths using distinctive non-sensitive canaries.
- Trace attributes/events and metric dimensions, alongside application logs.
- Startup records that could expose content-root paths or workstation identity.

Establish the intended red from forbidden output, then verify its absence after the change. Retain generated business outcome/error logs, trace correlation and useful bounded dependency/latency signals; silence alone is insufficient. Reinspect actual running-AppHost exports afterward, because console collection and OTLP export may differ. Record checked categories, canaries, results and frozen revision without committing raw sensitive exports. Earlier custom-state tests remain supporting evidence only.

**Dashboard documentation verdict: approve the proposed factual clarification.**

Official documentation confirms AppHost defaults to SQLite Run persistence and retains up to ten unpinned runs per application. The proposed replacement accurately distinguishes this local diagnostic history from PostgreSQL application durability and production telemetry storage. [Aspire persistence documentation](https://aspire.dev/dashboard/data-persistence/), [13.6 release notes](https://aspire.dev/whats-new/aspire-13-6/).

This preserves the selected product, local scope and AlwaysOn sampling; it does not relax privacy or authorize retaining forbidden application telemetry. Record that it corrects a stale factual statement rather than changing constitutional policy.

Structured design findings: `[]`. No final feature verdict, source approval or repair-round reset is granted. Reviewer changed no files.
