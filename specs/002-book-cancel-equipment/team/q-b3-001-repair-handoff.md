Q-B3-001 repair implemented and source frozen for original reviewer validation.

**Snapshot:** `272f62a7ab3900707ab56c39f407b315d05289acbde802ceb854aa7b1b2817b3` — **115 paths**, unchanged B1 aggregate algorithm.

Changed only:

- `src/Web/src/app/booking/booking.ts`: removed client sorting; history preserves the API’s authoritative microsecond ordering.
- `src/Web/src/app/booking/reservations.spec.ts`: added rendered regression with `.123002Z` versus `.123001Z` and opposite UUID order. Updated the existing fixture to deliver contract-compliant API order; its assertions remain unchanged.

Exact red/green command:

`npm --prefix src/Web test -- src/app/booking/reservations.spec.ts`

- **Before fix:** exit 1, **1 failed / 9 passed**. The newer record incorrectly followed the older record because millisecond parsing collapsed their timestamps.
- **After fix:** exit 0, **10 passed**.

Final gates, all exit **0**:

- `npm run format-check`
- `npm run lint`
- `npm run check`: **4 tooling, 27 Angular, 83 backend, 3 real infrastructure smoke tests passed; 0 skipped**. Build **0 warnings/errors**. Backend 22s; smoke 1m9s.
- `git diff --check`

Exact-file formatting and rereading completed after edits. Environment remains .NET10, Angular22.2.2, PostgreSQL18.6, RabbitMQ4.3.6, running Podman. The existing JSDOM canvas notice appears during passing axe assertions.

**T045 remains unchecked pending original reviewer closure**, as instructed. No US3, backend, dependency, spec/design, or team-report changes. No policy waiver or self-approval.
