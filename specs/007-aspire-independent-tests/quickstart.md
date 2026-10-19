# Validation Quickstart

Use `SPECIFY_FEATURE_DIRECTORY=specs/007-aspire-independent-tests` for Spec Kit operations. Run repository commands from the repository root.

## Prerequisites

Use the existing .NET/Node dependencies and supported running Podman runtime. Resolve the documented Testcontainers socket/environment prerequisites from README. Coordinator verified Podman is available with `DOCKER_HOST=unix:///var/folders/6k/z9rq_rsj7gj5ghmy_rx43nzh0000gp/T/podman/podman-machine-default-api.sock` and `TESTCONTAINERS_RYUK_DISABLED=true`; use current documented local socket rather than assume it is portable. Fixtures must dispose all resources explicitly with Ryuk disabled. Real PostgreSQL18.6, RabbitMQ4.3.6 and Keycloak26.8.1 images must be available. Missing runtime/images/readiness is a failed prerequisite, never a skipped pass. Automated tests need no developer-owned AppHost, user secrets or volumes.

## Automated validation

1. Use the historical coverage disposition and its current-location addendum to verify retained guarantees; the original migration inventory and acceptance evidence remain historical.
2. Run focused tests, for example `dotnet test --project tests/Integration.Tests/Integration.Tests.csproj --filter-class Integration.Tests.ReservationOutboxTests`, and corresponding consumer, provisioning, broker, provider and recovery classes using actual final names. Diagnose failures; never use repeated reruns as proof of correctness.
3. Run `npm run format-check`, `npm run lint`, `npm run check` and `git diff --check` on final source. Expected: tooling/frontend and all retained backend checks pass, zero failed/skipped required checks, build/analyzer gates clean; check runs all nine modules through native MTP and propagates failures. The direct backend command is `dotnet test --solution EquipmentReservation.slnx --max-parallel-test-modules 9`; a single project also runs directly with `dotnet test --project tests/Reservations.Tests/Reservations.Tests.csproj`.
4. Audit `tests/`, scripts, active solution/project/package references: no Aspire testing package, AppHost test construction/inspection/startup/resource commands, publication checks or Smoke.Tests invocation remain. Ordinary solution AppHost build and historical evidence references are expected.
5. Verify every research.md row/case and mixed guarantee has final executable evidence or explicit Aspire-only/owner-approved disposition. Confirm native `ParallelMode.All` / `MaxThreads = -1`, documented narrow sequential exclusions, scenario isolation, and no `src/` behavior changes.
6. Freeze exact source snapshot, capture command/runtime/exits/counts, obtain independent quality/security review and convergence. Code fixes require affected evidence/reviews again. Final acceptance is a separate owner decision.

## Manual local-development procedure

Follow the existing README and installed Aspire orchestration/monitoring skills for lifecycle/telemetry operations. Identify the exact AppHost `src/AppHost/AppHost.csproj` and runtime ownership first. Never stop a developer-owned session or delete ordinary named volumes/secrets.

1. **Prerequisites and startup**: use documented Podman/.NET/Node setup and ordinary AppHost startup. Expect Inventory, Reservations, Notifications, identity/database provisioning, broker and Web ready in dashboard; record any failed resources with safe diagnostics.
2. **Dashboard and client**: open printed authenticated dashboard and Web addresses. Expect resource/API links and normal application access/login. Record the observed local addresses without copying credentials/tokens.
3. **Local consoles/access**: in ordinary Development run mode open RabbitMQ and pgAdmin dashboard links. Privately retrieve existing broker password per README; expect unauthenticated broker management rejection then authorized access, and documented pgAdmin behavior. Verify loopback access and no unexpected non-loopback proxy/backing publication using existing supported diagnostics before using password-free administration. Record observations/failures. Other environments are checked only when relevant to local use; do not generate a deployment manifest.
4. **Persistence**: record existing equipment state and available booking/history/inbox observations before restart, then restart only the session you own with the same ordinary storage/secrets and compare those observations. Prefer read-only existing-state inspection; create isolated owner-approved sample data only if needed to make persistence observable. Expect data and credential identities preserved. Provider outage/crash-window guarantees belong to automated backend tests, so no destructive manual outage experiment is required.
5. **Cleanup**: remove only sample objects created for this check where appropriate; stop only the session you started, using its exact target and respecting lifecycle results. Keep ordinary named data volumes and secrets. Never run broad container/volume pruning.

Record action, expected result, actual observation or failure, tested revision and cleanup for each step in feature evidence. Manual failure remains visible; do not add automated AppHost assertions to hide it. Manifest generation/cloud deployment is outside this policy.

No product HTTP, messaging or identity contract changes are introduced; existing public contracts remain authoritative. Contracts directory generation is intentionally skipped because this feature changes only internal testing/tooling/documentation.
