**PASS — targeted preparation review**, SHA256 `8151D7D755948C51FE65F0DE19C9B5C5AF36969BC32F9B063150B47B7543E6D0`. No new blocking finding.

The proposed privileges match the stated recovery operations:

- Namespace-scoped Pod LIST honestly permits full Pod responses. Private, bounded processing and zero matching Pods—including terminating/orphaned Pods—provide a defensible quiescence check.
- Exact Argo, Deployment and seed-Job GET grants support fail-closed observations without adding mutation or wildcard access.
- The six-secret continuity inventory excludes PostgreSQL administration, DB-owner/recovery passwords and operator OIDC credentials. New database passwords remain intact; restore uses its current login and fixed owner-role memberships.
- Five existing Secret scopes and two ClusterIssuer GETs bound ACME/TLS recovery. Resource-version guards, certificate validation and controller-observed account/key reconciliation avoid relying on stale Ready status or granting status-write authority.

Restore ordering keeps writers absent during credential/data changes and requires actual login/client compatibility after controlled resume. No additional paid managed service is proposed; backup payload/storage growth remains bounded by the existing retention design.

Implementation must prove exact Azure object-scoped permissions, effective native/Entra denials, metadata-only/private Pod handling, credential exclusion, SQL role/password continuity, secret reload behavior and cert-manager/Pebble reconciliation. Step 2’s “verify fresh DB-owner credentials” must use existing permitted evidence; it does not authorize reading the four owner passwords or adding such grants.

I could not independently retrieve the linked pinned cert-manager source through browsing. Its described behavior remains author-supplied research, with actual pinned-controller qualification explicitly required before activation.

This approves the proposal’s design only. Authoritative artifacts, code and live evidence remain pending. No files changed, no policy exception inferred, and no paid actions performed.
