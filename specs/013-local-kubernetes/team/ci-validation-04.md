# Owner-authorized fourth CI repair round

Baseline: `ca766491c2937624d40a98350ac0ee201b22b6de`. Source snapshot:
`ci-repair-snapshot-04.json`. The owner explicitly approved one additional repair round;
the original three-round limit and historical evidence remain preserved.

## Evidence and changes

Hosted run [39420693665](https://github.com/cosminstirbu/equipment-reservations-lab/actions/runs/39420693665)
passed 525/555 backend cases. Twenty-seven IdentityBootstrap cases could not initialize
their namespace holder because Docker reported a different pre-process loopback TCP
bind collision. The narrow classifier now recognizes that exact additional shape,
retaining two total initial-start attempts, cancellation and original deadlines. Its
intended regression RED was 3/23; the real Persistence module then passed 38/38.

Two separate IdentityAccess first-connection timeouts during Inventory migration and
one broker post-restart AMQP handshake reset remain unexplained. The address-stability
assertions passed before the latter failure; TCP readiness alone does not prove AMQP
readiness. No application timeout, database retry, broker retry or scheduling change
has been introduced without causal evidence.

The deployment diagnostic identified the failing database-bootstrap Job with three
exit-code-1 Pods, but retained no exception type. A new separate production-image test
uses the actual Dockerfile, rendered environment, real PostgreSQL and authenticated
Dashboard with production-aligned UID/resource limits. Both CLI invocations succeed;
four isolated database accounts, migrations, retained data and unchanged passwords
pass. Earlier fixture readiness failures occurred before CLI execution and are not
behavioral RED evidence. No speculative production bootstrap fix was made.

The validation workflow now runs this image test in its existing serialized provider
lane. A single bounded private log query after failure of the exact equipment database
Job projects only an allowlisted exception type from the known source log template.
It preserves the original failed outcome and status on every diagnostic failure.
The diagnostic regression first failed 2/12, then passed 12/12. Independent review
caught the omitted exact namespace guard; its additional intended RED was 1/13,
followed by 13/13 GREEN. Both original reviewers closed that finding and approved
the final six-source snapshot. Reports are preserved verbatim.

## Local validation

macOS ARM64, existing rootful Podman6.0.2, pinned kubectl1.35.8. The required application
check passed 564 backend, 64 frontend and 24 tooling tests, zero failures/skips;
backend duration 3m14.690s. Build/analyzers reported zero warnings/errors. No provider
image build or deployment probe overlapped that full application check.

The separate serialized deployment suite passed all 13 modules, including real broker
replacement, Dashboard authentication, both actual bootstrap processes, complete
CoreDNS/Traefik HTTPS rollout, configuration/PVC retention and nginx routing. Its CI
module ran before the final namespace guard; the final CI orchestration and real
render/TLS contracts are therefore rerun separately. Unchanged application source
does not require repeating the full application suite for that Node-only repair.

Final formatting, lint, targeted CI result and hosted execution are recorded in
`run-state.json` and the per-commit PR checks. Local Podman success cannot establish
hosted AMD64 Docker/kind recovery or bootstrap root cause. No merge, publication,
trust installation, DNS change or VM modification is implied. The ten existing
release/runtime/acceptance tasks and explicit human acceptance remain pending.
