**Q-001 — Changes requested:** Bootstrap failure logging loses trace correlation.

At [Program.cs:45](/Users/cosmin.stirbu/Desktop/codex-speckit-team/src/DatabaseBootstrap/Program.cs:45), the failure log runs after the bootstrap activity is disposed. This violates the correlated-observability requirement. Severity **medium**, blocking.

The subprocess test discards OTLP logs, so its current assertions cannot detect this gap.

Move provisioning failure logging inside the active workflow scope, preserve safe startup-failure handling, and add a real subprocess assertion matching the failure log’s trace/span IDs to the bootstrap span. Require failing-before and passing-after evidence, with existing exit codes and privacy checks preserved.

No files changed or tests run.
