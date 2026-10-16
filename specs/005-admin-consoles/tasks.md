# Tasks: Local Administration Consoles

**Input**: `specs/005-admin-consoles/spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/admin-consoles.md`, `quickstart.md`.

**Preparation baseline**: HEAD `9878407026878e966c0b442cd0f62f9f409f140d`; independent quality/security preparation PASS snapshot `05ff34664501fbc8667ff9e177f5f4e350f594c253d48c9663c279bdb1d141f4`. Tasks require subsequent analyze/security coverage review before implementation.

**Tests**: Mandatory under constitution II and approved plan. Record intended failing behavior before production changes. Tests use real isolated infrastructure and public AppHost/interfaces. Do not count a failed prerequisite/compile error as the intended red result.

**Ownership**: Coder owns T001–T018 and appended T023–T024 implementation/test/documentation work. Coordinator owns T019–T022 gate orchestration/state and reviewer assignments; independent reviewers alone supply verdicts and the human alone supplies acceptance. The coder must leave coordinator tasks unchecked. Coordinator may execute runtime/browser checks if assigned explicitly, preserving evidence and ownership. No merge, deployment, publishing externally or issue creation is authorized.

## Phase 1: Setup

- [X] T001 Confirm exact active feature `specs/005-admin-consoles`, approved spec/design hashes, installed pinned Aspire APIs and working Podman/test prerequisites; record credential-free baseline and intended test commands in `specs/005-admin-consoles/team/implementation-evidence.md` without changing `.specify/feature.json` or existing secret storage.

## Phase 2: Foundation — cross-cutting tests before wiring

- [X] T002 Add behavioral development/non-Development/publish-model tests in `tests/Smoke.Tests/AdminConsoleTests.cs` for automatic console HTTP endpoints/dynamic ports, excluded service references, absent publish console resources/management endpoint/image mutation, preserved ordinary resources/volume and secret identities, and no pgAdmin settings volume; run and record expected missing-console failures before editing `src/AppHost/Program.cs` in `specs/005-admin-consoles/team/implementation-evidence.md` (FR-001, FR-005–008).
- [X] T003 Prepare isolated real AppHost lifecycle and bounded HTTP helpers in `tests/Smoke.Tests/AdminConsoleTests.cs` and, only if needed, `tests/Smoke.Tests/SmokeStartup.cs`; add tests for existing Rabbit credentials/auth rejection and automatic pgAdmin HTTP access, then record intended pre-wiring failures in `specs/005-admin-consoles/team/implementation-evidence.md`. Keep test storage isolated from owner volumes; ten-second HTTP requests/three-minute readiness deadline, unique test objects and reliable disposal (FR-001–003, FR-007).

**Checkpoint**: Expected failing evidence exists; no production wiring has been changed. Security/publish invariants are established before either console is enabled.

## Phase 3: User Story 1 — inspect and manage messaging (P1)

**Goal**: Rabbit management starts normally, authenticates with existing credentials and supports agreed broker workflows.

**Independent test**: Reach dashboard-linked loopback URL, reject anonymous administration, log in, inspect isolated routing/consumer/message resources, publish/inspect a message and purge its queue.

