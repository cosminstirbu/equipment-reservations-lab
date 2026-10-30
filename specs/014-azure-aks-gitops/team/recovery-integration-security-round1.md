**Targeted preparation verdict: PASS for the proposed technical controls; Candidate A remains pending the explicit owner authority decision.**

Matched SHA256 `5CE14517377136DC464DCF78E7B86A1D85439141E53F0EE811C3DE374AB8CDAF`. No files changed or cloud actions performed.

The proposal correctly identifies that whole-vault write could undermine narrow secret permissions. Microsoft documents the access-policy self-grant risk and confirms that ARM Deny evaluates before the resource provider. The independent retained policy, strict invariants, no recovery exemption, separate policy authority and qualification-before-grant ordering form a reasonable control design. Actual alias/API enforcement remains unproved. [Key Vault warning](https://learn.microsoft.com/en-us/azure/key-vault/general/assign-access-policy), [Deny semantics](https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-deny).

The owner must explicitly choose Candidate A and approve its remaining whole-vault network/availability authority for backup, restore and reaper. This includes widening IP/subnet rules and changing admission tags despite default Deny. Neither this review nor the process-budget extension accepts that authority. Candidate B remains a separate unbuilt alternative.

Exact own Role/Binding and ClusterRole/Binding GETs appropriately support drift validation without permitting modifications or other-actor enumeration.

Separating immutable executable/authority definitions, exact validated installation transitions and a non-executable activation record resolves the identified hash cycle without broad integrity exclusions. Implementation must enumerate and classify exact paths, bind both complete installation maps, reject unknown outputs and verify consumed activation-record bytes on recurring operations.

Required enforcement limits remain:

- No operational vault-write grant before actual policy-denial qualification.
- Verify policy-specific denial across relevant PUT/PATCH/recovery variants and actual principal inability to modify policy, exemptions or assignments.
- Prove compliant admission/cleanup succeeds and unrelated secret GET remains denied.
- Treat propagation failure, unsupported aliases or ambiguous installation classification as blocked activation.
- Preserve honest residual network authority and bounded cleanup claims.

No new blocking design finding. This is preparation approval only, with the owner decision and live enforcement evidence still outstanding.
