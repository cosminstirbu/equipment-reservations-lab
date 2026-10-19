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
4.3.6, RabbitMQ.Client 7.2.2, Keycloak 26.8.1 and keycloak-js 26.2.4. OpenTelemetry exporter 1.19.1 and
instrumentation 1.19.0 provide local telemetry. Dependency versions are pinned
with npm and NuGet lockfiles. Tested prerequisites are Node 24.15.0 / npm
11.12.1, Aspire CLI 13.6.1 and Podman 6.0.2 with its machine running.

From a fresh checkout, install those prerequisites, start the Podman machine,
then run this single local startup procedure from the repository root:

```sh
export ASPIRE_CONTAINER_RUNTIME=podman
dotnet run --project src/AppHost
```

First startup needs network access for NuGet/npm restore and the PostgreSQL 18.6,
RabbitMQ and Keycloak images. Aspire installs the client with `npm ci`, starts
PostgreSQL, RabbitMQ, persistent Keycloak, three services and identity/database provisioning, and provides
the Web resource link in its token-protected dashboard. Use the printed loopback
resource links; service ports are allocated dynamically. The local launch
profile explicitly permits HTTP transport on loopback for the demo dashboard and
telemetry; dashboard token authentication remains enabled. Secret
parameters (`postgres-password`, `inventory-password`, `reservations-password`,
`notifications-password`, `broker-password`, `reservations-broker-password`,
`notifications-broker-password`, `broker-admin-salt`, `reservations-broker-salt`,
`notifications-broker-salt`, `identity-admin-password`, `employee-a-password`,
`employee-b-password`, `approver-password`, `equipment-staff-password`,
`reservations-client-secret`) are generated automatically on
first startup and persisted by Aspire in the AppHost user-secrets store outside
Git. Ordinary startup reuses them. Do not delete that store or change a password
independently of its existing database/broker volume. No committed plaintext
password file or manual password setup is required. Normal generated-secret
setup uses `AddParameter(..., secret: true, persist: true)` and the AppHost
`UserSecretsId`; application startup reuses them without manual entry. Keep
dashboard access tokens and connection strings private. All resource listeners
are loopback and intended exclusively for a trusted local workstation.

The provider uses stable configurable `IdentityPort` (default 18080). Read its
actual complete issuer from `/auth-config.json` or the current identity resource:
Aspire-managed developer TLS can promote its endpoint named `http` to HTTPS.
Keep the exact scheme, loopback hostname, port and `/realms/equipment` issuer
unchanged across ordinary restarts. Browser, provider and APIs use that same
issuer; changing it creates a different identity environment. Trust the local
development certificate normally; do not disable certificate or issuer checks.

Open Web and choose **Sign in**. These generated local accounts have independent
roles; Approver and EquipmentStaff do not imply Employee:

| Username | Role | Available actions |
|---|---|---|
| employee-a | Employee | Equipment, advisory availability, own reservations/cancellation and inbox |
| employee-b | Employee | Same actions, isolated from employee-a |
| approver | Approver | Equipment, advisory availability and own inbox |
| equipment-staff | EquipmentStaff | Equipment, advisory availability and own inbox |

Retrieve only the intended account's password in a private local terminal:

```sh
aspire secret get Parameters:employee-a-password --apphost src/AppHost/AppHost.csproj --non-interactive --nologo
```

Substitute `employee-b-password`, `approver-password` or `equipment-staff-password`
for the other accounts. This targets the ordinary AppHost store; CLI `--isolated`
runs use their own per-run store. Do not bulk-list secrets, paste passwords into
shared output or put them in command arguments, source or screenshots. Identity
administration and service credentials belong only to their provisioning/service
resources. There is no registration or password-recovery feature.

Open Web. Inventory seeds operational **Demo Camera**, operational **Demo
Laptop** and non-operational **Demo Projector**. Bootstrap creates separately
credentialed `inventory`, `reservations` and `notifications` databases and
applies versioned, checksummed transactional migrations. Repeated bootstrap
preserves existing equipment and reservations rather than duplicating or
overwriting seeds. Each service receives only its own database role
(`inventory_app`, `reservations_app` or `notifications_app`); it cannot connect
to the other service databases or the administrative `postgres`/`template1`
databases. Bootstrap and the local pgAdmin console receive administrator access;
application services retain their separate restricted roles. Applied
migration SQL must not be edited: checksum mismatch fails startup rather than
silently changing the existing schema; add a new numbered migration for
subsequent changes.

### Local administration consoles

