# QUAL-006 — Independent implementation quality review

**Verdict: changes_requested.** One blocking engineering-standards finding remains. Reviewed behavior and evidence support quality-side runtime closure of DESIGN-006-001 and CODE-006-001.

**Feature:** `specs/006-identity-access`  
**Review snapshot:** `2e094af021db5f65143a73d4cd24c1fd473437b529fd6a8e48500139e0a95cef`  
**Source/build snapshot:** `fc5d66bedefff1ff2e5a438a5e343b87d3db429aadb055eb094e3a6233c770dc`  
**Baseline:** `87bd4bc6964ed8dd75b8fdba8a227b530675b22d`

Verified all **284 manifest files**, with zero hash mismatches. Reviewed the uncommitted implementation against approved requirements/design/contracts, constitution, engineering standards, tests and recorded validation evidence.

## Findings

| ID | Category | Severity | Blocking | Owner | Evidence |
|---|---|---|---|---|---|
| QUAL-006-001 | Code / standards | Medium | Yes | Coder | `src/AppHost/Program.cs:28` introduces compile-time-known `ConfigurationBinder.GetValue<int>` for IdentityPort, but the owning AppHost does not enable the supported configuration-binding generator. `docs/engineering/aspnet-core.md:42` requires applicable generators and owning-project opt-in. |

**QUAL-006-001:** Enable the supported configuration-binding generator in AppHost and inspect its build diagnostics/generated handling for this call. Preserve the current default, configured override and validation behavior.

Evidence includes `src/AppHost/AppHost.csproj:3`, the absence of an inherited opt-in in `Directory.Build.props`, and the coordinator’s direct diagnostic:

```text
dotnet msbuild src/AppHost/AppHost.csproj -getProperty:EnableConfigurationBindingGenerator
Exit 0; effective property empty.
Capture: f42e2e
```

No unsupported-case rationale or owner-approved exception exists. Passing format/analyzer checks does not satisfy this separate source-generation requirement. Reformat the edited project, revalidate affected behavior and mandatory gates, then request review against the new frozen snapshot. No removal-only test is needed.

## Acceptance and implementation assessment

| Area | Assessment and principal evidence |
|---|---|
| Authentication and permissions | Strict issuer/audience/signature/lifetime validation, opaque subject checks, human/service distinction and additive Employee authorization are implemented in `src/IdentityAccess/IdentityAuthentication.cs` and `IdentityPrincipal.cs`. Actual routes enforce policies independently of the UI. Public pipeline tests include invalid authority, wrong token type, metadata outage, role combinations and service rejection. |
| Ownership and allocation | `src/Reservations/ReservationStore.cs:9` onward scopes insert/list/find/lock/update/outbox to validated ownership. `src/Reservations/Migrations/001_initial.sql:13` retains global equipment/interval exclusion. Cancellation retains transactional idempotence and history. Ownership/concurrency tests assert foreign/unknown equivalence and zero unauthorized effects. |
| Notifications | Validated stable keys cross outbox/envelope/inbox boundaries; inbox queries are owner-scoped. Public isolation tests and real broker/restart tests cover delayed, repeated and interrupted delivery without browser credentials. |
| Browser lifecycle | Memory-only adapter authority, bounded refresh, generation checks, cross-tab clearing and cancelled subscriptions prevent previous-account responses from restoring data. Writes are never automatically replayed; uncertain outcomes direct users to owned history. Rendered and actual-provider browser evidence covers these boundaries. |
| Internal HTTP | Dedicated Inventory-only credentials, bounded single-flight acquisition, safe failure waves, exact target checking and no browser bearer forwarding are implemented and tested. Failed acquisition leaves reservation/outbox state unchanged. |
| Broker provisioning | Guarded run-mode core import, exact runtime ACLs, protected files, bounded readiness and Development-only management retain the approved administration boundary. Actual tests cover allowed/denied operations, protected runtime/staging files, failed import and durable restart. |
| Engineering | Generated JSON contracts and logging, parameterized SQL, production instrumentation, bounded retries/cancellation and existing architecture are retained. No new suppressions or removal-only tests were identified. Configuration-generator opt-in is the exception recorded above. |
| Documentation and scope | README explains provisioning, individual secret retrieval, exact allocated issuer, logout/token distinction, local-only import and recovery. No migration, automatic operator reset, compatibility layer or production identity deployment was introduced. |