- [X] T004 [US1] Enable installed Rabbit `WithManagementPlugin` after existing pinned image tag in `src/AppHost/Program.cs`, only for Development AND run mode; configure dynamic proxied loopback management endpoint, `IsExternal = false` and `ExcludeReferenceEndpoint = true`, retaining AMQP, existing password parameter and data volume unchanged (FR-001–002, FR-005–007).
- [X] T005 [US1] Adapt `tests/Smoke.Tests/BrokerContractTests.cs` to select AMQP by public endpoint identity rather than assume one endpoint; prune pgAdmin when pruning Postgres, retaining all existing broker topology/confirms/routing assertions. On the first Rabbit console startup, before any credentialed management request or browser work, inspect its actual proxy listeners and Podman backing publications across IPv4/IPv6 and attempt bounded non-loopback access (including backing ports); require loopback-only bindings and unreachable non-loopback paths. Stop/disable the affected console and report to coordinator/security on any exposure failure before continuing. After that safety gate, run focused tests from T002/T003 and broker contract checks; record the binding gate, matching 4.3.6 management image and passing auth/AMQP outcomes in `specs/005-admin-consoles/team/implementation-evidence.md` (FR-002, FR-010).
- [X] T006 [US1] Exercise actual Rabbit browser login, queue/exchange/binding/consumer/message inspection, test publication, message inspection/get and queue purge using uniquely named disposable broker resources; record actions/effects and cleanup in `specs/005-admin-consoles/team/implementation-evidence.md`. Use existing Playwright tooling or supported computer-use without saving credentials/authentication traces (FR-002).

## Phase 4: User Story 2 — inspect and change application data (P1)

**Goal**: pgAdmin grants automatic administrator access to all three databases and disposable console settings.

**Independent test**: Open without login/registration/password entry, browse/query all databases, mutate disposable objects in each, recreate pgAdmin and repeat automatic access.

- [X] T007 [US2] Enable installed `WithPgAdmin` in `src/AppHost/Program.cs` under the same Development AND run guard; explicitly select new console image9.18.0 via callback `WithImageTag("9.18.0")` and verify configured/running version (SEC-005-D1 follow-up T023–T024; the checked original task remains historical 9.15 implementation evidence); configure dynamic proxied loopback HTTP endpoint excluded from references/external publish, readiness relationship to Postgres and manifest exclusion, with no pgAdmin persistent volume. Preserve built-in internal generated admin server registration, existing database bootstrap and all service credentials (FR-001, FR-003, FR-005–008).
- [X] T008 [US2] On the first pgAdmin startup, before using its password-free administration or any browser workflow, inspect its actual proxy listeners and Podman backing publications across IPv4/IPv6 and attempt bounded non-loopback access (including backing ports); require loopback-only bindings and unreachable non-loopback paths. Stop/disable the affected console and report to coordinator/security on any exposure failure before continuing. After that safety gate, complete/run automatic pgAdmin availability and recreation coverage in `tests/Smoke.Tests/AdminConsoleTests.cs`; verify unchanged storage/secret/service-account setup and passing Development/non-Development/publish assertions after both integrations are enabled; record results in `specs/005-admin-consoles/team/implementation-evidence.md` (FR-001, FR-003, FR-007–008).
- [X] T009 [US2] Exercise actual pgAdmin browser access without a console login, manual server registration or password entry; browse existing tables and execute SQL in inventory, reservations and notifications; create unique disposable schema/table objects, insert/edit/delete rows and drop objects in each database, recording visible outcomes and effects in `specs/005-admin-consoles/team/implementation-evidence.md` (FR-003–004).
- [X] T010 [US2] Recreate only the isolated pgAdmin console through supported lifecycle tooling and repeat automatic access to all three databases without restoring preferences/history; record no persistent settings volume and retained database state in `specs/005-admin-consoles/team/implementation-evidence.md` (FR-007–008). Do not delete owner containers/volumes or rotate credentials.

## Phase 5: User Story 3 — local boundary and retained behavior (P1)

**Goal**: Prove effective local-only access, exclusion outside local development, and unchanged application state/permissions.

**Independent test**: Inspect every proxy/backing binding, fail non-loopback access while loopback works, inspect actual publish output, restart with isolated sentinel state and run retained application checks.