In Development run mode, ordinary AppHost startup also enables RabbitMQ
Management and pgAdmin (image `dpage/pgadmin4:9.18.0`). Open the current HTTP
link on **messaging** for RabbitMQ or **pgadmin** for pgAdmin in the Aspire
dashboard. Both use dynamically
allocated ports; use the current links after each startup. They are enabled only for local Development run mode. No data-volume reset or
separate startup flag is needed.

RabbitMQ uses its normal sign-in page. Its default username is `guest`; obtain
the existing `broker-password` privately from the AppHost user-secrets store
(`UserSecretsId` in `src/AppHost/AppHost.csproj`) or reveal that parameter in
your private Aspire dashboard session. Do not copy credentials into source,
URLs, shell arguments/history, shared logs or screenshots. Do not change the
persisted password independently of the broker volume. Management supports
inspection of queues, exchanges, bindings, consumers and messages, test-message
publication/get and queue purging.

pgAdmin opens without a separate console login and automatically registers the
existing PostgreSQL server with administrator credentials. Expand its server
and **Databases** to browse `inventory`, `reservations` and `notifications`;
use **Query Tool** for SQL. Administrator access permits edits, schema changes
and deletion across all three databases. RabbitMQ management likewise permits
destructive queue/message operations. Prefer uniquely named disposable objects
when experimenting and deliberately select the intended database or queue.

These interfaces are restricted to loopback, including their backing host
ports. The dashboard token does not protect their direct URLs; local OS users
and containers on the local Aspire network remain trusted. Keep them on this
computer without tunnels or LAN forwarding. pgAdmin preferences, saved queries
and UI history are disposable when its container is recreated; Aspire
regenerates the automatic connection. Existing PostgreSQL and RabbitMQ data
remain in their original named volumes.

Choose equipment and future start/end times. The browser displays its IANA
timezone and UTC offsets. A repeated daylight-saving time requires an explicit
offset; a nonexistent local time is rejected. API/event instants are explicit
UTC, finite, with at most six fractional digits; stored intervals use
microsecond precision. **Check availability** is advisory. **Book equipment**
atomically stores Confirmed state and one stable confirmation event, with
PostgreSQL preventing overlapping Confirmed intervals. Adjacent intervals are
allowed. Employee reservation history and cancellation use only the validated
current account; foreign and unknown reservation IDs return the same 404.
All human roles can read boolean advisory availability without owner details.

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

Sign-out, expiry and account changes immediately clear private browser state and
cancel pending work. Access, refresh and ID tokens remain in adapter memory;
they are not stored in browser storage. Code+PKCE callbacks are cleaned. Already
issued API access tokens may remain valid for at most 125 seconds after issuance
(120-second lifetime plus 5-second skew); sign-out does not revoke them instantly.
Provider logout failure leaves local state cleared and presents an explicit
retry. Sign in again and refresh owned history after an uncertain write; the
application never replays it automatically. Public configuration contains only
issuer, realm and public client ID, never a client secret.

Reservations acquires its own Inventory-only service bearer using client
credentials; it never forwards the human token. Acquisition is bounded at two
seconds inside the three-second Inventory budget, coalesces concurrent requests,
refreshes before expiry and fails safely without a cached expired fallback or
automatic token POST retry. Failed acquisition creates no reservation/outbox row.

RabbitMQ runtime users are separate from administration: `reservations-publisher`
can write only exchange `reservations`; `notifications-consumer` can read only
queue `reservation-notifications`, both only in vhost `equipment`. Neither can
configure topology, use default/unrelated exchanges, use other vhosts or access
management. Run-mode protected core definitions prepare durable topology and
stable salted credentials before broker boot; file owner/group 999, files 0600
and new directories 0700. Readiness forces exact-account channel handshakes and
administrator passive topology checks under a bounded startup budget.
Invalid/unreadable definitions block workers with safe failure diagnostics.
Do not broaden ACLs or enable management outside Development as recovery.
Aspire is used only for local development. Manifest generation and cloud deployment
are outside the supported testing policy.

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

The full check includes frontend build/rendered tests and all nine backend test projects. For
focused checks and dependency inspection:

