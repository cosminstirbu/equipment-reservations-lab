# Diagnostics implementation record

2026-10-21; working tree based on `623bfaf`. Coder owns scripts and root test
registration; this is author evidence, not a review verdict or feature acceptance.

## Test design and chronology

Production process execution remains real in `process.test.mjs`. Fixture Node
executables replace only the external executable boundary: stdout/stderr, stdin,
environment, exit, missing executable, timeout and output-buffer contracts follow
Node child_process behavior. The progress test uses a file handshake to establish
both streams were visible before child completion. Capture tests assert separate
4000-character tails and truncation. Private tests inject markers in input,
arguments, environment and both output streams, inspect thrown/serialized errors,
and assert no raw causes. Cleanup exercises both success-plus-cleanup failure and
primary-plus-cleanup failure, with all resources attempted.

The first `node --test scripts/process.test.mjs` failed because process.mjs did not
exist. **That is a setup failure, not an intended-behavior red.** The new helper's
standalone cases then passed after implementation. This chronology does not establish
an intended-behavior red for every new helper contract; in particular before-exit
streaming and independent truncation were green-only when first reachable. The quiet
formatter regression was added after its integration and was green immediately.
No original red evidence is claimed for those cases; independent review must assess
this sequencing gap under the constitution and T043.

Actual intended-behavior regressions ran before their corresponding caller repairs:

| Command (all from repository root) | Actual red | Subsequent result |
| --- | --- | --- |
| `node --test --test-name-pattern='diagnostic build CLI\|prerequisite CLI\|smoke CLI\|HTTP transport failures' scripts/deployment-ci.test.mjs scripts/local-kubernetes.test.mjs scripts/deployment-smoke.test.mjs` | Four failures: swallowed build status; swallowed prerequisite metadata; swallowed smoke phase; raw fetch failure. The initial copied-Node podman --version fixture bypassed preload, so the provider was corrected to kind version. | Four passed with real CLI/provider executables and HTTP transport. |
| `node --test --test-name-pattern='npm scripts preserve\|private telemetry body' scripts/quality.test.mjs scripts/deployment-diagnostics.test.mjs` | Two failures: npm missing structured status/duration/category and telemetry body reader retaining raw private cause. | Two passed. |
| `node --test --test-name-pattern='routing CLI reports' scripts/deployment-ci.test.mjs` | Failure: old routing CLI had raw provider stderr and no structured primary/cleanup evidence. Nested test runner initially inherited binary reporter context; fixture now explicitly clears NODE_TEST_CONTEXT. | Passed: primary status42 and five cleanup attempts with status43; private marker absent. |
| `node --test --test-name-pattern='authenticated GitHub failures\|browser CLI reports' scripts/promote-images.test.mjs scripts/deployment-ci.test.mjs` | Two failures: raw authenticated transport message, and raw browser exception name/message. | Two passed after transport/payload/status projection and fixed browser stage reporting. |
| `node --test --test-name-pattern='private machine JSON' scripts/local-kubernetes.test.mjs` | Invalid private JSON produced SyntaxError with private response excerpt rather than safe boundary category. | Passed after public lifecycle boundary sanitization. |
| `node --test --test-name-pattern='private local state' scripts/quality.test.mjs` | Private `.local/credentials.json` was eligible as source input. | Passed after exclusion; this prevents malformed private state appearing in formatter output. |

Existing suites are extended rather than replacing existing behavioral expectations.
The npm/quality command fixture continues to delegate to real Node subprocesses;
its external dotnet seam now also covers execFileSync because the runner changed.
Authenticated GitHub test doubles replace the explicitly injected request transport.
The browser fixture replaces only the third-party Playwright launch boundary.
The telemetry reader double replaces authenticated response-body transport, retaining
real bounded read/parse/error handling. Public lifecycle function tests retain owned
orchestration and replace the existing provider runner boundary. No production
private state or methods were exposed for testing.

## Operation audit: primary coder files

