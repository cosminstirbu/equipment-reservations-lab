**Guard/projection preparation verdict: changes_requested.**

Verified hash: `3B95FE00A2A36B8691B715927584853DDABF3BF6BD4612736BFAD678199AD5F4`.

**Q-D014-007 — Initial creation versus post-create consumption is ambiguous**  
Category: design; severity: medium; blocking: yes; owner: architect.

The saved-plan paragraph requires actual-generation qualification before applying the initial generation plan. Actual qualification needs the new vault to exist.

Explicitly distinguish:

1. Initial compliant-vault creation, gated by validated human-family evidence/current guards, with operational grants deferred.
2. Actual post-create generation qualification.
3. Consumption bound to the unchanged **post-create grant/activation saved plan**.

The architect confirmed this intended distinction. The remaining projection, completed ordinary-activation, narrow inspection, and peer-proof boundaries are coherent.

**ACME privacy preparation verdict: pass.**

Verified hash: `59AF97F0F953104E33678BE6643DDE70345CA08367F850B1567C752B8A5197BA`.

The vendored pinned CRD explicitly makes ACME email optional. Omitting it from generated issuers, public canonical inputs, and snapshots preserves privacy without removing terms, directory, account-key, reconciliation, or certificate-readiness checks. Let’s Encrypt confirms its expiration-email service ended. [Official notice](https://letsencrypt.org/docs/expiration-emails/)

No files changed or implementation approved.

Previously issued reports, reproduced verbatim:

---

Targeted preparation verdict: **pass**.

Verified hash: `3B7943398775A9DF47D92D7AD233CE9C5E56BC5330D8DAF2F95429EA0B4F34C0`.

The lifetime modes are distinct and coherent: unchanged human-family evidence requires current tuple checks; fresh generation evidence permits one activation within 24 hours; recurring operations use fresh own-actor proofs without daily human/apply approval.

Required implementation tests must cover consumption followed by failed or interrupted activation: the consumption record alone must never establish completed activation or permit recurring use.

Probe ownership is explicit: fixed configuration-derived target, absence/collision checks, no adoption, exact owned deletion, verified soft-deleted identity, and no purge. Cleanup uncertainty blocks publication. Repeated-name collision is documented rather than hidden.

No new authority or policy exception is inferred. No files changed or implementation approved. Actual Azure enforcement, evidence isolation, replay/failure behavior, probe cleanup, and provisioning acceptance remain pending.

---

Targeted preparation verdict: **pass**.

Verified hash: `B82C66DF7312C07FEA3CAAFD3BBA7DFCDC8275BFD46595B431B16EC93A3F0768`.

The proposal supplies an explicit live-verification path: strict 28-file validation first, then actual registry and GitHub provenance checks using verified environment outputs. Registry digests, configuration labels, source revision, repository, run, and attempt remain independently checked.

It accurately distinguishes registry-wide AcrPull from repository-limited requests and requires actual private-package linkage/access. Missing access fails without PAT, visibility, credential, or verification bypasses.

Required tests cover authorization scope, ordering, mismatched provenance/content, denied access, private failures, and credential cleanup. Hosted allow/deny qualification remains mandatory.

No grants, workflow permissions, or implementation are approved by this quality verdict. No files changed. Residual-authority approval, security review, actual access, and refreshed cost acceptance remain separate gates.