```sh
dotnet build
dotnet test --solution EquipmentReservation.slnx --max-parallel-test-modules 9
dotnet test --project tests/Reservations.Tests/Reservations.Tests.csproj
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
accessibility checks. The backend projects also exercise real RabbitMQ and Keycloak
contracts, correlated private-safe telemetry, scoped provider permissions and
cross-service recovery. Separate WebApplicationFactory service hosts retain the
production authentication/service-token pipeline; Testcontainers supplies isolated
providers. Tests recreate hosts with the same durable state and restart real
providers to verify pending/queued-event recovery. They never construct, inspect,
start or publish Aspire, and never reset normal application volumes. MTP allows
all test projects to run concurrently in the quality gate, with uncapped parallel
test cases per project. Sequential execution is reserved for hard documented
constraints at the smallest justified scope; see the
[parallelism rules](docs/engineering/testing.md#backend-parallelism-is-the-default).
Missing runtime/dependencies fail the check; they are never skipped.

With the application running, browser verification requires Playwright Chromium
(`npx --prefix src/Web playwright install chromium`) or an installed
Chromium-based browser. Set `API_WEB_URL` to the printed Web resource URL. For
example, on macOS with Microsoft Edge installed:

```sh
export API_WEB_URL='<printed loopback Web URL>'
export IDENTITY_BROWSER_ACCOUNTS_FILE='<private mode0600 JSON fixture path>'
export BROWSER_EXECUTABLE='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
npm --prefix src/Web run test:browser
```

The browser suite starts an isolated browser, verifies real booking/conflict,
cancellation/rebooking and explicit inbox observation, keyboard/focus behavior,
and runs axe with color contrast enabled. Separate tests
hold or replace HTTP boundaries to inspect loading, empty, pending, validation
and error accessibility; those checks do not establish broker connectivity.
Hostile alias and opaque-origin browser tests require actual server 403
responses and unchanged durable history. Test-created future bookings are
deliberately cancelled afterward; their retained history is expected demo data.
Native keyboard/focus review remains a separate human acceptance check.

The private JSON fixture maps exactly the four usernames above to their passwords
from the intended run. Create it locally with restrictive permissions using only
filtered individual retrieval; never commit or display it. Actual login screens
and code+PKCE are exercised, not browser password grants. Traces, screenshots and
videos are disabled to keep authority private. Tests hold tokens only in memory
and preserve authenticated hostile-origin write checks.

### Manual local-development check

Aspire startup, resource configuration and local console wiring are checked manually.
No automated AppHost or manifest-publication checks are required. Use the ordinary
startup procedure above with the same existing user secrets and named volumes; do not
replace them with fresh test state or erase them to obtain a passing observation.

1. Identify the exact `src/AppHost/AppHost.csproj` session and who owns it. Start a
   session only if needed; stop/restart only one you own. In the printed authenticated
   dashboard expect PostgreSQL/database bootstrap, RabbitMQ/broker bootstrap, Keycloak/
   identity bootstrap, Inventory, Reservations, Notifications and Web ready. Record
   failed resources with safe diagnostics rather than calling the check passed.
2. Open the current Web/API/dashboard links. Expect the normal login and equipment
   catalogue. Sign in with the intended private fixture account and verify booking,
   history and explicit inbox refresh. Never capture passwords, tokens or callbacks
   in shared logs/screenshots.
3. Open the current messaging-management and pgAdmin links. Expect RabbitMQ to reject
   unauthenticated administration and accept the existing privately retrieved broker
   credential; expect pgAdmin to open without a separate login and register the
   existing PostgreSQL server/databases. Before using password-free pgAdmin, inspect
   both current proxy/listener and backing container publications (for example,
   `podman port <exact-container-name>`); expect loopback addresses only. Record any
   unexpected non-loopback binding or failed access observation.
4. Record existing equipment edits, booking/history and observed inbox when available.
   Restart only your owned session using the same ordinary storage and secrets. Expect
   those observations and account identities to persist. If there is no existing state,
   use disposable sample data only when approved for this check; restore only its edit
   or remove only sample objects created by this procedure when appropriate, retaining
   normal booking history. Providers have separate automated outage/recovery coverage.
5. Stop only the session you started and record its actual stop result. Preserve
   ordinary volumes/secrets and other developers' sessions. Do not prune/reset data.

Record expected/actual observations, failed or unavailable steps, the tested revision
and cleanup. The [feature quickstart](specs/007-aspire-independent-tests/quickstart.md)
and [testing guide](docs/engineering/testing.md) describe this boundary and its
replacement coverage. Historical acceptance/review records apply to their original
revisions; the [supersession register](specs/007-aspire-independent-tests/supersession.md)
records the prospective policy change. Manifest generation is unsupported, with no
manual publishing step.

### Persistence and recovery

The exact production Podman named volumes are:

- `equipment-reservations-postgres`: equipment, reservations, outbox and inbox.
- `equipment-reservations-rabbitmq`: durable reservation topology and persistent
  queued reservation messages.
- `equipment-reservations-identity`: users, opaque subjects, roles and provider state.

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

**The owner performs the one-time early-project reset.** There is no migration
from the throwaway demo-user schema. Old schema/checksum mismatch fails startup
safely; neither application startup nor agents reset operator volumes. Stop
AppHost, explicitly decide to erase local state, inspect the exact named volumes,
then remove only these three volumes and restart using the same persisted secrets:

```sh
podman volume inspect equipment-reservations-postgres equipment-reservations-rabbitmq equipment-reservations-identity
podman volume rm equipment-reservations-postgres equipment-reservations-rabbitmq equipment-reservations-identity
```

This erases equipment changes, reservation history, outbox/inbox events and
queued messages and provider identities/subjects. The next startup provisions fresh
databases/seeds and accounts. Do not add
`--force`, prune other volumes, delete the user-secrets store or run these
commands while AppHost is using the volumes. No reset runs automatically.
Automated persistence tests use separate randomly named test-owned volumes and
clean them up after service hosts and providers are disposed.

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
client calls have five seconds. Booking errors stay visible; refresh saved
state before deliberately retrying an uncertain write.

Outbox workers use PostgreSQL `LISTEN`/`NOTIFY` as an advisory wake-up signal.
An insert-only statement trigger emits an empty notification after commit; event
contents remain in the durable outbox. Each worker leases one additional listener
connection, so five replicas need five additional connections. All replicas wake,
then existing `FOR UPDATE SKIP LOCKED` locks distribute rows; each replica publishes
one event at a time. Delivery remains at least once: an uncertain publication can
repeat with the same event ID, and consumers must retain duplicate suppression.

A healthy idle worker scans every 30 seconds as fallback for missed notifications,
removed triggers or manual row repairs. Persisted future retry deadlines wake it
sooner. Startup and reconnection establish listening before scanning existing work.
Temporary listener failure restores ten-second polling while independent reconnect
bursts use three bounded attempts with jittered 1s/2s delays, then ten seconds before
a fresh burst. Inserts/reconnection cannot shorten publication failure backoff.
Permanent database configuration failures halt the worker until repaired/restarted.
Listener setup and cleanup each have a three-second budget; shutdown explicitly
unregisters the channel before returning a healthy connection to its pool.
Disabled messaging starts no listener. Payloads, notifying process IDs and raw
provider errors are excluded from telemetry. The bounded wake-cause and listener
outcome metrics distinguish healthy notification operation from degraded polling.
Pending/oldest gauges refresh on scans and can lag 30 seconds while idle.
See [notification validation and evidence](specs/008-outbox-notifications/quickstart.md).

Reservation APIs have eight-second request budgets. Outbox publication has three
seconds, consumer setup/database calls five seconds and ACK three seconds. Safe
outcome/dependency metrics and correlated W3C workflow/event spans distinguish
saved state from delivery. Pending-outbox count/oldest age includes unpublished
parked events. Metric dimensions are bounded operation/dependency/outcome
values; event/reservation IDs may correlate traces/logs, never metric tags.
Provider discovery/JWKS, service-token and administration HTTP dependencies use
the production native HTTP instrumentation. URLs/query strings, headers, form
bodies, tokens, login codes, profile and provider session details are excluded.
Authentication/authorization and provider failures have bounded outcome signals;
broker file preparation/readiness emits local operation signals rather than
invented HTTP spans. Native Keycloak session-event/OTel export is disabled to
preserve privacy. Do not enable it or add token/claim logging for troubleshooting.
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

This remains a trusted-workstation application with local authenticated ownership
and explicit role checks. It has no approval workflow, real external notification
or production deployment. Canonical HTTP(S) loopback
browser origins (`localhost`, `127.0.0.1`, `[::1]`) on any valid local port are
trusted; this is not isolation from other local applications. Reservations
POSTs reject hostile/null Origin and originless browser
metadata with safe 403. Direct local CLI JSON writes without browser metadata
require a valid bearer and applicable role. Booking creation requires `application/json` with UTF-8. Proxy
requests preserve Origin/Host; CORS read restrictions alone are not the write
guard. Do not expose this demo to a shared network or use it with personal data.

Walking-skeleton retirement context is recorded separately in
[the history note](docs/history/hello-retirement.md). Historical feature evidence
describes its original reviewed revisions.
