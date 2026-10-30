# Targeted security preparation review — clarified authorization and audit staging

**Verdict: pass for this design delta.** SEC-D002 is resolved through the owner’s explicit scoped approval. No new blocking preparation findings.

This is not implementation, live-provider, or full-feature approval.

## Reviewed snapshots

| Artifact | SHA-256 |
|---|---|
| `plan.md` | `494763F57858167BB1F211821F6A26079BBC65296098373A4BEF4BC07409752D` |
| `research.md` | `E0420F483703DB7236A8A58B6A2C6A4F3513787ABD5BBB021588AF80F792EC37` |
| `tasks.md` | `FE3371BD7447C218A207D30FF658D9DAFEA6208CE047F035FE5505F03C54F82A` |
| `contracts/operations.md` | `0074671A4DF7A14C4CA569BA8B8425576E37E6D078F360CEAE60357DF37A3461` |
| `team/proposed-policy-exceptions.md` | `5076D4526FF0E1034FF34B97FF65344FEED1D87B877CDECD941921452A3DE759` |

## SEC-D002 — owner-approved processing scope confirmed

The record preserves the explicit response **“Approve this scoped processing”**, owner and date, the two exact storage resources, diagnostic categories, provider processing boundary, and intermediate-buffering uncertainty.

It retains the exclusions for passwords, raw tokens, bodies, plaintext backups and application personal data. Safe workspace transformation, no raw secondary sink, and actual privacy/access/gap verification remain mandatory.

**Disposition:** human-approved scoped processing exception; report it in final acceptance. It is separate from the eleven scanner exceptions and does not waive AVD-AZU-0057 or implementation checks.

## Installer authority

**Preparation approval:** the protected apply identity may receive the proposed **Azure Kubernetes Service RBAC Cluster Admin at the exact AKS resource** for verified Argo/CSI/CRD/RBAC installation.

This deliberately grants full cluster authority to that installer. Its justification is installation of cluster-scoped controls, not a claim of narrow resource permissions. No backup, restore, lifecycle, stop or reaper identity inherits it. Federation, protected workflow approval and disabled local/admin credentials remain required.

Source review must confirm the conditioned delegation grants this role only to the intended apply principal at that exact cluster. This verdict does not approve a generic Cluster Admin grant to arbitrary ServicePrincipals.

## Native RBAC qualification

The design accurately treats native named-resource authorization with `azure_rbac_enabled=true` as **unproven**.

Actual backup/restore identities must independently demonstrate named Pod exec and scale access, forbidden-name and unrelated-resource denial, and absence of broad Azure permissions. Real requests supplement SelfSubjectAccessReview; installer impersonation alone is insufficient.

Qualification precedes recovery-role/workflow activation. Failure blocks activation without Writer, ClusterAdmin, credential extraction or an unreviewed authorization-mode fallback.

## Database and verification authority

The clarified design separates:

- Backup read authority across the four required databases.
- Restore authority through the exact four owner-role memberships.
- Administrative role creation in a separate reviewed bootstrap SQL Job.
- Verification in a disposable PostgreSQL server with verification-only credentials and denied production egress.

No superuser, CREATEROLE, global password/role dump, arbitrary Job exec or application bootstrap behavior change is authorized.

Required implementation evidence includes:

- Complete dumps despite any RLS.
- Denied access to unrelated and newly created databases; `pg_read_all_data` must not become unintended global database access.
- Correct SET/INHERIT behavior and schema/extension restoration.
- Fail-closed admission rejecting altered verification images, credentials, commands and privileges.
- Exact Job/Service ownership and failed-cleanup reporting.

The older generic phrase “plus roles/grants” must be implemented as reviewed canonical metadata/bootstrap prerequisites, consistent with the specific prohibition on global role/password dump and restore.

## Audit staging

The create → bind → qualify → enable sequence provides a coherent fail-safe design:

1. Create workspace and DCR with diagnostics disabled.
2. Bind the actual existing DCR through the supported workspace property.
3. Verify actual provisioning, stream, destination and allowlist.
4. Enable diagnostics only after that qualification.
5. Run safe synthetic Blob and stored-row privacy/access checks before full acceptance.

Readiness flags are prerequisites, not evidence themselves. Source review must establish their binding to actual qualified resources and rejection of stale or mismatched inputs.

## Remaining source-review candidates

These are implementation follow-ups, not new approved exceptions:

- SEC-TF002 source closure after the human-only foundation grant is implemented.
- Installer role/delegation principal restrictions.
- Exact retained OIDC source-secret reads and expiry enforcement.
- Actual database grants and future-database denial.
- Native exec/scale qualification and verification admission ordering.
- Audit staging, stored-field privacy and failure handling.
- Any new scanner finding outside the eleven approved addresses, including the previously identified workload-vault `prevent_destroy` warning.

The fixed EUR120 tax-inclusive gate and explicit tax input remain sound. No source files changed, intrusive probes, or paid operations ran.
