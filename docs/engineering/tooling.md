# Tool output and operational failures

Applies when adding, changing or reviewing scripts, their test helpers, process
execution, operational HTTP calls, output capture or resource cleanup. Read with
[testing](testing.md), [formatting](formatting-and-linting.md), and the
[constitutional privacy policy](../../.specify/memory/constitution.md#v-correlated-observability).

## Classify the operation

Before implementation, record output handling per operation in the feature plan or
review record. Tool names alone do not establish safety: a public `kubectl version`
and a private Secret apply have different contracts. Assess successful output,
failure output, arguments, stdin, environment and automatic error serialization.

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
stdin or payloads. Automatic raw-log files/artifacts and debug modes that bypass
these privacy boundaries are prohibited. Any retained diagnostics follow the
same classification as console output.

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

Follow the [test design record](testing.md#test-design-and-review). Regression tests
must exercise observable stdout, stderr, exit status and cleanup outcomes through
public process/CLI boundaries with real process execution where process behavior
is claimed. Retain tests for safe streaming, captured-output truncation, relevant
failure categories and simultaneous primary/cleanup failure. Inject secret
markers into private inputs, outputs and error paths and assert their absence
from console output, thrown errors and retained diagnostics. Pure policy/parser
tests may supplement that coverage, but mocked subprocess calls alone do not
prove the process-output contract.

Review every operation in scope, documenting sound paths retained as well as
repairs. Passing tests do not establish an output-safety classification without
inspection of the operation and its supported inputs.

These mandatory practices were approved by the human owner on 2026-10-21 for
feature 013 and future work. They implement existing constitutional diagnostic,
privacy and test requirements; no constitutional policy exception is introduced.
