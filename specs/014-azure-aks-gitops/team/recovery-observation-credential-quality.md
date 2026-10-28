Targeted recovery-observation/credential preparation verdict: **pass**.

Verified proposal SHA256: `8151D7D755948C51FE65F0DE19C9B5C5AF36969BC32F9B063150B47B7543E6D0`.

The proposal coherently specifies:

- Honest namespace-wide Pod-list authority, private bounded projection, and zero matching writer Pods including terminating, orphaned, and old-rollout Pods.
- Exact control-plane reads, with authorization errors distinguished from absent Jobs.
- Restoration of schema/data while preserving newly created PostgreSQL credentials and excluding administrative/global-role secrets.
- Six exact identity-continuity secrets, five exact ACME/TLS Secret objects, and two issuer reads, with version/compatibility checks and guarded updates.
- Controller-observed ACME URI/key-checksum reconciliation before accepting restored account state.
- Real pinned PostgreSQL and cert-manager/Pebble qualification, including stale readiness, wrong credentials, denial, cleanup, and failure paths.

Restore ordering keeps writers absent during secret/data mutation and postpones application login verification until reviewed normal-state resume. Exact Job names must remain tied to actual rendered manifests; name changes cannot silently broaden permissions.

No new blocking requirements/design finding identified. This verdict grants no policy exception and does not establish live authorization, credential continuity, controller reconciliation, or recovery correctness. No files changed or implementation reviewed.
