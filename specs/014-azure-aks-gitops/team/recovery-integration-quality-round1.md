Targeted preparation verdict: **changes_requested**.

Verified proposal SHA256: `5CE14517377136DC464DCF78E7B86A1D85439141E53F0EE811C3DE374AB8CDAF`.

**Q-D014-005 — Qualification conflates RBAC and Policy denial**  
Category: design; severity: medium; blocking: yes; owner: architect.

The proposal requires `RequestDisallowedByPolicy`, rather than generic 403, for legacy `accessPolicies` child operations. However, the exact candidate role expressly lacks `accessPolicies/write`. That actor’s RBAC denial cannot establish the child-policy control.

Separate the qualification layers:

- Actual candidate identities must prove their RBAC-denied operations.
- Candidate-authorized `vaults/write` mutations must demonstrate Policy-specific denial.
- If independent child-policy enforcement must also be demonstrated, specify a separately authorized, tightly scoped qualification actor and cleanup.

Otherwise the acceptance requirement can block a correctly restricted candidate identity.

The remaining mechanisms are coherent: retained independently controlled deny policy, exact own-authority reads, and separately bound executable closure, validated installation transition, and activation record. Explicit field invariants, fresh enforcement tests, exact transition maps, replay checks, and no self-hash address the identified gaps.

Candidate selection, owner acceptance of residual whole-vault network/availability authority, current alias/API enforcement, binding order, and actual cost remain pending. No authority expansion is approved by this review.

No files changed or implementation assessed. Independent security approval and actual provider qualification remain required.
