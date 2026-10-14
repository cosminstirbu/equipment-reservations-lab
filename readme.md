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


## Feature 0: equipment hello application

The walking skeleton uses Angular 22.2.2, TypeScript 6.0.3, RxJS 7.8.2, .NET SDK
10.0.301 / C# 14, Aspire 13.6.1, RabbitMQ 4.3.6 and RabbitMQ.Client 7.2.2.
OpenTelemetry exporter 1.19.1 and instrumentation 1.19.0 provide local telemetry.
Dependency versions are pinned with npm and NuGet lockfiles. Tested prerequisites are
Node 24.15.0 / npm 11.12.1, Aspire CLI 13.6.1 and Podman 6.0.2 with its machine running.

From a fresh checkout, install those prerequisites, start the Podman machine, then
run this single local startup procedure from the repository root:

```sh
export ASPIRE_CONTAINER_RUNTIME=podman
dotnet run --project src/AppHost
```

First startup needs network access for NuGet/npm restore and the RabbitMQ image.
Aspire installs the client with `npm ci`, starts the ephemeral broker and three
services, and provides the Web resource link in its token-protected dashboard.
Use the printed loopback resource links; service ports are allocated dynamically.
The local launch profile explicitly permits HTTP transport on loopback for the
demo dashboard and telemetry; dashboard token authentication remains enabled.
Broker credentials are generated per run and never committed. Keep the dashboard
access token private. All resources are intended exclusively for a trusted local
workstation.

Open Web, wait for **Demo Camera**, then press **Send hello**. Angular gets its
single item from Inventory. Reservations verifies that equipment over direct HTTP,
confirms publication through RabbitMQ, and returns a new correlation ID.
Notifications consumes the event and stores a message; Angular polls by that ID
and displays **Hello received for Demo Camera** plus the ID. Another deliberate
send creates a distinct ID. Invalid equipment is rejected before publication.

### Verification

```sh
dotnet build
dotnet test tests/Backend.Tests
dotnet test tests/Smoke.Tests
npm --prefix src/Web ci
npm --prefix src/Web run build
npm --prefix src/Web test
npm --prefix src/Web audit
```

Backend tests exercise public HTTP behavior with controlled external boundaries.
Rendered Angular tests exercise user actions, deadlines, cancellation and axe
accessibility checks. Smoke tests start isolated AppHost processes and actual
RabbitMQ, verify the full hello path and correlation, and exercise broker contracts.
Missing runtime/dependencies fail the check; they are never skipped.

With the application running, browser verification requires Playwright Chromium
(`npx --prefix src/Web playwright install chromium`) or an installed Chromium-based
browser. Set `API_WEB_URL` to the printed Web resource URL. For example, on macOS
with Microsoft Edge installed:

```sh
export API_WEB_URL='<printed loopback Web URL>'
export BROWSER_EXECUTABLE='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
npm --prefix src/Web run test:browser
```

The browser suite starts an isolated browser, verifies the real journey through two
keyboard sends, and runs axe with color contrast enabled. Separate tests hold or
replace HTTP boundaries only to inspect loading, pending and error accessibility;
those tests are UI checks and do not establish broker connectivity.

### Troubleshooting and limits

If Podman is unavailable, start its machine (`podman machine start`) and rerun.
Inspect the Aspire resource readiness and logs for restore, port, or dependency
failures. Inventory requests and broker operations have three-second budgets;
client calls have five seconds. Notification polling runs every 500 ms for at most
30 seconds and stops at success, failure or component destruction. Errors stay
visible and a new send is a deliberate action.

After a broker outage restart AppHost: automatic retries and connection recovery
are intentionally disabled. A publish-confirm timeout has uncertain delivery;
the event may have arrived even though the request reports failure. A timeout does
not automatically resend it.

Notifications keeps at most 1,000 messages, evicts the oldest, and expires messages
after five minutes. Services keep no persistent application state. Restarting
Notifications clears its stored results; restarting AppHost/broker clears transient
broker state. RabbitMQ 4.3 uses a durable queue declaration for supported nonexclusive
queue metadata; messages are nonpersistent and the broker has no data volume. This
does not provide application persistence or replay. Local dashboard telemetry is
also transient. No replay or recovery
across restarts is promised.

This feature implements no reservations, authentication, authorization, identity
provider, database, migrations, outbox, deduplication, automatic retries, approvals,
real bookings or production deployment infrastructure. Deferred authentication is
an explicit local-only scope decision and is not an implemented security capability.
Do not expose this demo to a shared network or use it with personal data.
