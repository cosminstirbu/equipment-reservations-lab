# Deployed application test cases

Owner confirmed 2026-10-23: Node test runner, independent surface, identity/docs,
authorization, lifecycle/notifications, diagnostic authentication and telemetry cases;
serial default using seeded users/equipment and distinct future reservation intervals.
Cancel owned active reservations through APIs on failures; retain audit history and
report cleanup failures without replacing the primary failure. No infrastructure
operations in tests. Endpoints, trust and forwards exist before execution. Keep
persistence capture/verification separate and normal application/provider checks unchanged.
Provide explicit CLI, VS Code Run/Debug and separate readonly CI test results without
coverage. Missing prerequisites/results and failed tests fail verification; publish
available results after failure. Owner also authorized testing-guide updates.

Standards: constitution; formatting, testing, tooling, resilience and observability.
Reuse assessed HTTP probes: five-second transport deadlines, existing bounded
notification/telemetry observation, no mutation retries or circuit breaker for this
short-lived acceptance runner. Each live case retains real HTTP/authentication,
application services and providers. No application doubles. The targeted runner
regression invokes a real child process with missing configuration and a private
marker, asserting failed named cases, safe JUnit and no coverage/raw output. This
process/serialization seam establishes runner/reporting behavior only; actual deployed
success still requires the real deployment. Extend existing HTTP-helper tests where
needed to prove cancellation on failure; do not mirror workflow command strings.

Output: native IDE/CLI test failures expose only assessed OperationalFailure messages;
unknown errors use a fixed private-payload-suppressed note. CI reporter writes only
source-declared names, numeric duration, outcome and fixed failure text. No raw native
JUnit, console, stack, credentials, response bodies or attachments are uploaded. Clear
owned prior report outputs and require all selected case results. Keep 14-day artifact
retention, readonly permissions and no coverage/report comments/check-writing.

VS Code adapter: connor4312.nodejs-testing (official README supports include directories,
concurrency, extension Node arguments and debug options). Recommend, do not install it.
Discover the dedicated live directory only; inherit explicitly configured environment.
CA trust must be configured before Node starts. IDE execution remains unverified until
an actual adapter run; Node CLI evidence alone does not establish its UI behavior.

Verification (2026-10-23): intended red `node --test scripts/deployed-tests.test.mjs`
failed because the deployed runner/report did not exist. After implementation, the
real child-process regression passes with all six missing-prerequisite cases reported
as failed and no private marker in console/XML. The supplemental deterministic event
projection regression proves private event/error fields are omitted and missing/skipped
cases fail; this isolated parser boundary is justified by report privacy/completeness.
Existing HTTP-helper tests pass, including an actual HTTP ownership-denial response
that proves owned reservation cancellation after primary failure. The HTTP fixture
replaces the remote application/identity boundary for helper orchestration only;
existing PKCE contract and actual deployed login cases supply additional fidelity.

Actual existing local deployment: all eight application/provider pods were Running.
Temporary loopback diagnostic forwards were established outside the suite and removed
after verification. No cluster/workload was created, restarted or deleted. Full live
suite produced six JUnit cases: four passed, two failed. Public surface, identity/docs,
role/origin authorization and reservation/notification lifecycle passed. Diagnostic
authentication and independent telemetry failed on the existing dashboard connection;
a separate safe probe returned dashboard-root HTTP 302 but authenticated traces API
exceeded the five-second transport deadline. Preserve these failures; no dashboard
repair, skipped case or successful rerun is claimed. A public-surface-only CLI run
passed independently, and filtered reporting produced exactly one passing case.
The original full-run assessed report is retained locally in
`.cache/deployed-initial-live-results.xml` (not a raw payload/artifact upload).

Affected local lifecycle/CI tooling tests with installed OpenSSL on process PATH:
62 passed, two platform skips, one existing Windows mode assertion failed (expected
0600, observed 0666 in deployment-ci.test.mjs:630). Local smoke-wrapper cases,
CA-before-child execution, persistence flags and forward cleanup passed. The initial
missing-OpenSSL run was a failed prerequisite, not passing evidence. Pinned actionlint
1.7.12 passes the changed reusable workflow (optional shellcheck/pyflakes disabled).
Actual VS Code adapter UI and GitHub report publication remain unverified; configuration
uses documented extension/Node entry points. Full feature acceptance remains pending.

Final current-revision checks: 28 focused workflow/runner/HTTP-helper regressions pass,
with one existing Windows platform skip. Format-check and lint/build pass with zero
build warnings/errors. Author inspection covered readonly reporter permissions,
post-failure publication, exact artifact scope, source-backed result identities,
no coverage/native raw-output retention, explicit discovery separation, finite process
budgets and preservation of persistence flags. These checks do not establish IDE UI
execution, hosted summary/artifact publication or repair the retained live failures.
