Batch4 T027–T036 implemented and marked complete. Source is frozen for independent review. T046 remains unchecked; SEC-001 still needs actual browser evidence and original security closure.

Frozen source: **134 paths**, SHA256 **`3f4080a91b0ec60b5b570ec9112d3a4b442d39f27fdcd25403deb8da8f666952`**. Agreed B1 aggregate algorithm unchanged. Per-file manifest: `/tmp/b4-source-manifest.txt`; coordinator independently confirmed the hash.

Changed application scope:
- `HelloMessaging`: typed/generated reservation envelope, durable topology, strict validation, recovery scheduler and shared delivery telemetry.
- `Reservations`: confirmed publisher, transactional outbox worker, browser-write guard, Program registration and generated logs.
- `Notifications`: durable inbox/contracts/API, reconnecting subscription/consumer, generated JSON/logs.
- `ServiceDefaults/Extensions.cs`: messaging telemetry registration.
- Angular booking API/component/template and `notifications.spec.ts`: explicit inbox refresh, event-ID observation, preserved authoritative ordering and focus.
- Backend recovery/security tests; real-broker delivery fixture/outbox/consumer tests; Smoke project references/lockfile; task markers only.

Recorded red/green:
- `dotnet test tests/Smoke.Tests --filter FullyQualifiedName~ReservationOutboxTests -m:1`: initial genuine RED2; final **GREEN5/5**. Actual RabbitMQ mandatory return/nack semantics verified. Reject policy affects only an exclusive test queue. Timeout uses a documented public publisher-boundary stall under the real worker’s three-second budget. Full envelopes/IDs remain stable.
- `dotnet test tests/Smoke.Tests --filter FullyQualifiedName~ReservationConsumerTests -m:1`: initial RED17; deterministic commit-before-ACK interruption separately RED1→GREEN1 with actual `Redelivered=true`. Final **GREEN23/23** includes poison, malformed JSON, outage/restart, deduplication, ordering and delivery telemetry.
- Strict tracestate newline regression: RED1/22 passed because poison created a second inbox entry; strict `\A...\z` correction → GREEN23/23. Related identifier/origin anchors inspected.
- `dotnet test tests/Backend.Tests --filter FullyQualifiedName~ReservationRecoveryTests -m:1`: initial recovery RED4, strengthened RED6; subsequent intended failures exposed permanent outbox retry, handshake-reset burst, missing publisher signals and permanent consumer retries/logging. Final **GREEN13/13**. Supplementary existing-behavior cases prove five-second setup/database and three-second ACK budgets.
- Permanent outbox failure remains unpublished across cycles/restart; repaired EventId-plus-unpublished metadata reset resumes the identical event. Consumer permanent configuration failure stops until repair/restart.
- `npm --prefix src/Web test -- src/app/booking/notifications.spec.ts`: inert UI RED7, added focus case RED8 → **GREEN8/8**.
- `dotnet test tests/Backend.Tests --filter FullyQualifiedName~SecurityBrowserWriteTests -m:1`: initial RED42/4 passed; trailing-slash media bypass RED1/47 passed → **GREEN48/48**. Empty-header transport fixture corrections were not counted as behavioral red evidence.

Final gates all exit **0**:
- `npm run format-check`
- `npm run lint` — zero warnings/errors; explicit analyzer/import repairs, no suppressions.
- `npm run check` — production Angular build; **4 tooling, 35 Angular, 144 backend, 31 real smoke tests**, zero skipped. Backend49s; smoke2m10s.
- `git diff --check`

Environment: .NET10, Angular22.2.2, Podman/Testcontainers, PostgreSQL18.6, RabbitMQ4.3.6 and RabbitMQ.Client7.2.2. Added real-broker tests use bounded60-second deadlines. No extension hooks file exists.

Remaining: independent B4 reviews, T037/T042 full workflow/export telemetry and age/dependency evidence, final documentation/manual/browser/restart acceptance, SEC-001 closure and remaining feature gates. No full-feature completion claim or external/git action.