- [X] T011 [US3] Consolidate and reverify the first-start safety evidence from T005/T008 for both consoles' actual Aspire proxy listeners AND Podman backing host publications, IPv4/IPv6, and attempt direct requests to discovered non-loopback host addresses including backing ports with bounded timeouts; retain only redacted addresses/ports/outcomes in `specs/005-admin-consoles/team/implementation-evidence.md`. Any wildcard/non-loopback publication is blocking even if the dashboard shows localhost; stop/disable the affected console and report to coordinator/security on exposure failure, including if supported configuration cannot enforce the boundary (FR-005).
- [X] T012 [US3] Generate and inspect local deployment manifest/model output using a supported installed API/command; record exact invocation and credential-free resource/endpoint/image results in `specs/005-admin-consoles/team/implementation-evidence.md`, proving no pgAdmin, Rabbit management endpoint or management-image mutation while ordinary resources remain. Also confirm non-Development run model exclusion via `tests/Smoke.Tests/AdminConsoleTests.cs` (FR-006).
- [X] T013 [US3] Verify retained Postgres records/schemas, Rabbit resources/queued messages, named-volume identities and existing password/secret-store identities across normal startup/restart using isolated sentinel state; extend existing `tests/Smoke.Tests/BookingSmokeTests.cs` only if its persistence/role assertions lack required coverage. Confirm no pgAdmin/service administrator-credential propagation and record outcomes in `specs/005-admin-consoles/team/implementation-evidence.md` (FR-007, FR-010).
- [X] T014 [P] [US3] Document normal startup/current dashboard links/dynamic ports, secure existing broker credential retrieval without values, administrator/destructive powers, loopback-only no-login pgAdmin and disposable settings in `README.md`; ensure instructions do not encourage tunnels/LAN forwarding or state resets (FR-009).
- [X] T015 [US3] Run existing booking, messaging recovery, persistence, authorization and observability/privacy regressions with console-enabled orchestration; inspect new feature documentation/logs/evidence for credentials/connection secrets and record outcomes/revision in `specs/005-admin-consoles/team/implementation-evidence.md` (FR-009–010). Do not retain raw secret-bearing container inspection or generated registration files.

## Phase 6: Polish, checks and independent completion gates

- [X] T016 Inspect edited-source readability and generator/analyzer diagnostics, format each exact edited source after every edit via `npm run format -- <edited paths>`, re-read formatted files and apply explicit semantic fixes without suppressions; record changed files and rationale in `specs/005-admin-consoles/team/implementation-evidence.md`.
- [X] T017 Run mandatory `npm run format-check`, `npm run lint` and full `npm run check` with running Podman, and record commands/environment/exit statuses/results/tested revision in `specs/005-admin-consoles/team/implementation-evidence.md`. Unavailable/skipped/failed checks stay pending; source fixes require affected evidence revalidation.
- [X] T018 Walk through `specs/005-admin-consoles/quickstart.md` and requirement-to-evidence mapping, record remaining limitations or reproducible failures and final implementation snapshot in `specs/005-admin-consoles/team/implementation-evidence.md`; hand off source changes frozen for independent review, leaving coordinator gates unchecked.
- [X] T019 Coordinator: freeze revision and obtain explicit independent verifier/security implementation verdicts on current code and runtime evidence; persist reports/findings in `specs/005-admin-consoles/team/quality-implementation.md`, `specs/005-admin-consoles/team/security-implementation.md` and `specs/005-admin-consoles/team/findings.json`; route and independently revalidate any blocking fixes (FR-011).
- [X] T020 Coordinator: execute `$speckit-converge` after implementation has run on current `specs/005-admin-consoles/tasks.md`; preserve task history and append/route any gaps, then obtain current-revision no-gap convergence evidence in `specs/005-admin-consoles/team/convergence.md` (FR-011).
- [X] T021 Coordinator: present concrete working result, verification and any unresolved gates to owner; record explicit final feature acceptance with date in `specs/005-admin-consoles/team/run-state.json`. Implementation authorization and interview approval do not count as result acceptance (FR-011).
- [X] T022 Coordinator: after acceptance, inspect and synchronize `specs/005-admin-consoles/spec.md`, `specs/005-admin-consoles/tasks.md` and `specs/005-admin-consoles/team/run-state.json`; set spec Status to `Complete — implemented, independently reviewed, and accepted YYYY-MM-DD`, label metadata-only change, and preserve historical review hashes/reports. If any gate remains pending, name it accurately instead of declaring complete (FR-011).

