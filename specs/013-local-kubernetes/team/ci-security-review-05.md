# Independent security review — repair batch 05

The following retention verdict is reproduced verbatim from `/root/security`.

**Security verdict: pass for the permanent retention-fixture change.**

Verified SHA256 `a651568fb307aaf77e9acd2cd88ac458d26423a4bbc6187d41f83c9bdf42a25e` against baseline `94081ed`.

Both PostgreSQL instances explicitly enable `fsync`, `full_page_writes` and `synchronous_commit`; assertions verify the live settings. Existing force-replacement, retained-row, role/password and seed-count checks remain intact. No production security controls are changed or weakened.

Recorded focused red/green evidence supports this fixture correction. The two identity failures remain under separate diagnosis; no broader completion verdict is implied.

Read-only review; no edits, builds or provider commands performed.

## Permanent startup source review

The following report is reproduced verbatim from `/root/security`.

**Security verdict: pass for the permanent startup-code scope.** No confirmed security findings.

Reviewed hashes:

- `ApplicationStartup.cs`: `c905da150fe57f26b34fab8197f9742907f03777b73a078704aaa4b1773b4373`
- `IdentityHttpHarness.cs`: `6fd953e11e663f64d89662f9e9f8ed6dfd44e5e00093bef27221fa478cb8d328`
- `PostgresFixture.cs`: `8a5bc6a30ac94ae37d5541637ae58bf6db87becfed8fee4082eee29aa2c6b650`

The shared four-slot admission limits concurrent dedicated startup threads. Leases release in `finally`; startup completion remains awaited, avoiding abandoned ownership. Failed identity startup disposes its application. Authentication, authorization, Data Protection and ordinary request scheduling remain intact.

Cancellation controls admission and task scheduling; identity startup receives the token. A synchronous factory startup already executing cannot be interrupted solely by that scheduling token, so no stronger cancellation guarantee is established.

Temporary HTTP diagnostics are exactly restored to baseline SHA256 `9b79187fe6a766100043058ba462833673fb737c72bfa650128b7570d8e19ccc`; PostgreSQL capture code is removed. Retention-fixture review remains unchanged.

**Causal Linux regression and final required checks remain pending.** The historical single-flight 503 has not independently reproduced and must not be claimed fixed from source review.

Read-only review; no files, including review artifacts, were written. Coordinator may append this report verbatim. No builds or provider commands performed.

## Static helper correction

The following report is reproduced verbatim from `/root/security`.

**Security pass retained for the final static-helper correction.**

Verified hashes:

- PostgreSQL fixture: `b5ec7b1062330b2323ce9d82dec680563254700a69fa67365901d376cc9bbf7b`
- Booking scenario: `11608f5cf56237da9520f8d03b409ae029af3ba7675aad380d0081462d915e47`
- Service identity tests: `2c3d79de1fdc7d6a7b8a53088675d6f7cc24e790b43769ee8e76715d4756cbca`

The 12 call-site changes use the same reviewed shared startup helper. Authentication assertions, cancellation paths and resource ownership remain intact; temporary diagnostics are absent. No new security findings.

Linux comparison and final checks remain pending. No edits, builds, provider commands, commits or pushes performed.

