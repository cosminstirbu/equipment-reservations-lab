# Codex + Spec Kit: six-agent feature team

Source formatting and linting are configured repository-wide. See [the engineering guide](docs/engineering/formatting-and-linting.md) for installation, per-edit hooks and editor setup. From the repository root, use `npm ci`, `npm run format`, `npm run lint`, and `npm run check`; the full check requires frontend dependencies and running Podman. .NET IDE suggestions are included, not just compiler/CA warnings.

A repository starter kit for a coordinated requirements → design → implementation → independent quality/security review loop. Includes six role definitions, coordinator policy, prompts and state/report templates. The primary Codex session coordinates five specialist subagents.

This is a prompt-driven starter, not an executable autonomous workflow engine. JSON records and completion gates are maintained by the coordinator; no scheduler or validation runner is bundled. Spec Kit itself is installed separately. Models and reasoning effort inherit your Codex settings.

## Prerequisites

- A current Codex installation with project custom agents/subagents support, signed in and able to run in your repository.
- uv and the Specify CLI, plus the repository's own build/test dependencies.
- A repository where you can edit project configuration. These files should be installed in your actual code repository, not a read-only synced reference directory.

## Bootstrap a new project

```bash
uv tool install specify-cli
specify init my-project --integration codex
cd my-project
```
Then copy this package's `.codex/agents/` and `docs/agent-team/` into that repository. Hidden `.codex` files must be included.

Merge the supplied AGENTS.md into your existing repository instructions. Merge the `[agents]` section of `.codex/config.toml` into your existing configuration; do not create duplicate sections or overwrite unrelated settings. The supplied setting allows five concurrent spawned threads, excluding the primary coordinator. Close completed agent threads to free capacity.

## Bootstrap an existing project
First follow Spec Kit's existing-project guide linked below. From your repository, initialize if Spec Kit is absent:

```bash
specify init . --integration codex
```
If Spec Kit is already initialized with another integration:

```bash
specify integration install codex
specify integration use codex
```
Inspect existing configuration and integration state first. Install and merge this package as described above. Preserve existing AGENTS.md, agent definitions and configuration; resolve name conflicts intentionally.

## First run

1. Customize protocol defaults: security blocking thresholds, repair budget, required checks and human acceptance. Record project principles using `$speckit-constitution` with your intended principles. This is a Codex chat skill invocation, not a terminal command.
2. Open/restart Codex in the repository after adding configuration. Confirm the installed Spec Kit skills and six custom role definitions are recognized. If not, check your Codex version and the official documentation; older releases may use different configuration formats. Do not assume these files are portable across all historical releases.
3. Paste `docs/agent-team/start-feature-prompt.md` into the primary session and fill its placeholders. This explicitly authorizes specialist delegation. The coordinator definition is also supplied as a reusable role, but the normal flow reads its instructions in the primary session instead of adding a sixth subagent.
4. The coordinator creates feature-local `team/` state only after Spec Kit creates/resolves the feature directory. Keep review records with that feature; never edit the template copies as live state.
5. Answer product questions as needed. On interruption use `resume-feature-prompt.md` with the exact feature directory.

## Roles and command ownership

| Role | Responsibility |
|---|---|
| coordinator | State, routing, validation runs and convergence |
| requirements_analyst | specify and clarify |
| architect_planner | plan and tasks |
| coder | implement and code repairs |
| verifier_reviewer | analyze, proposed checklists, acceptance and code review |
| security_reviewer | Threat/design review and implementation security review |

Read-only reviewers return reports; the coordinator writes them. The verifier cannot execute checklist generation or convergence directly because those can write artifacts. The coordinator materializes custom checklists and records only the verifier's explicit evaluations. The coordinator runs converge after implementation. The built-in requirements checklist remains maintained by specify/clarify.

Constitution is a project-policy operation; taskstoissues is optional external tracking and requires separate authorization. Neither runs automatically each repair round.

## Completion and intervention
Done requires passing required checks, acceptance evidence, complete tasks, no blocking quality/security findings, clean convergence and consistent artifacts on the reviewed revision. An agent's confidence or checked task list alone is insufficient.

