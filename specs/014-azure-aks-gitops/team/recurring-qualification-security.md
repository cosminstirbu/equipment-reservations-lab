# Targeted security preparation review — recurring qualification

**Verdict: pass for this design delta.** No new blocking findings or exception requests.

Verified snapshots:

- `plan.md`: `DC3DECC24F8333C3A0EFF468BAD660AEC42DF219DDA28727C83D1CCDB2C5A6DF`
- `contracts/operations.md`: `D6F373F5FAF80B5F657A72FA567B241D648248FF08F44058424D0672ADD3CBCF`
- `research.md`: `E97ED4A579876384D845E48DBF441F0477480F90DC92A59662C5C7E8578B425B`
- `tasks.md`: `44A132EFEEED190FF66A620910C9B7B427516A4782E1BA385BBA6A65A91419FD`

The clarification distinguishes initial activation from recurring operation authorization:

- Initial activation requires the apply-owned challenge, both actual hosted identities’ proofs, and reviewed activation.
- Each scheduled backup performs fresh probes as its actual identity under the operation lease, without requiring daily apply or restore approval.
- Manual restoration retains its protected approval and performs its own fresh probes.
- Operation evidence binds nonce, lease, principal, cluster/CA, generation, activation and current role/probe hashes. Create-only storage and fifteen-minute phase-start validity prevent cached proof reuse.
- Commands execute actual probes themselves; caller flags cannot substitute for them. Later privileged phases require renewed checks when validity expires, while cleanup remains mandatory.
- Backup permits exact production scale operations; restore must observe scale denial and use reviewed maintenance configuration. Both identities may exec only their own fixed client.
- Exact Role/RoleBinding reads and three canonical `equipment-recovery` Workload Identity subjects support verification without wildcard discovery or privilege changes.

The initial harmless fixture proves the candidate authorization model; recurring real production-name probes establish the final bindings. The design does not claim proof expiry automatically revokes existing RBAC.

T066 retains the required negative and expiry checks. Implementation still must demonstrate actual identity binding, immutable proof writes, exact-resource denials, credential separation, and safe cleanup.

This does not approve implementation or close SEC-SRC001/SEC-SRC002. No files changed, probes, paid actions, or new risk acceptance.
