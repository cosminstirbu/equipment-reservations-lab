SEC-006 frozen design security review

Feature: `specs/006-identity-access`  
Design snapshot: `36348a74a4a6ec000d87eb119e99c6d20f04f32866fb0a5f19536e1ccb2d95b2`  
Application baseline: `87bd4bc6964ed8dd75b8fdba8a227b530675b22d`

**Design verdict: PASS.** No confirmed security findings or blocking investigation questions. Requirements verdict remains PASS. Tasks and implementation reviews remain pending.

Reviewed all files in `team/design-manifest.json`: specification, plan, research, data model, quickstart, confirmed scope, three contracts and targeted Book and Cancel amendment. Independently computed SHA-256 values match all ten manifest entries. Rechecked relevant existing API, database, messaging, proxy and telemetry boundaries.

The design addresses the threat model:

- **Token substitution and privilege confusion:** exact issuer/per-API audiences, RS256/lifetime validation, signed access-token type, authorized party and principal-kind distinguish human and service authority. Client-specific service roles avoid broad role flattening.
- **Cross-user access and forged ownership:** one canonical issuer/subject hash implementation, owner predicates for lists and individual operations, owner-scoped cancellation locking/update and indistinguishable foreign/unknown 404s. Global equipment overlap prevention remains independent of owner.
- **Browser credential exposure and session confusion:** memory-only credentials, explicit PKCE/state/nonce, exact redirects/origins, fragment cleanup, narrow bearer attachment, expiry checks and generation-scoped response handling. No automatic write replay. Active XSS remains a limitation of the selected SPA model; preserved Angular sanitization, restricted token attachment and avoidance of token/debug surfaces are appropriate controls for this agreed local architecture.
- **Provider and provisioning trust:** stable issuer across normal restart, persistent opaque subjects/passwords, generated persisted secrets and finite privileged bootstrap. Unexpected grant drift fails safely; no agent/startup volume deletion.
- **Service and broker compromise:** dedicated Inventory-only service authority, no browser-token forwarding, topology bootstrap separated from workers, exact broker resource permissions and no application management tags or other-vhost authority.
- **Credential leakage and dependency failure:** bounded provider/token calls, no expired-token fallback, safe pre-mutation dependency failure, production HTTP instrumentation with privacy inspection and no provider-internal session telemetry export.

Required verification remains implementation evidence rather than a completed check: real-provider claim/validation contracts; service-to-human denial; owner isolation and no-effect forgery rejection; late-response/account-switch isolation; callback cleanup; broker allowed/denied operations; restart identity/data continuity; exported diagnostic privacy; and actual request/token budgets. The plan assigns these checks without weakening requirements.

Checks performed: read-only artifact/source inspection and manifest hash verification. No files changed, tests run, intrusive probes performed, exceptions granted or residual risks accepted. This approves the supplied design for task generation, not the eventual implementation or feature completion.