Three preparation repairs and three implementation repairs are allowed by default. Two recurrences without progress trigger intervention. Missing business decisions and unavailable required checks also prevent completion. The final report must distinguish done from needs_intervention and include accepted residual risks.

## Permissions and concurrency
Planning/coding agents have workspace-write defaults; reviewers have read-only defaults. These settings do not enforce per-file ownership, and parent runtime permission overrides can affect spawned agents. Keep the parent permission configuration appropriate and verify reviewer behavior. Check execution requiring generated files is performed by the coordinator/coder, with results sent to reviewers.

Freeze code while reviewers inspect a revision. Run independent reviews in parallel; keep dependent phases sequential. Use separate worktrees and explicit ownership if you later parallelize code edits. Verify active feature state rather than inferring it from a Git branch. No merges, deployments, external messages or issue creation are authorized by the starter prompt.

## Contents

- `.codex/agents/*.toml`: six custom agents
- `.codex/config.toml`: configuration section to merge
- `AGENTS.md`: repository instructions to merge
- `docs/agent-team/protocol.md`: loops, ownership, gates and stop conditions
- `docs/agent-team/*-feature-prompt.md`: start/resume prompts
- `docs/agent-team/templates/`: empty state, finding example and report template

## References and compatibility
Configuration checked against official docs on 2026-10-13. The coordination protocol is a proposed team policy, not built-in Spec Kit behavior.