| Files | Exact boundary and disposition |
| --- | --- |
| process.mjs / process.test.mjs | Shared bounded synchronous execution: unknown/private capture default, explicit streaming both destinations, public capture tails; no raw cause/args/env/stdin persistence. Async cleanup attempts all and prints separately. |
| deployment-ci.mjs / deployment-ci.test.mjs | buildImages explicitly streams each audited image build/load/push. Dockerfiles use public inputs, pinned images, constrained PROJECT values; Dockerfile-specific ignores exclude credential material and no secret build args exist. execute classifies kind create/load and kubectl rollout/wait as safe progress; kustomize captures public manifests; get/logs/OpenSSL/exec/private apply remain private. Retains validated Job status/log-category projections and main publication guard. CLI unknown parse/fs failures are suppressed. |
| local-kubernetes.mjs / local-kubernetes.test.mjs | call classifies cluster create/delete and deployment rollout/wait progress, public cluster discovery/render capture, private resource/provider/TLS/credential/authentication calls. Remote reference/VM data remain private until parsed and validated. Status displays only the deliberately selected pods/pvc/jobs table. Access forward captures privately because startup output may contain sensitive context; fixed startup phase and bounded process failure metadata remain visible. Smoke forward uses fixed loopback startup/ready phases and safe spawn/exit metadata. Smoke plus shutdown and work plus operation-lock cleanup retain primary failures. Private parsed-state failures sanitize at execute boundary. |
| deployment-smoke.mjs / deployment-smoke.test.mjs | Authenticated/business HTTP stays private. Script-owned assertions/prerequisites/status use typed safe errors; outer CLI prints safe phase, hides unknown fs/parser/transport details. JSON body reader sanitizes malformed private payloads. |
| deployment-diagnostics.mjs / deployment-diagnostics.test.mjs | Existing bounded authenticated Dashboard transport, shape/privacy validation, polling and enum projections retained. Removed raw body-reader cause and string-prefix trust of arbitrary external errors. Owned failures are typed; response cancellation after already-failed read is deliberately secondary and cannot replace primary evidence. |
| deployment-routing.test.mjs | Revised in repair round1: public fixture network create, fixed public container starts and exact owned resource removals stream both outputs. Fixture service names, images, source mounts and SERVICE fields are public; no credential/authentication payload or runtime logs are requested. Port output is public machine capture for parsing. Unknown additional operations require a fresh assessment rather than inheriting this fixture-specific decision. node:test teardown independently reports all four containers/network/fixture removals; its hook preserves primary test failure. CLI regression observes both streams and all five provider removals after primary failure. |
| deployment-validation.mjs / deployment-validation.test.mjs | OCI index is captured privately for JSON parsing; safe process metadata replaces implicit stderr/error echo. Deterministic public schema/release/Job-source validation remains; existing public CLI parsing tests retained. |
| promote-images.mjs / promote-images.test.mjs | Git revision public capture; authenticated request/response transport private with bounded safe status/phase categories. Safe owned validation failures remain actionable, unknown outer failure details suppressed; CAS, parent snapshot and allowed changes unchanged. |
| quality.mjs / quality.test.mjs / npm.mjs | Audited developer tool execution streams both destinations. Deliberately quiet formatter reports both separate bounded tails. Process failures use shared safe metadata; asynchronous dotnet/test runners now normalize spawn/exit/timeout failures. Formatter cleanup preserves primary errors. Private .local state excluded from source discovery. |
| openapi-lint.mjs / openapi-lint.test.mjs | Retained: source document and requested label are explicitly public lint input; useful schema/path diagnostics are the intended CLI output. External refs rejected before resolver use; test capture is necessary to verify stdout/stderr and result. No authenticated provider output. |
| admin-console-browser.mjs | Browser interactions private; fixed script-owned stage retained, arbitrary exception name/message removed. Browser shutdown bounded to five seconds and failure reported separately without raw material. |

Provider helper owner supplies complementary exact inventory and red/green evidence
for broker/database/dashboard/ingress/config-rollout and CI contract scripts. All
script filenames in the design inventory are assigned; source review and independent
verdicts remain required before closing T048.

## Checks and limitations

Git Bash prerequisite script succeeded using explicit feature directory; all three
checklists had no unchecked items (diagnostics10, local-kubernetes14, requirements16).
No extension hooks exist. Dockerfile-specific ignore files, repository ignore,
Prettier ignore and ESLint ignores inspected. Root package is private; npm publishing
ignore not needed. No Terraform/Helm source or corresponding ignore required.

Windows Node24.15 helper: six passed, one explicit POSIX-signal applicability skip.
Main pure aggregate (process/CI/smoke/diagnostics/promotion): 53 tests,49 pass,
three existing platform limitations (two0600 checks, one symlink EPERM),one POSIX
skip. Targeted npm/OpenAPI/private-state/deployment-runner cases: five passed.
Quiet real Prettier bounded-tail case passed. Exact-file formatting ran after every
source edit; npm.cmd used because npm.ps1 is blocked by host execution policy.
Whole-source ESLint has been invoked; coordinator owns final revision-matched full
format/lint/application/deployment checks, Linux signal/mode evidence and reviews.
No unavailable runtime check is treated as passed. No commit/push/workflow trigger
or feature acceptance is authorized by this implementation record.

