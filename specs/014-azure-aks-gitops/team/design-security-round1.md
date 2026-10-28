# Security design review — preparation round 1

Reviewer: security_reviewer. Report preserved verbatim below.

**Verdict: changes_requested.** One blocking design finding. No implementation vulnerability or risk acceptance is asserted.

Scope: feature `specs/014-azure-aks-gitops`, baseline commit `d1c7238345136340ddbf3a9454807cefffc43c32`.

Reviewed initial snapshots:

| Artifact | SHA-256 |
| --- | --- |
| `plan.md` | `C0D0265F3F8BB5006B5B19F348F560551D70248FE96D264566E9144E8755CD66` |
| `research.md` | `79420B7D1501A53C44458F46DF71DAD0DCF2B0E916A8DC3C0B1B0B74DC4D1C11` |
| `data-model.md` | `423B89EC32FFC71EE044F1608814654CDA2C2E550DC4D8410FEAC7849F3D1413` |
| `contracts/operations.md` | `5DD6C37A61F97E06CDEA656B50F7FAB9C1B0B0324F9F4622C473BFC9A2AC18C4` |
| `quickstart.md` | `05990110591BB3F19EF27E361577371DC01BAAF743738055F833B722B79A7EF0` |

`plan.md` changed during review from operator-held age encryption to retained Key Vault envelope encryption. Consequently, this report does not approve the revised recovery design or any mixed snapshot.

## SEC-D001 — Expired runner admissions lack independent removal

**Severity:** medium  
**Blocking:** yes — source restriction and bounded cleanup requirements, FR-004/FR-024.  
**Category:** security/design.

**Scenario and preconditions:** An authenticated workflow admits its runner’s public `/32`, then loses its runner or is forcibly terminated before `finally` executes. The authorized-IP entry remains after the runner ceases to own that address. A subsequent address holder gains network reachability to the API. Kubernetes authentication remains required; this is not a demonstrated authentication bypass.

**Evidence:** Initial `plan.md`, administrative-access section, describes a bounded `/32` lease, removal in `finally`, and explicit stale-lease recovery. `data-model.md`, Operation lease, records expiry and owned cleanup. Neither specifies an independent mechanism that removes ARM access when the owner disappears. Lease metadata expiry alone does not enforce network revocation.

**Remediation:** Define independent authenticated reconciliation of expired runner admissions, its maximum intended residual window, failure visibility, and stale-owner recovery. Preserve persistent operator/cluster ranges and concurrent valid admissions. Do not claim automatic expiry without a mechanism enforcing it.

**Verification:** Exercise abrupt owner loss after admission, expired admission removal, active-lease preservation, and simultaneous primary/cleanup failure. Record actual effective API ranges and safe residual-access diagnostics.

## Recovery assessment

Operator-held age recovery was not inherently inconsistent with the approved separate manual restore exercise. Its scheduled verification/key-custody contract needed clarification.

The newly observed retained Key Vault design is a reasonable alternative, but requires a coherent frozen revision covering:

- Retained key/version lifecycle and permissions.
- Backup wrapping versus verification/restoration unwrapping authority.
- Authenticated encryption metadata and corrupted-input rejection.
- Removal of obsolete operator-private-key instructions.
- Restoration of compatible credentials and ACME/TLS material before dependent reconciliation.

These are pending design checks, not additional approved scope or accepted risks.

## Sound design retained

The reviewed draft establishes appropriate boundaries for untrusted PRs, private Terraform artifacts, revision-bound applies, application versus platform Argo privileges, assigned Entra operators, internal diagnostic ingestion, scoped secret identities, protected destructive operations, and generation-named purge-protected workload vaults.

No files changed. Checks were read-only artifact inspection and hash capture. Frozen repaired artifacts require re-review before a preparation pass.
