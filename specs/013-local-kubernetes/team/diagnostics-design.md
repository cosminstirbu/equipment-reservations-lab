# Script diagnostics design amendment

Date: 2026-10-21. Baseline: `623bfaf`. Scope: FR-019–FR-021,
AC-4.4–AC-4.6, SC-008–SC-009. Design is pending independent review.

## Decisions and boundaries

The authoritative practice is [tooling](../../../docs/engineering/tooling.md).
Use one small `scripts/process.mjs` module for synchronous execution, validated
failure metadata and bounded safe rendering, with a narrow child-lifecycle adapter
only where the existing asynchronous forwards need it. Avoid a workflow framework,
command registry or general retry engine. Call sites retain operation-specific
classification, parsing, environment, deadlines and provider projections.

Interface contract: each call supplies a fixed safe operation label, tool identity
and explicit output policy (`stream`, `public-capture`, `private-capture`). Unknown
operations default private. Stream returns no parsed payload; capture returns the
machine result without printing it. Errors expose validated status/signal, duration
and a finite category: exit, spawn, timeout, output-limit, termination or unknown.
Do not attach original errors/causes to public errors. Private provider projections
remain call-site functions with field/value allowlists; a generic redactor cannot
make arbitrary output safe. Spawn ENOENT, ETIMEDOUT and ENOBUFS are classified from
validated platform metadata, never raw messages. Platforms can report unavailable
metadata honestly rather than inventing an exit status or timeout.

Public captures retain at most the final 4000 characters of each stream for failure
display, identify stdout/stderr independently and mark truncation per stream. Keep
the existing finite capture budgets unless a specific parser/provider requires a
reviewed adjustment; the 16MiB process defaults are not a console-tail bound. Buffer
exhaustion remains a distinct failure even if a partial machine response exists.
Streaming bypasses capture limits but does not retain output. Public progress must
reach each destination during execution. Machine stdout stays parseable; safe
metadata/errors go to stderr. Public renderers sanitize control characters in labels
and metadata; labels/tool identities are fixed or validated, never arbitrary args.

Existing finite command/startup/shutdown budgets and no-generic-retry decisions
remain. No new network dependency or application telemetry registration is added.
CLI process metadata is operational feedback, not proof of correlated application
OpenTelemetry. Preserve safe deployed Job projections and actual telemetry privacy
checks. HTTP failures retain safe phase/status/category; never raw URLs, bodies or
untrusted Error messages. Cleanup attempts every owned resource within its existing
deadline, retains primary failure, and adds separate safe cleanup diagnostics.

## Whole-scope operation inventory

Every `.mjs` under `scripts/`, including test-owned subprocesses and cleanup, is in
scope. This initial inventory determines intended policies; coder must record exact
call-site coverage and any additional operation discovered before closing T048.

| Files | Operations and handling | Required change or retained behavior |
| --- | --- | --- |
| `deployment-ci.mjs`, `deployment-ci.test.mjs` | Public image build/load/push and nonprivate cluster progress stream both; rendered YAML, versions, indexes and JSON capture; private apply, logs, provider exec capture privately | Replace blanket catch; fixed per-image/phase labels; retain safe Job projections and publication guards; classify each call |
| `local-kubernetes.mjs`, `local-kubernetes.test.mjs` | Version/info/status/render/remote-head responses capture; public setup/delete/wait progress stream where audited; credential/TLS/Secret/bootstrap operations private; loopback forwards explicit lifecycle | Replace blanket catch, surface safe forward startup/error/exit and shutdown; preserve ownership/deadlines and private inputs |
| `deployment-smoke.mjs`, `deployment-smoke.test.mjs` | HTTP auth/business/checkpoint operations private; safe assertions, prerequisites and status diagnostics projected by phase | Preserve known safe failure context through CLI catch without forwarding arbitrary errors |
| `deployment-broker-retention.test.mjs`, `deployment-database-bootstrap.test.mjs` | Public image build/provider resource operations stream; archive/inspect/query output capture; secret runtime/env/config/provisioning output private | Split operations; safe metadata on private failures; keep database failure-type projection; aggregate cleanup evidence |
| `deployment-dashboard.test.mjs` | Public image/resource progress stream; port/JSON responses capture; keyed runtime/API operations private | Replace raw stderr/Error interpolation, keep public API contract assertions and report cleanup |
| `deployment-ingress.test.mjs`, `deployment-routing.test.mjs` | Public fixture image/cluster progress stream; rendered config/status/ports capture; TLS private apply/certificate operations private | Retain relevant safe tails from both streams; safe forward lifecycle; inspect all cleanup, including currently ignored routing removals |
| `deployment-ci-contract.test.mjs`, `deployment-config-rollout.test.mjs`, `deployment-config-rollout-live.mjs` | Versions, rendered public YAML, config/claim JSON capture; rollout progress stream; cleanup public unless fixture secrets involved | Retain parsing; apply safe command evidence and preserve primary plus cleanup outcomes |
| `deployment-validation.mjs`, `deployment-validation.test.mjs` | OCI index JSON and public validation CLI capture | Retain parsing; classify index subprocess failures; malformed external values stay private until validated |
| `promote-images.mjs`, `promote-images.test.mjs` | Git revision capture; authenticated GitHub requests private; public fixed validation failures | Safe outer CLI failure categories/status; retain CAS and allowed-change validation; no token/remote payload echo |
| `deployment-diagnostics.mjs`, `deployment-diagnostics.test.mjs` | Authenticated Dashboard responses private, controlled bounded field projections | Retain useful existing privacy/shape categories; inspect cancellation and deadline catches for hidden actionable failures |
| `quality.mjs`, `quality.test.mjs`, `npm.mjs` | Ordinary build/lint/test/npm execution stream; deliberately quiet formatter captures | Retain sound streaming; mark/bound each quiet failure tail; audit spawn/signal and test-runner cleanup reporting |
| `openapi-lint.mjs`, `openapi-lint.test.mjs` | Public OpenAPI validation/CLI results capture in tests | Retain validation feedback and stdout consumer contract; audit outer error safety |
| `admin-console-browser.mjs` | Authenticated browser interaction private; fixed stage labels safe | Remove arbitrary exception message/name echo; retain fixed safe stage/failure category, report browser cleanup separately |