## Repair round1

Independent findings DQ-C001/DQ-C002/DQ-C003 were assigned after frozen snapshot01.
The following intended reds ran before corresponding production repairs:

- `node --test --test-name-pattern='routing CLI streams|image-build cleanup|browser reports both' scripts/deployment-ci.test.mjs`: three failed. Routing stdout was absent, image cleanup exposed the raw filesystem marker/replaced primary failure, and Rabbit cleanup failures were not reported after primary failure. After fixes all three passed.
- `node --test --test-name-pattern='suffix refresh attempts' scripts/promote-images.test.mjs`: failed with only one of two exact temporary cleanups attempted; after repair passed for cleanup after success and simultaneous primary/write plus cleanup failures.
- Coordinator's Linux `node --test --test-name-pattern='parent smoke CLI' scripts/local-kubernetes.test.mjs` initially failed with empty stdout, before invokeSmoke was changed. Later fixture diagnosis showed this was an earlier copied-Node kubectl executable rejecting --kubeconfig with exit9 before the smoke child ran. **That fixture failure does not establish the intended-behavior red for parent-output propagation.** After replacing POSIX provider fixtures with real shell executables, the repaired parent passed; this contract is green-only and part of DQ-P001 scope.
- `node --test --test-name-pattern='host prerequisite failures' scripts/local-kubernetes.test.mjs`: failed because DNS lookup transport failure became generic private state/response diagnostic. Only after that red, hostPrerequisites projects fixed DNS/certificate-trust category and suppresses raw provider marker; targeted Windows green passed.

Public synchronous buildImages and refreshJobSuffixes APIs remain synchronous.
Their new narrow cleanupAllSync helper attempts every exact owned resource, reports
safe cleanup evidence separately, preserves the typed primary error and fails an
otherwise successful operation. Filesystem failure fixtures replace only fs.rmSync
and, for the primary write case, fs.renameSync in an isolated subprocess; all normal
filesystem reads, writes, YAML parsing and script orchestration remain real. The
boundary double throws EACCES, matching the external filesystem responsibility.
Rabbit cleanup retains its real Promise.allSettled attempts and now reports each
fixed queue/exchange category before any primary propagates.

The prerequisite CLI external executable fixture now supplies successful podman and
git version executables before the deliberately failing kind executable, making it
independent of those installed host tools. Generic injected kubectl Error has no
timeout evidence, so the stale test expectation was corrected to category unknown;
no timeout was fabricated. Existing private Unix file-mode assertions are unchanged.

### DQ-P001 chronology scope

In addition to the original helper/quiet-formatter gaps above, two first-batch late
security protections were implemented before new intended-behavior red evidence:
deployment-smoke.mjs request's JSON body-reader wrapper (safe malformed private
HTTP payload error), and deployment-validation.mjs verifyReleaseIndexes default
OCI JSON parser (safe malformed private provider-response error). Existing parsing
tests and inspection do not retrospectively establish test-first ordering for them.

Repair round1 also contains a sequencing mistake: CI Job wait process-metadata
preservation was added in the cleanup patch before its new public regression. The
real-process test `CI Job projection preserves real process status category and
duration` immediately passed and is **green-only**, not intended red. It retains
actual Node child execution and the existing external runner seam, checks status23,
exit category/duration and allowlisted Job stage, and excludes the private marker.
This additional contract is explicitly part of DQ-P001's exception scope for the
human owner's decision. No scoped exception is recorded by the coder and no policy
gate is self-approved. The coordinator was notified immediately; no red was
reconstructed through reverting or mutating already-written implementation.

Parent-smoke child HTTP phase/stdout propagation must also be included in DQ-P001:
the apparent initial red was subsequently identified as a provider-fixture defect,
not the intended production-output failure. No corrected historical red is claimed.
Final test-only correction changed kind/kubectl fixtures in this POSIX-only case to
executable /bin/sh scripts emitting validated fixed public cluster and owned marker
values. The Node preload now handles only the real Node smoke-child boundary. Cached
Linux targeted command passed1/1,exit0 with no network and a read-only workspace mount;
scoped ESLint also passed. Production source was not changed during fixture correction.

Final own `node node_modules/eslint/bin/eslint.js scripts --max-warnings 0` exited0
after repair source formatting and re-reading. Parent smoke and complete Linux/
provider/format/lint/application checks must be matched to the new frozen snapshot.
