**PASS — revised targeted preparation**, SHA256 `38A807E857AB00C6CD501AEE44C586A0E9F939D359C77E1FC656AA9AA61EB919`. Owner authority decision remains pending.

The repair correctly separates:

- RBAC denial of unauthorized legacy child operations.
- Policy-specific denial of candidate-authorized parent mutations.
- Separately supervised policy qualification where permission-model toggling requires additional authority.

It neither assumes a demonstrated toggle exploit nor mistakes an earlier authorization denial for policy enforcement.

Covering both workload and retained recovery vaults closes the previous scope gap. Recovery-vault qualification must precede hosted network-writer activity by backup, restore, reaper **and apply**, including retained OIDC copying. Exact existing crypto/OIDC data grants remain separate from workload continuity permissions.

The owner decision should explicitly cover new workload-vault writer authority for backup/restore/reaper, independent guards for both vault families, and residual ability to alter IP/subnet rules, endpoints and admission tags. These permissions remain broader than ACL-property management and can affect exposure or availability. Process extensions do not approve them.

Actual qualification must demonstrate both-vault/API coverage, correct denial provenance, unchanged resources after rejected mutations, policy-authority separation, compliant admission/cleanup, and out-of-scope key/secret denial. Unproved cases block activation; source policy presence or compliance status cannot substitute.

No new blocking design finding. No files changed, grants made, live qualification claimed or residual authority accepted.