## Existing finding closures

### DESIGN-006-001 — Quality runtime closure approved

The original unconditional management-HTTP dependency is removed.

- `src/AppHost/Program.cs:81` guards container-file preparation with run mode.
- Management plugin exposure is guarded by run mode **and Development**.
- Worker credentials retain their exact vhost/resource authority.
- `tests/Smoke.Tests/BrokerImportTests.cs:13` verifies retained credentials, grants, protected files and durable data across boot.
- `BrokerImportTests.cs:85` inspects actual AppHost-injected files/staging.
- `BrokerImportTests.cs:105` verifies malformed/unreadable import blocks the worker without sensitive diagnostics.
- `tests/Smoke.Tests/BrokerPublicationTests.cs:14` checks symbolic worker secrets, no callback and no administrative HTTP endpoint in publish mode.
- Final recorded smoke validation passes all 94 cases.

This closes the finding from quality review; independent security closure remains separately owned.

### CODE-006-001 — Quality closure approved

The repair is bounded to the confirmed framework diagnostic categories.

- `src/ServiceDefaults/Extensions.cs:45` and `:46` apply minimum Warning to XmlKeyManager and JwtBearerHandler, retaining warnings/errors.
- Generated safe authentication outcomes and native dependency tracing remain enabled.
- `tests/Backend.Tests/TelemetryPrivacyTests.cs:70` requires invalid-issuer 401, safe unauthorized logging, no raw exported exception and zero durable effects.
- Existing console/export/path/query/body privacy assertions remain.
- Actual-provider telemetry tests include ID-token rejection and sensitive-value scans.
- Targeted 12/12 and final backend 317/317/full-check passes establish repair evidence.

Closure covers the observed disclosure paths; it is not an assertion that every unexpected framework failure has been exhaustively exercised.

## Validation evidence and scope

Recorded final-source results:

| Check | Result |
|---|---|
| Format-check, session 13402 | Pass |
| Lint, session 40414 | Pass; zero build warnings/errors |
| Suggestion-level C# style, session 82846 | Pass |
| Full repository check, session 84386 | Pass: 4 tooling, 60 frontend, 317 backend, 94 smoke; zero failures/skips |
| Actual-provider browser, session 65844 | 18/18; axe passed |
| Three fresh AppHosts | Passed retained issuer, identities, secrets, ownership and pending-message persistence |
| Production HTTP-registration mutation | Expected failure when tracing registration removed; restored registration verified and passed |

Browser/manual/runtime evidence identifies its earlier exact snapshot. Subsequent production changes affect migration telemetry admission and bounded framework logging filters; UI/session behavior is unchanged. The final backend/provider/full checks revalidate those changes. Repeating browser evidence is not necessary solely for these scoped edits.

Manual evidence is agent visual/keyboard inspection, not human screen-reader audio verification. Runtime trace evidence records representative provider HTTP, Inventory, SQL and asynchronous broker/inbox relationships.

## Completion state and limits

T001–T039 are marked complete; this review identifies one remaining standards repair. T040–T042 correctly remain pending independent approval, convergence and explicit human acceptance. Scope confirmation is not acceptance.

**Reviewer changes:** none.  
**Reviewer checks:** read-only source/artifact inspection, 284-file hash verification and `git diff --check` passed. Application checks were inspected as coordinator-recorded evidence, not rerun by this reviewer.

After QUAL-006-001 repair, freeze the new snapshot and obtain targeted closure plus affected revalidation. No merge, deployment, publication or final acceptance is authorized by this report.
