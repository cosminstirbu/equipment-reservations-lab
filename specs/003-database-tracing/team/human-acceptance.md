# Database tracing human acceptance

Status: **Accepted by the human owner on 2026-10-15**.

Owner response to the updated-feature acceptance question: **“Accept the updated feature”**. Acceptance applies to the documented `.AddNpgsql()` candidate below and its unchanged privacy controls. The preceding discussion of possible tag-processing simplification did not authorize or introduce another source change.

Candidate source snapshot: `17d49d5e859ac45eaf5231448ccd629f73750ed2f04f6aa95c0381644cbe88c4`.

The earlier candidate `79a1bbac6bb4e7ca3ebce3a70f8973fbe48150899aac32b51e5f0fc71f5de058` was not accepted; the owner requested documented `.AddNpgsql()` registration instead. That authorized delta is implemented and revalidated. No acceptance is inferred from that implementation request.

Implemented database spans across all current paths, with reviewed parameterized SQL enabled by default, no bound values, administrative/unknown SQL excluded and a SQL-off setting that preserves spans. Bootstrap exports before success/failure exit; failures retain safe signals and correlated logs.

Required current checks passed: format-check, lint, full check (tooling 4, Angular 39, Backend 229, real smoke 45; zero skipped), diff check, 18 focused real-PostgreSQL cases, actual `.AddNpgsql()` registration-removal failure/restored success, and fresh Aspire default/off/restoration validation. Earlier live failure/recovery evidence remains attributed to its historical snapshot; current automated tests cover failures.

Independent [quality](quality-registration-final.md) and [security](security-registration-final.md) verdicts passed. Q-001 is closed by its original verifier. [Convergence](convergence-registration-delta.md) found no gaps. See [implementation evidence](implementation-registration-delta.md), [runtime evidence](runtime-registration-delta.md) and application telemetry audit summaries. The inspected privacy scope covers supported local application telemetry; private full diagnostic archives are not declared sanitized. No accepted risk exceptions.

Example current [equipment-detail trace](http://127.0.0.1:15888/traces/detail/80bc6703b7c949cc9d474e0716a2e6c6) contains the native child command and reviewed SQL with `$1` retained. The validation-owned default Aspire session is stopped at completion; the recorded local trace link refers to that validation session.

T026 acceptance is recorded before completion synchronization. The spec status, task checkbox and team state are synchronized as metadata-only changes; reviewed source and historical review hashes/reports are preserved. No commit, staging, merge, deployment or publication is part of acceptance.
