# Validation Guide: Hello Retirement

Run from repository root with existing root/Web dependencies and pinned .NET SDK installed. Podman must be running for required real PostgreSQL/RabbitMQ tests. Do not reset local stores, rotate secrets or purge broker resources.

## Automated gates

1. Preserve baseline passing positive booking assertions during internal renaming. Owner-directed delta: remove absence-only HTTP/root/browser retirement tests; preserve previously recorded red evidence as historical and mark T005/T006 superseded. Verify removal through source/configuration/documentation inspection, not a new old-feature absence suite.
2. After each source edit run `npm run format -- <exact-edited-paths>` before reading/testing/editing that source again (trusted post-edit hooks can handle supported writes).
3. Run `npm run format-check`, `npm run lint`, `npm run check` and `git diff --check`; record exits and tested snapshot. These include tooling/frontend/backend and real infrastructure smoke checks. Do not treat unavailable Podman as a skip/pass.
4. Run the booking Playwright suite via `npm --prefix src/Web run test:browser` against a current AppHost Web endpoint, using environment `API_WEB_URL` and installed browser `BROWSER_EXECUTABLE` as described in README. Discover the endpoint; do not reuse historical ephemeral URLs. Check booking create/history/cancel/inbox, foreign-origin writes, keyboard/focus and axe.

## Running application

Use the existing README Aspire prerequisites/start instructions and exact AppHost `src/AppHost/AppHost.csproj`; lifecycle operations must follow aspire-orchestration skill and telemetry inspection must follow aspire-monitoring skill. Keep existing UserSecretsId and named persistent storage. Coordinate runtime ownership so tests do not stop a developer-owned AppHost.

- Inspect root template, removed client files, owning service route declarations and proxy mappings; record removal evidence without adding automated old-feature absence checks. The retired interface semantics remain in contracts/retirement.md.
- Open main Web endpoint and exercise the positive booking journey.
- Select operational camera, check a future interval, create, inspect history and durable inbox, cancel before start, then refresh. Conflicts and repeated cancellation retain existing behavior.
- Use isolated smoke fixtures for outage/restart and legacy resource preservation. Snapshot existing booking entries; prove they and pending events survive restart/recovery with one inbox entry per event. Preseed an isolated old hello queue/exchange/message and passively verify it stays unchanged and idle; never run destructive cleanup on developer data.

## Telemetry and audit

Inspect current exported/dashboard traces for booking and cancellation: request/workflow/database operations, publication/consumption context and inbox insert. Include a controlled dependency failure, health transition/recovery and safe structured outcome. Record trace IDs, operation coverage, safe tags/events and tested snapshot without credentials or bodies. Existing production registration/privacy regression tests must remain effective.

Audit active tracked source/tests/config/current docs for hello references; explain preserved secret ID, historical/retirement notes and intentional isolated state-preservation fixture references. Compare historical spec/review/hash files to baseline; original content must not change. Update concern-to-test mapping in implementation evidence.

Independent quality/security review, convergence and explicit completed-result owner acceptance are subsequent gates. Passing these commands alone does not authorize completion, merge, deployment or publication.