- [Codex custom agents and settings](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Spec Kit integrations and Codex skill invocation](https://github.github.io/spec-kit/reference/integrations.html)
- [Spec Kit command behavior](https://github.github.io/spec-kit/reference/agentic-sdd.html)
- [Existing-project adoption](https://github.github.io/spec-kit/guides/existing-projects.html)
- [Spec Kit workflows for future automation](https://github.github.io/spec-kit/reference/workflows.html)

The package was checked for TOML/JSON syntax and ZIP integrity. End-to-end execution against your Codex installation and application is still required.

## Equipment reservations application

The application extends the walking skeleton with persistent booking,
cancellation and an asynchronous notification inbox. It uses Angular 22.2.2,
TypeScript 6.0.3, RxJS 7.8.2, .NET SDK 10.0.301 / C# 14, Aspire 13.6.1, RabbitMQ
4.3.6 and RabbitMQ.Client 7.2.2. OpenTelemetry exporter 1.19.1 and
instrumentation 1.19.0 provide local telemetry. Dependency versions are pinned
with npm and NuGet lockfiles. Tested prerequisites are Node 24.15.0 / npm
11.12.1, Aspire CLI 13.6.1 and Podman 6.0.2 with its machine running.

From a fresh checkout, install those prerequisites, start the Podman machine,
then run this single local startup procedure from the repository root:

```sh
export ASPIRE_CONTAINER_RUNTIME=podman
dotnet run --project src/AppHost
```

First startup needs network access for NuGet/npm restore and the PostgreSQL 18.6
and RabbitMQ images. Aspire installs the client with `npm ci`, starts
PostgreSQL, RabbitMQ, three services and the database bootstrap, and provides
the Web resource link in its token-protected dashboard. Use the printed loopback
resource links; service ports are allocated dynamically. The local launch
profile explicitly permits HTTP transport on loopback for the demo dashboard and
telemetry; dashboard token authentication remains enabled. Five secret
parameters (`postgres-password`, `inventory-password`, `reservations-password`,
`notifications-password`, `broker-password`) are generated automatically on
first startup and persisted by Aspire in the AppHost user-secrets store outside
Git. Ordinary startup reuses them. Do not delete that store or change a password
independently of its existing database/broker volume. No committed plaintext
password file or manual password setup is required. Normal generated-secret
setup uses `AddParameter(..., secret: true, persist: true)` and the AppHost
`UserSecretsId`; it does not require reading passwords into the browser. Keep
dashboard access tokens and connection strings private. All resource listeners
are loopback and intended exclusively for a trusted local workstation.

Open Web. Inventory seeds operational **Demo Camera**, operational **Demo
Laptop** and non-operational **Demo Projector**. Bootstrap creates separately
credentialed `inventory`, `reservations` and `notifications` databases and
applies versioned, checksummed transactional migrations. Repeated bootstrap
preserves existing equipment and reservations rather than duplicating or
overwriting seeds. Each service receives only its own database role
(`inventory_app`, `reservations_app` or `notifications_app`); it cannot connect
to the other service databases or the administrative `postgres`/`template1`
databases. Bootstrap alone receives the administrator connection. Applied
migration SQL must not be edited: checksum mismatch fails startup rather than
silently changing the existing schema; add a new numbered migration for
subsequent changes.

Choose equipment and future start/end times. The browser displays its IANA
timezone and UTC offsets. A repeated daylight-saving time requires an explicit
offset; a nonexistent local time is rejected. API/event instants are explicit
UTC, finite, with at most six fractional digits; stored intervals use
microsecond precision. **Check availability** is advisory. **Book equipment**
atomically stores Confirmed state and one stable confirmation event, with
PostgreSQL preventing overlapping Confirmed intervals. Adjacent intervals are
allowed. The fixed visible identity is `demo-user`.

Use **Refresh reservations** to view history. Cancel a future Confirmed
reservation to retain Cancelled history and release the interval. Repeated
cancellation returns the same cancellation timestamp/event, including after its
original start. A Confirmed reservation at or after its start cannot be
cancelled. Refresh history after an uncertain write response before deliberately
trying again.

Saved reservation state is independent of asynchronous delivery. **Refresh
notifications** explicitly reads the durable inbox; only a matching event ID
means the notification was observed. Missing entries display **not yet
observed**. There is no automatic booking retry or reservation/inbox browser
polling.

The **Connectivity demo** link preserves the hello walking skeleton: the screen
displays Demo Camera; press **Send hello**. Reservations verifies Inventory, confirms
broker publication and returns a new correlation ID. Angular polls that ID and
displays **Hello received for Demo Camera**. Each deliberate send has a distinct
ID. Hello results retain their original bounded, transient memory contract.

### Verification

The startup procedure above installs Web dependencies through Aspire. Repository
quality commands additionally require the root tooling dependencies. For macOS
Podman, expose its Docker-compatible socket to Testcontainers; the socket path
is read from the running machine rather than hard-coded:

```sh
npm ci
export ASPIRE_CONTAINER_RUNTIME=podman
export DOCKER_HOST="unix://$(podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}')"
```

On rootless Podman where the Ryuk cleanup container cannot run, the verified
local check environment uses `TESTCONTAINERS_RYUK_DISABLED=true`; test fixtures
explicitly dispose their isolated containers and test-owned volumes. Use that
setting only for this runtime requirement, not to report skipped tests as
passing.

```sh
npm run format-check
npm run lint
npm run check
```

The full check includes frontend build/rendered tests and all .NET suites. For
focused checks and dependency inspection:

```sh
dotnet build
dotnet test tests/Backend.Tests -m:1
dotnet test tests/Smoke.Tests -m:1
npm --prefix src/Web ci
npm --prefix src/Web run build
npm --prefix src/Web test
npm --prefix src/Web audit
```

Backend tests exercise public HTTP behavior with real isolated PostgreSQL
databases and production migrations; external HTTP/broker doubles are backed by
provider contracts. Database concurrency tests send competing public requests to
verify the exclusion constraint. Tests control time for date/cancellation rules.
Rendered Angular tests exercise user actions, deadlines, cancellation and axe
accessibility checks. Smoke tests start isolated AppHost processes and actual
PostgreSQL/RabbitMQ, verify the full hello path and correlation, exercise broker
contracts and use fresh AppHosts with test-owned named volumes to check durable
state and queued-event recovery. These tests do not reset the normal application
volumes. Missing runtime/dependencies fail the check; they are never skipped.

With the application running, browser verification requires Playwright Chromium
(`npx --prefix src/Web playwright install chromium`) or an installed
Chromium-based browser. Set `API_WEB_URL` to the printed Web resource URL. For
example, on macOS with Microsoft Edge installed:

```sh
export API_WEB_URL='<printed loopback Web URL>'
export BROWSER_EXECUTABLE='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
npm --prefix src/Web run test:browser
```

The browser suite starts an isolated browser, verifies real booking/conflict,
cancellation/rebooking and explicit inbox observation, preserves two distinct
hello keyboard sends, and runs axe with color contrast enabled. Separate tests
hold or replace HTTP boundaries to inspect loading, empty, pending, validation
and error accessibility; those checks do not establish broker connectivity.
Hostile alias and opaque-origin browser tests require actual server 403
responses and unchanged durable history. Test-created future bookings are
deliberately cancelled afterward; their retained history is expected demo data.
Native keyboard/focus review remains a separate human acceptance check.

### Persistence and recovery

The exact production Podman named volumes are:

- `equipment-reservations-postgres`: equipment, reservations, outbox and inbox.
- `equipment-reservations-rabbitmq`: durable reservation topology and persistent
  queued reservation messages.

Ordinary service, broker and AppHost restarts reuse those volumes and stable
secret parameters. Booking/cancellation commit while the broker is unavailable.
After actual broker/consumer readiness returns, bounded three-attempt retry
bursts with jitter and scheduled cycles at most ten seconds apart recover
delivery; confirmation and cancellation use their original event IDs. Publisher
confirms precede the Published marker. Consumer database commit precedes ACK,
and EventId deduplication protects crash-window redelivery. The durable
reservation queue has no TTL or dropping capacity policy. API readiness excludes
broker worker readiness; check `/health/workers` separately when diagnosing
delivery.

Known permanent publication contract/configuration errors remain unpublished and
are parked at finite UTC `9999-12-31T23:59:59.999999Z`. They do not retry on
normal cycles or worker restart. Repair the underlying fault first. Then use the
**Reservations-only** credential privately to reschedule exactly the identified,
still-unpublished EventId. For example, with an installed `psql` client, use the
actual printed PostgreSQL loopback port, the own role and an interactive
password prompt. Obtain the Reservations role password privately from the local
AppHost secret/configuration store; do not print it in shared logs or pass a
connection string containing it as a process argument:

```sh
PGHOST=127.0.0.1 PGPORT='<PostgreSQL loopback port>' PGDATABASE=reservations PGUSER=reservations_app psql -W -v event_id='<identified EventId>'
```

```sql
BEGIN;
UPDATE reservation_outbox
SET next_attempt_at = CURRENT_TIMESTAMP
WHERE event_id = :'event_id'::uuid
  AND published_at IS NULL
  AND next_attempt_at = TIMESTAMPTZ '9999-12-31T23:59:59.999999Z'
RETURNING event_id;
```

Verify the returned EventId equals the explicitly selected EventId and there is
exactly one returned row plus `UPDATE 1` before issuing `COMMIT;`. If zero rows
or an unexpected result, issue `ROLLBACK;` and inspect the selected event. Keep
the transaction open only while checking this result.

Only scheduling metadata changes. Never replace the event ID/payload, mark an
unconfirmed event Published, broaden the predicate, or reset all pending events.
The next due worker cycle resumes after this selected reset. Keep credentials
out of shell history, source, shared terminal output and screenshots. If host
`psql` is unavailable, use the PostgreSQL image's client with the same
own-role/TCP authentication and privately supplied credentials.

A known permanent own-database authentication/permission/schema/catalog failure
stops the affected worker when it cannot select/update its outbox. The row
remains unchanged; do not assume inaccessible events were parked. Repair
configuration, privileges or schema, then explicitly restart Reservations.
Permanent consumer broker/database configuration failure similarly requires
repair and a Notifications restart. An unACKed delivery remains queued and
deduplicates after repaired restart. Transient database/transport failures and
uncertain publication outcomes continue bounded recovery without a
permanent-event reset.

**Destructive reset is separate from ordinary startup.** Stop AppHost,
explicitly decide to erase demo state, inspect the exact named volumes, then
remove only these two volumes and restart using the same persisted secrets:

```sh
podman volume inspect equipment-reservations-postgres equipment-reservations-rabbitmq
podman volume rm equipment-reservations-postgres equipment-reservations-rabbitmq
```

This erases equipment changes, reservation history, outbox/inbox events and
queued messages. The next startup provisions fresh databases/seeds. Do not add
`--force`, prune other volumes, delete the user-secrets store or run these
commands while AppHost is using the volumes. No reset runs automatically.
Automated persistence tests use separate randomly named test-owned volumes and
clean them up after their AppHosts stop.

Application JSON contracts, structured logs and supported constant patterns use
.NET source generators; see [ASP.NET Core
standards](docs/engineering/aspnet-core.md). Follow exact-file formatting after
edits and the suggestion-level analyzer gates in [formatting and
linting](docs/engineering/formatting-and-linting.md). Generator, compiler and
analyzer diagnostics are checked rather than suppressed.

### Troubleshooting and local security limits

If Podman is unavailable, start its machine (`podman machine start`) and rerun.
Inspect the Aspire resource readiness and logs for restore, port, or dependency
failures. Inventory validation and broker publication have three-second budgets;
client calls have five seconds. Only the legacy hello notification lookup polls:
every 500 ms for at most 30 seconds and stops at success, failure or component
destruction. Errors stay visible and a new send is a deliberate action.

Reservation APIs have eight-second request budgets. Outbox publication has three
seconds, consumer setup/database calls five seconds and ACK three seconds. Safe
outcome/dependency metrics and correlated W3C workflow/event spans distinguish
saved state from delivery. Pending-outbox count/oldest age includes unpublished
parked events. Metric dimensions are bounded operation/dependency/outcome
values; event/reservation IDs may correlate traces/logs, never metric tags.
Database command spans come from native Npgsql instrumentation and include API,
outbox/inbox, health, migrations and administrative provisioning operations.
Reviewed SQL text is enabled by default locally: placeholders remain intact,
parameter values and results are excluded, and administrative provisioning SQL
is always omitted. Set `DatabaseTracing:CaptureSqlText=false` in each service's
and bootstrap's configuration (environment `DatabaseTracing__CaptureSqlText=false`)
to retain operation spans without SQL text. Restart the affected processes after
changing this setting.

SQL admission uses exact shared command templates. Review a whole changed/new
statement before adding its descriptor; unknown statements retain generic spans
without text. Embedded scripts additionally require a reviewed resource name and
matching SHA-256 digest in the owning `ServiceMigrations` class. Never update a
digest merely to clear a test: review script literals under the telemetry policy.
Native internal transaction messages do not promise separate BEGIN/COMMIT/ROLLBACK
spans; each executed application command remains visible. See the
[database tracing validation guide](specs/003-database-tracing/quickstart.md).

Dashboard diagnostic retention is separate from application persistence; export
the intended run’s evidence before ending validation and keep diagnostic files
private. For actual metrics export, use dashboard Settings → Resource logs and
telemetry → Manage, expand the relevant resources, select only Metrics, then
Export selected. Keep resource configuration exports private because they can
contain credentials.

Hello retains its original policy: after a hello broker outage restart AppHost;
automatic hello retries are disabled. A hello publish-confirm timeout is
uncertain and does not automatically resend. Notifications keeps at most 1,000
hello results and expires them after five minutes. Restarting Notifications
clears hello results. Hello messages are nonpersistent; reservation
persistence/replay does not extend the hello contract.

This remains a single-user trusted-workstation demo with no authentication,
authorization, tenant/user isolation, identity provider, approval workflow, real
external notification or production deployment. Canonical HTTP(S) loopback
browser origins (`localhost`, `127.0.0.1`, `[::1]`) on any valid local port are
trusted; this is not isolation from other local applications. Reservations
POSTs, including hello, reject hostile/null Origin and originless browser
metadata with safe 403. Direct local CLI JSON writes without browser metadata
remain supported. Booking creation requires `application/json` with UTF-8. Proxy
requests preserve Origin/Host; CORS read restrictions alone are not the write
guard. Do not expose this demo to a shared network or use it with personal data.