## Appended Security Repair — SEC-005-D1

Original IDs/check states are preserved. Completed pre-repair pgAdmin work records historical 9.15 evidence, not final approval of 9.18. These tasks must finish before T017–T022 can establish current-revision completion.

- [X] T023 Add an expected-failing pgAdmin 9.18.0 configured-image assertion in `tests/Smoke.Tests/AdminConsoleTests.cs`, record intended red evidence, then explicitly pin only the new console image using supported `.WithImageTag("9.18.0")` in `src/AppHost/Program.cs`; verify actual runtime image/version and record the security rationale/results in `specs/005-admin-consoles/team/implementation-evidence.md`. Preserve existing Aspire/PostgreSQL/RabbitMQ versions and all original completed task history (SEC-005-D1, FR-003–008).
- [X] T024 After T023, rerun affected Development/non-Development/publish-model and scoped emitted manifest checks, first-start proxy/backing IPv4/IPv6/nonloopback binding gates before no-login use, actual all-three-database browser workflows and console recreation tests from `tests/Smoke.Tests/AdminConsoleTests.cs` and `scripts/admin-console-browser.mjs`; record repaired-revision 9.18 results in `specs/005-admin-consoles/team/implementation-evidence.md` and retain 9.15 evidence as historical. Revalidate state/role preservation and run T017 mandatory final checks before new independent implementation reviews (SEC-005-D1, FR-003–011).

## Dependencies and Execution Order

- T001 → T002 → T003 before any production source edit.
- US1: T004 → T005 first-start runtime binding gate → T005 credentialed/auth checks → T006 browser work. US2: T007 → T008 first-start runtime binding gate → T008 availability/recreation checks → T009 → T010. Both depend on foundation. Serialize US1 then US2 because they share `Program.cs` and `AdminConsoleTests.cs`; independently test each console's behavior.
- T002 model assertions do not establish runtime isolation. Each console's first-start proxy/backing IPv4/IPv6 inspection and non-loopback attempts in T005/T008 MUST pass before its credentialed/browser administration; exposure failure requires stopping/disabling that console and reporting, not continued workflow validation. T011 is final consolidated proof, never the first binding check. Complete runtime T011–T013 after both consoles exist; T015 follows T013. T014 may run in parallel with T011–T013 because README ownership is disjoint, provided coordinator assigns it.
- T016 is an invariant throughout source work, with a final inspection after stories; T017–T018 follow all implementation/runtime tasks.
- T019 follows frozen current code/check evidence; repairs invalidate affected checks/reviews. T020 follows implement and independent review; appended gaps require coder work/checks/reviews/convergence again.
- SEC-005-D1: T023 → T024 → T017–T018 → T019–T022; no old pgAdmin runtime/UI review evidence approves the repaired image.
- T021 follows all required gates and no blocking findings; T022 follows explicit acceptance recorded by T021.

## Parallel Examples

- US1: broker UI inspection can run alongside read-only review of existing credential documentation after T005, but no simultaneous edits to shared AppHost/tests.
- US2: after T008, read-only verification of retained service roles may run alongside the isolated pgAdmin UI scenario, using distinct disposable data.
- US3: T014 README work may run alongside T011 listener/publication checks; neither edits the other's files. Freeze all source writes before independent implementation reviews; quality and security reviews can run concurrently.

## Implementation Strategy

Use US1 as the first internal demonstration, with foundation's local/publish safety assertions; then add US2 and finish US3 runtime guarantees. The authorized delivery includes all three P1 stories, not a reduced MVP. Do not deploy any increment. Prefer one bounded coder batch; preserve stable task IDs/status after implementation begins. Coordinator-only acceptance/review metadata stays outside coder self-approval.

Task count: 24 (original22 preserved; appended security repair2). No extension hooks are registered (`.specify/extensions.yml` absent).
