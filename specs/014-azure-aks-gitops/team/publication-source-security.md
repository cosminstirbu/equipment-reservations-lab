# Bounded publication/promotion security review

**Verdict: pass for the reviewed source subset.** No confirmed blocking security finding was identified. Hosted publication and complete feature acceptance remain pending.

The review covered publication/provenance validation, proposal mutation, component evidence selection, `azure-images.yaml`, and all seven component wrappers. Changing infrastructure, operations and GitOps implementations were outside scope.

## Inspected controls

- Components are copied from a proven immutable GHCR digest; the Azure path does not rebuild them.
- Raw source and destination index bytes must match the expected digest. Both Linux architectures and source labels are checked before proposal references change.
- Copy or verification failure exits before promotion. Retry/repopulation reuses the original digest.
- Azure publication requires trusted-main invocation and matching repository/run/component identity. Artifact loading separately validates authoritative producer/run evidence.
- Production publication enters the shared operation wrapper and checks the destination against approved environment outputs.
- Registry subprocesses are asynchronous and receive cancellation. GitHub requests refuse an aborted lease before mutation.
- Azure changes target reviewed proposal files through managed-branch checks and expected-head updates; no forced ref update or automatic merge is introduced.
- All seven wrappers gate local promotion on successful Azure publication when Azure mode is enabled.
- OIDC is confined to the protected Azure publication job. Credentials/private inputs use designated temporary locations and always-run cleanup; raw registry/provider output remains privately captured.

## Evidence limits and required qualification

Tests inspected cover partial publication, wrong provenance/destination, missing platforms, retries, ref races, cancellation, event-loop responsiveness, and workflow cleanup. The supplied report records 66 tests with 65 passes and one Windows skip before the subsequent validator extraction. I did not independently rerun tests against the hashes below.

Before claiming runtime success, retain exact-revision evidence for:

- Actual GHCR→ACR multi-platform copy and digest/source parity.
- Controlled remote failure/retry and recreated-ACR recovery.
- Protected hosted OIDC, fork denial and environment restrictions.
- Actual Docker credential-directory protection and cleanup.
- Shared lease failure/cancellation behavior with the actual Docker/provider processes.
- Required PR checks and approval behavior.

A source pass does not establish those provider outcomes.

## SHA-256 manifest

```text
scripts/promote-images.mjs
3E449A24FB8AD9E0AB1108BDE5FEA9D3E8D6187CBE0895340EF6D6D263A1C451
scripts/deployment-validation.mjs
AD9493B7CD3036AAF29F1BEBC6546B1691E314695927F09F4FD56BAFA7AA3505
scripts/component-pipelines.mjs
50E407642CE97926891D1A58026F6B7FA8772264176C91E8C9DEB58F354D234D
scripts/promote-images.test.mjs
CC009B7177E92C4922C0418EA897E5719918269E29A4CEDFAB90B3F8CB9ACD1E
scripts/deployment-validation.test.mjs
7AD94404255F760B98F9F51A961F0DD617E1E87D92AFAD332E7B84CF7B6D3DBD
scripts/component-workflows.test.mjs
2D8CFE256F24634D5934EF8383E2A68DDC3A2F7B11050F8EFF9D380D74A721B8
scripts/component-selection.test.mjs
E28748088242D3853363264CFB85978B6D0BBDC5683F71ED912D1A6DBC0FB7F6
scripts/direct-promotion.test.mjs
AA75312D43BABC90842E2F4FD60BA51FA518788EA57DE2053CDD7C4A020690D0
.github/workflows/azure-images.yaml
DFFB7E91F83C0EB9129277E024E3CA043E7BC6DD00F729DCFDB803D6CCD06FF7
.github/workflows/component-inventory.yaml
3F9C798CC231E2D23817CBB8742CDCF3899310A4C314B7BFEF31F0C0108CB40D
.github/workflows/component-reservations.yaml
23DB18EAFCB9C6FB84E1934ED815B4ED0F9E7D79E31D56AFE1DC895E2EBB7AFE
.github/workflows/component-notifications.yaml
A6D5010808CB33C56BBF0817067C5D463B78EEB4E904086A5AB0C7958A8565C4
.github/workflows/component-web.yaml
86706AAA2FA399B0D990CA061B407C3F982D1C3D76B96B77AD1563C8572DBBE6
.github/workflows/component-database-bootstrap.yaml
18E6147F513ED7BF4CA8D0C293D825D360384221400F5EF61CCFB09F5E6E0BA5
.github/workflows/component-identity-bootstrap.yaml
0E78D4639C88D549D4C9119497128E8A542CF54723643B83A0FD4240F784B4B7
.github/workflows/component-broker-bootstrap.yaml
D6C49D7B3363F025D421BC168A9054152FF6EFEE907F65447C40DB394B8B8C10
```

No files changed, intrusive probes, external publication, paid actions or new risk acceptance.
