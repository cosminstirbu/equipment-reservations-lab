**Preparation verdict: PASS**, SHA256 `A7C8FE1F570A40180C0C21254D2B64FD73C3986786D80B4E502677884CF2700B`.

The F0–F3 staging resolves the bootstrap dependency without broadening authority:

- F0 omits future canary-object bindings and treats pending status as informational.
- Read-only preparation does not authorize execution.
- Actual fixture creation requires separate explicit human authorization, fixed source-bound requests and configured-human identity checks.
- Human evidence plus fresh object GETs precede exact-only F2 binding finalization.
- Final family qualification binds the completed authority tuple before hosted operational use.

Typed projections cannot replace wrapper validation. Terraform must derive permitted IDs/scopes from reviewed source, reject foreign sets, and preserve approved saved-plan bytes. Partial creation, uncertain ownership, unsupported scopes or missing evidence remain blocking. Existing batch7 canary-versus-active-scope proof distinctions remain unchanged.

**Actual fixture creation is not approved by this verdict or the process extension.**

**Bounded source verdict: PASS.**

Matched:

- roles.json: `BC34EF067DAE4B6E4B2072727DDF870FFF3D058B23B6C093DB613A7D538FD8F3`
- azure-deployment.test.mjs: `9BE20A532A86325EC55923D19254384526B6B9D8FEDBE498438B0D24971C96EF`

Both actor continuity Roles add only GET on Application `equipment-azure-recovery` in `argocd`. The existing `equipment-azure` Application/AppProject rule remains separate. No recovery AppProject read, wildcard, mutation or broader RBAC access was added.

Independently ran `node --test scripts/azure-deployment.test.mjs`: **15 passed, zero failures/skips**, exit 0. The displayed missing-runtime rendering error is an expected negative case.

No new blocking finding. The four reported native failures remain unresolved; neither preparation approval nor this narrow source verdict clears them or establishes live Azure/AKS authorization.

No files changed, expensive provider tests run, permissions granted or cloud actions performed.
