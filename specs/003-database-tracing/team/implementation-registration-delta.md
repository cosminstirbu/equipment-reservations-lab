# AddNpgsql registration delta implementation

Assigned bounded tasks T028–T029 in `specs/003-database-tracing`; no requirements or privacy-policy change. Existing passing behavior tests retained under the constitution's behavior-preserving refactoring rule; no implementation-mirroring tests added.

## Scope and preservation

Replaced the sole production `.AddSource("Npgsql")` call with documented `.AddNpgsql()` at the same position after both privacy processors and before existing sources/instrumentation. Added `Npgsql.OpenTelemetry`10.0.3 only to ServiceDefaults. Generated dependency lockfiles updated transitively. Existing Npgsql10.0.3 and OpenTelemetry1.19.1 resolved versions/content hashes remain unchanged, verified against committed lockfile package entries.

Compared every production/test .cs file to the pre-delta hash baseline: ONLY Extensions.cs changed. In particular DatabaseTracing, DatabaseTelemetryPrivacyProcessor, bootstrap, stores, SQL scripts and test sources remain unchanged. No README change needed because its behavior/diagnostic instructions remain accurate. Coordinator owns design/doc delta artifacts and historical reports.

## Environment and commands

Real PostgreSQL18.6 through existing Testcontainers/Podman, environment `DOCKER_HOST=unix:///var/folders/6k/z9rq_rsj7gj5ghmy_rx43nzh0000gp/T/podman/podman-machine-default-api.sock TESTCONTAINERS_RYUK_DISABLED=true` for test commands.

- `dotnet restore EquipmentReservation.slnx -m:1`: PASS exit0, all projects up-to-date. Initial parallel sandbox restore stalled without output and was terminated after cancellation did not complete; this is not test/restore success evidence. A proposed elevated restore was aborted before returning a session. The fresh serial restore completed successfully with existing package/cache state and no overlap.
- Exact-file formatter ran immediately after each source/project edit and mutation/restoration; formatted files re-read.
- Existing focused filter `FullyQualifiedName~DatabaseTracingTests|FullyQualifiedName~DatabaseWorkerTracingTests|FullyQualifiedName~DatabaseBootstrapTracingTests|FullyQualifiedName~DatabaseTelemetryPrivacyTests` with `dotnet test tests/Backend.Tests --filter <filter> -m:1`: PASS18/18, zero skips, exit0, about9s. Exercises real API/worker/bootstrap, SQL policy/default/off, two exporters, safe failure/exception fields, correlation and bootstrap log correlation.

## Actual AddNpgsql removal mutation

Fresh-process command: test environment above, `dotnet test tests/Backend.Tests --filter FullyQualifiedName~EquipmentListExportsNativeDatabaseChildThroughProductionRegistration -m:1`.

Removed ONLY `.AddNpgsql()` while retaining exception recorder, privacy processors and all remaining registration. Intended red: HTTP200 and known workflow control/HTTP client/actual HTTP server spans still exported; expected Npgsql command span missing. Exit1,1failed. This confirms the production exception recorder does not activate native spans independently.

Restored exact bytes, formatted/re-read, and asserted identical Extensions.cs SHA-256 `e412d8900b35817eb9c7bbc0389aaea79c2fc816b83380c6ca7395af4612a29a`. Restored fresh-process regression PASS1/1, zero skipped, exit0 (about456ms).

## Delta file manifest

SHA-256 of ordered changed-file manifest `9658d66c144f99064d19b478fab2f9fca18500a8f59d25f88e8db95ad3c29324` relative to the pre-delta source/lockfile baseline:

```text
20482f29162ebdc7cfdb4e2fb974e2b3da266af4e2d59f5cf51934dcf7421f3a  src/DatabaseBootstrap/packages.lock.json
f3c6911990f409360d0b6a8d439dc8ee2a92983e9e079f04dd5a24096c62b4f3  src/Inventory/packages.lock.json
f3c6911990f409360d0b6a8d439dc8ee2a92983e9e079f04dd5a24096c62b4f3  src/Notifications/packages.lock.json
f3c6911990f409360d0b6a8d439dc8ee2a92983e9e079f04dd5a24096c62b4f3  src/Reservations/packages.lock.json
e412d8900b35817eb9c7bbc0389aaea79c2fc816b83380c6ca7395af4612a29a  src/ServiceDefaults/Extensions.cs
d7bb8bca890f455fe7d83e01352453198bfc5d2d2172db0b3d4b1caf91981db0  src/ServiceDefaults/ServiceDefaults.csproj
267ab5a31070367f145eca1bee88021da63756df14c8294afb5ee2a7cdd5147a  src/ServiceDefaults/packages.lock.json
ccad90738fb5d0b0f44e1a044186311b262d1af067fef72b5f1e63c52baec2b7  tests/Backend.Tests/packages.lock.json
f647ae6816fa67eb85090e3838ff2c1e2289bd08e520425d34bf8ca8b06fc299  tests/Smoke.Tests/packages.lock.json
```

Checklist gate requirements16/16 and observability-quality10/10, no unchecked items. No extension-hooks file exists. Coordinator owns updated runtime/independent review/convergence T030 and human acceptance T026; coder cannot approve those gates.

Compared all 250 entries in coordinator historical source manifest `79a1bbac6bb4e7ca3ebce3a70f8973fbe48150899aac32b51e5f0fc71f5de058`: only the same nine allowed source/project/lockfile paths differ. This verifies SQL scripts, policy/processor/bootstrap/store/test source and other application files remain byte-identical. Historical manifest was read only, not modified.

## Final validation after Codex restart — 2026-10-15

Tested frozen source snapshot `17d49d5e859ac45eaf5231448ccd629f73750ed2f04f6aa95c0381644cbe88c4` (250 files in `implementation-source-manifest.json`). No application, project, dependency or test files were edited during resumed validation. Earlier focused/mutation checks above were retained rather than repeated.

- `npm run format-check`: PASS exit0, persisted before restart. The full check also repeated its formatting gate successfully.
- `npm run lint`: PASS exit0 after restart; ESLint with zero warnings, full .NET build with 0 warnings and 0 errors, and suggestion-level IDE verification passed. The previous interrupted lint result was unknown and is not used as evidence.
- `env DOCKER_HOST=unix:///var/folders/6k/z9rq_rsj7gj5ghmy_rx43nzh0000gp/T/podman/podman-machine-default-api.sock TESTCONTAINERS_RYUK_DISABLED=true npm run check`: PASS exit0 outside the sandbox. Tooling4/4, Angular39/39, Backend229/229 (1m24s), real smoke45/45 (5m1s); zero skipped. Formatting, frontend build, static analysis and .NET build passed. The frontend emitted existing jsdom canvas-not-implemented notices without failing any test.
- The initial sandbox full-check attempt exited1 before tests because Roslyn's build-host named-pipe bind raised SocketException13 (permission denied). The exact command was retried with approved escalation; the successful complete run above supersedes this environment failure. No source repair or reduced test scope was used.
- `git diff --check`: PASS exit0.
- SHA-256 verification of all 250 frozen manifest entries: PASS, zero mismatches, both before and after the full check. The manifest was read only.

T029 automated validation is complete. Updated runtime verification, independent verdicts and convergence remain coordinator-owned T030; explicit human acceptance remains T026. No stage, commit or publication performed.
