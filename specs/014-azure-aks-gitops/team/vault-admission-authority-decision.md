# Guarded vault admission authority decision

Owner: human environment owner. Date: 2026-10-26. Exact response:
"Approve Candidate A with these safeguards".

Approved proposal: `recovery-integration-gaps-proposal.md`, SHA256
`38A807E857AB00C6CD501AEE44C586A0E9F939D359C77E1FC656AA9AA61EB919`.
Independent preparation reports: `recovery-integration-quality-repair.md` and
`recovery-integration-security-repair.md`.

The owner selects Candidate A: exact workload-vault write authority for backup,
restore and admission reaper, protected by independently controlled retained deny
policies covering both workload and retained recovery vault families. The existing
recovery-vault network writers, including apply, are subject to the same guard and
qualification requirements. Secret/key data permissions remain separately scoped.

The owner accepts the stated residual ability to change IP/subnet rules, endpoints
and admission tags, which can affect exposure or availability. This is whole-vault
network/availability authority, not an enforceable ACL-property-only permission.
No policy, exemption or role-assignment administration is granted to those actors.

Actual denial qualification must pass before operational grants/use. It must prove
both-vault and selected-API coverage, correct RBAC versus Policy denial provenance,
unchanged resources after rejected requests, policy-authority separation, compliant
admission/cleanup and out-of-scope key/secret denial. Unsupported or unproved cases
block activation; source policy presence and compliance status alone are insufficient.

This decision does not suppress an additional scanner rule, expand data-plane
permissions, waive enforcement tests, accept a demonstrated exploit, authorize an
unguarded fallback or approve unknown spending. The fourteen existing scanner/linter
exception scopes remain unchanged. Implementation, independent source reviews,
actual Azure qualification and full feature acceptance remain pending.
