# Bounded T063/T064 Terraform handoff security review

**Verdict: changes_requested. Protocol disposition: needs_intervention**, because the coordinator reports the three implementation repair rounds are exhausted. SEC-TF003 requires a bounded repair extension; it is not an exception candidate.

Scope: new `foundation/handoff.tf` and its native regression case. No files changed, intrusive probes or paid actions.

Coordinator scope identifiers:

- Foundation: `194B6CBB280F0448FECB5EDD7ACC06300511F61CDCE666751862559893349016`
- Environment unchanged: `352DC029E7FF40CB29330742A2C6BBBB7A006D672EF7A1AE1FC71137E120ED92`

Independently captured file hashes:

- `handoff.tf`: `B1805D280C43C957376BD01843FD5B18D544DE70A6C995B8FF245409C187829F`
- `tests/foundation.tftest.hcl`: `9AA24D08E40B454CD3E766F431BA3810DB7696943202BA8460AF5F6198776654`

## SEC-TF003 — Qualification actors cannot read their authoritative challenge

**Category:** code / authorization integration  
**Severity:** medium  
**Blocking:** yes.

**Evidence:** `azurerm_storage_container.qualification_challenges` is private. The only assignment targeting it is `azurerm_role_assignment.qualification_challenge`, granting apply read/write. No backup/restore read assignment exists.

The reviewed protocol requires each actual actor to read the apply-owned challenge before producing identity-bound proof. Existing recovery/operations grants target other containers and do not authorize this read.

**Scenario:** A protected hosted backup or restore job authenticates correctly and attempts to fetch its challenge. Authorization fails, preventing qualification and subsequent recovery activation.

**Preconditions:** Root-declared assignments without an additional out-of-band data grant. No Azure request was made during review.

**Remediation:** Add only the required backup/restore challenge-read authority, preferably constrained to the challenge path each actor needs. Keep challenge writes/consumption apply-only; do not add broad account/container write, delete or unrelated reads. If using a different handoff transport, formally reconcile it with the protocol before implementation.

**Verification:** Native contracts must establish the exact readers and absence of actor write/delete. Actual Azure probes must prove actor challenge GET succeeds while actor mutation, unrelated-path access and disallowed listing fail.

## Other inspected boundaries

No additional confirmed finding was identified in this bounded scope:

- Human bootstrap read/write is constrained to its exact foundation projection path.
- Apply can read that foundation projection and read/write its environment prefix; it cannot write the foundation projection through this assignment.
- Projection readers are explicitly enumerated. Only plan/destroy additionally receive foundation-projection read.
- Projection conditions explicitly exclude `Blob.List`.
- Proof containers separate backup and restore writers; apply receives read-only access.
- The custom proof role contains Blob read/write, without delete, append/add or container-management actions.
- **Actual limitation:** proof-container assignments do not contain the projection-specific no-list condition. Their read action can support listing within their own container. This is not cross-actor access and is not presented as a no-list guarantee for proof containers.
- Blob write can overwrite existing proofs. The role description states this accurately; create-only semantics must be enforced by the trusted adapter, not claimed as RBAC immutability.

Actual ABAC enforcement remains unverified. Native assertions inspect configuration and condition content; they do not establish Azure authorization outcomes. Reported 18/8 native results and format/validation/TFLint passes were not independently rerun.

## Policy record

The owner’s two exact AVD-AZU-0057 false-positive approvals are recorded separately from audit readiness. No audit-gap waiver, global suppression or workload-vault lifecycle exception was introduced.

SEC-TF003 must be repaired, not accepted as scanner policy risk. Full feature, hosted qualification and live audit acceptance remain pending.
