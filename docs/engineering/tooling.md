# Tool output and operational failures

Applies when adding, changing or reviewing scripts, their test helpers, process
execution, operational HTTP calls, output capture or resource cleanup. Read with
[testing](testing.md), [formatting](formatting-and-linting.md), and the
[constitutional privacy policy](../../.specify/memory/constitution.md#v-correlated-observability).

## Classify the operation

Record output handling once per supported command/input class in the existing plan or
review record. New operations reference that assessment; document a new class or a deviation
only when supported inputs, sensitivity or output behavior differ. Tool names alone do not
establish safety: a public `kubectl version` and a private Secret apply have different
contracts. Assess successful/failure output, arguments, stdin, environment and automatic
error serialization at the class boundary.

| Operation | Required handling |
| --- | --- |
| Audited ordinary command with safe output | Stream both stdout and stderr during execution. |
| Machine-readable response used by the caller | Capture for parsing, keeping stdout free of wrapper diagnostics; report diagnostics separately. |
| Sensitive or unclassified operation | Capture privately and expose only safe metadata and deliberately selected projections. |
| Deliberately quiet public operation, such as formatting | Capture with a documented reason; expose bounded safe stdout and stderr tails on failure. |

Streaming requires evidence that both success and failure output are safe under
the supported configuration. Regex redaction alone does not establish that safety.
Treat tool/provider log output, authenticated payloads and token-bearing URLs as
private unless their fields have been explicitly assessed.

## Preserve useful failure evidence

Failures must identify a stable safe operation label and tool, elapsed duration,
and the available validated exit status or signal. Distinguish unsuccessful exit,
spawn failure, timeout, output-buffer exhaustion and unexpected termination.
Use a bounded known category when the platform cannot establish a finer cause.
Keep safe prerequisite, assertion and HTTP-status failures actionable through the
outer CLI boundary; raw transport exceptions and response bodies require private
handling. Safe HTTP diagnostics identify the phase/operation and available status,
without echoing authenticated URLs or payloads.

For captured public output, show bounded tails from both streams and mark each
truncated stream. Record the chosen bound. Private output must use allowlisted
projections, including validated process metadata and known provider failure
categories; never print raw Error objects, causes, full arguments, environment,
stdin or payloads. Unclassified raw dumps and debug modes that bypass these privacy
boundaries are prohibited. Any retained diagnostics follow the same classification.

### Bounded local diagnostics

Reuse assessed command/output classifications and a shared runner. Record a classification
once for the supported command/input class and revisit it when that class changes. Prefer
useful assessed error text over creating a new signature parser for every failure.

An operation may expose bounded diagnostic text directly when its success and failure
content has been assessed safe. For assessed content needing local access restriction,
an owner-only diagnostic file may retain at most 1 MiB per operation, until investigation
ends or 24 hours elapse, whichever is sooner. Keep it in ignored private scratch, verify
access before writing, remove it at expiry, and exclude it from Git, CI uploads and public
reports. Agents may inspect this assessed content without a per-message classifier.

Credentials, private keys, Secret payloads, Terraform state, environment dumps and personal
data remain excluded absent the constitution's explicit exception process. Private storage
alone does not make arbitrary provider output safe. Assess both streams and input-induced
error paths; regex redaction alone is insufficient. When content cannot be classified,
retain safe metadata and seek a narrower reproducer or human inspection instead of dumping it.

Long-running child processes must report spawn errors and unexpected exits, drain
captured streams without unbounded accumulation, and have bounded startup and
shutdown behavior. Keep useful forwarding progress visible when assessed safe,
or publish safe lifecycle phases when its raw output is private.

## Cleanup and verification

Cleanup must attempt all exact owned resources and report failures. Cleanup
failure must fail an otherwise successful operation/test. When the primary work
also fails, preserve its diagnostic and report cleanup failures separately; a
finally-block exception must not replace the primary evidence. Classify cleanup
output using the same rules as other operations.

Tooling-output changes never require test-first, including sensitive-output filtering or
redaction. After implementation, add targeted automated tests only for new or changed
sensitive-output paths. Cover private capture, permitted projections and exclusion of secret
markers from console output, thrown errors and retained diagnostics on relevant success and
failure paths. Use the smallest faithful boundary; use a real child process when necessary
to establish actual process-output exclusion. Reuse shared-runner evidence instead of
duplicating a full matrix at each caller.

Ordinary streaming, formatting, truncation and diagnostic-metadata changes do not require
new automated output tests. Inspection or a manual smoke check is sufficient. Separate
execution behavior, such as cancellation or resource cleanup, follows its applicable
[verification profile](testing.md#verification-profile); output handling does not exempt
underlying authorization, credential-management, encryption, recovery or destructive logic.

Review new or changed command/input classes and operations that deviate from them.
Reference unchanged assessments instead of documenting every call again; record only
deviations and repairs. Passing tests do not establish an output-safety classification
without inspection of the class and its supported inputs.

These practices implement the accepted constitutional verification and privacy
requirements. Output classification does not itself grant a privacy exception.