Tool failures may echo secret arguments, environment, payloads, filenames or startup
URLs even if successful output is safe. In particular container starts with private
env files, TLS generation, authenticated exec, and kubectl apply from private stdin
stay private. Publication output can stream only after auditing Dockerfiles, build
context and supported authentication flow; no build secret/credential args are
introduced. The inventory is not permission to stream all invocations of any tool.

## Test design and verification

Extend existing suites before adding cases. `scripts/process.test.mjs` exercises the
public process helper using real child Node processes: separate stdout/stderr,
nonzero exit, nonexistent executable, timeout and excessive output. Observe streaming
before child completion using a bounded signal/handshake, avoiding timing sleeps as
the oracle. Verify per-stream tail bounds/truncation and machine stdout parsing.
Private cases inject distinct markers in args, env, stdin, stdout, stderr and errors,
and assert no marker in console, serialized/thrown errors or generated diagnostics.
Real helper/process tests retain production execution and rendering; fixture children
are external executable boundary doubles faithful to Node process stdio/status.

CLI regressions for deployment CI, lifecycle and smoke retain the production outer
catch and runner. Use temporary executable shims only at external provider boundaries;
verify actual stdout/stderr/nonzero result. Existing injected-function tests remain
supplementary for orchestration choices. Browser/HTTP transport fixtures follow the
existing provider contracts; new safe phase projections are tested at public CLI
or public function boundaries, not by inspecting source strings/private methods.

Cleanup tests cover primary success plus cleanup failure, combined failures, and
continued cleanup attempts after one removal fails. Assert original failure evidence
and separate safe resource-kind diagnostics. Extend real provider contracts for
changed live helper behavior; do not invent fake provider success or waive Podman.
Real POSIX signal termination requires a compatible host: Windows-only execution
cannot prove POSIX signal semantics. Run available real-process Windows cases and
record POSIX/provider gaps pending until an authorized compatible environment runs
them. Existing Windows private-file mode failures remain pending platform evidence,
not grounds for weakening permission checks or treating retries as passes.

Retain intended red commands/results then green results per behavior batch. Run
affected Node suites, full deployment suite with required providers, format-check,
lint, and the feature's existing required application check. Record environment,
tested snapshot, exit and unavailable prerequisites. Inspect classification/privacy
manually; tests alone cannot prove a provider never prints secrets. No commit, push,
workflow trigger or feature acceptance is authorized by this amendment.

## Artifact and execution record

Applied speckit-plan/tasks as targeted amendments after implementation started;
historical T001–T041 and unfinished acceptance tasks are preserved. Both setup
scripts succeeded through Git Bash with explicit feature directory and no-persist;
no extension hooks exist. Existing research, model, runtime contract and quickstart
were read and retained: there is no new business model or public business API.
Guide approval is the owner's 2026-10-21 Q1–Q7 agreement. The engineering index
provides cumulative discovery through the constitution's existing engineering link;
no constitution amendment/version change is needed.

This newly approved scope is a new bounded batch; coordinator records its preparation
and implementation repair counts separately while preserving earlier limits/history.
Author checks are link/readability/requirement consistency only. Independent quality
and security verdicts, convergence and explicit human acceptance remain pending.
