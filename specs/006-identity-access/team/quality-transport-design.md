# QUAL-006 — Targeted transport design re-review

**Verdict: pass.** No findings identified.

**Feature:** `specs/006-identity-access`  
**Frozen snapshot:** `fe9a31ced53e73ebb5587f5f8745e8f500cc156056c873879d17aaa929682a63`  
**Manifest:** `team/transport-design-manifest.json`

## Scope and evidence

Reviewed the transport clarification in `plan.md`, `research.md`, `contracts/identity.md` and `quickstart.md`, together with affected requirements, data-model assumptions and task dependencies. Verified all eleven manifest file hashes with zero mismatches.

This review supersedes the previous design verdict **only for the affected transport assumptions**. Earlier reports and hashes remain historical evidence. No implementation approval is given.

## Assessment

| Area | Result | Evidence |
|---|---|---|
| Allocated issuer | Consistent | Plan §Identity and Trust Boundaries.2, identity contract §Provider/clients and quickstart derive the issuer from the actual allocated host-network endpoint rather than its endpoint name. |
| Stable ownership | Preserved | The entire scheme/host/port remains unchanged across ordinary restart; changing it creates a separate identity environment. Exact issuer/subject key derivation remains unchanged. |
| TLS and validation | Preserved | Managed developer TLS and certificate validation remain enabled. HTTP metadata is restricted to an actual Development loopback HTTP authority. No alternate-issuer acceptance is introduced. |
| Provider advertisement | Consistent | Explicit `KnownNetworkIdentifiers.LocalhostNetwork` prevents container-context hostname rewriting in `KC_HOSTNAME`; browser configuration, provisioning and API validation use the same authority. |
| Tasks | Sufficient | T009 already requires allocated endpoint references and stable authority; T012 requires runtime-derived public configuration; T036 preserves issuer across restart; T037 documents stable issuer configuration. Their wording does not mandate HTTP. |
| Scope and governance | Preserved | No product decision, ownership rule, reset authorization, migration obligation or acceptance gate changes. |
| Evidence limits | Clear | Research distinguishes pinned package/XML evidence, current-source corroboration and implementation verification still pending. |

## Findings

None. No unresolved product questions or missing transport-specific tasks identified.

## Remaining verification

Implementation must establish the allocated issuer and browser form-action consistency in the relevant runtime modes, including ordinary restart with unchanged authority and certificate configuration. Existing reported model/runtime evidence is supporting context, not independently rerun or approved here.

**Changed files:** none.  
**Checks executed:** read-only artifact inspection and manifest hash verification.  
**Tests or dotnet commands executed:** none.
