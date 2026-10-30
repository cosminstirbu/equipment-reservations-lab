# Batch7 exact recovery Application observation

Author implementation only; independent review and actual qualification remain pending.

## Authority and scope

Authoritative operations contract §3 integrates approved proposal
B8B2E68ED1C1D34538B3193A7E187D17E3DF84DF738A1618FCFB22F484F2ED7D.
Coordinator explicitly released deploy/platform/azure/recovery-controls/roles.json
(the actual source rather than initial YAML path wording) and the existing
azure-deployment.test.mjs. Existing standards apply: constitution least privilege,
engineering testing public rendered boundary, tooling privacy, exact per-edit formatting.

Both argocd continuity Roles gain a separate argoproj.io applications-only rule:
GET equipment-azure-recovery. Their existing combined Application/AppProject GET
on equipment-azure stays unchanged. No recovery AppProject GET, list/watch/write,
foreign actor metadata, global admission read or other resource authority is added.
Operations owner was notified to align the actor validator to these exact rules.

## Test design and evidence

Existing deployment contract tests render the actual committed recovery-controls
Kustomization using pinned kubectl. New assertion compares the complete Argo rule
inventory in both roles: existing equipment-azure Application/AppProject rule and
new recovery Application-only GET, excluding any adjacent broader Argo rule.
No double, native fixture, scheduling code or public/provider permission was changed.

Intended RED:
node --test --test-name-pattern='both actor continuity roles' scripts/azure-deployment.test.mjs
FAIL1/1,437ms: actual rendered roles lacked the second Application-only rule.

GREEN:
node --test scripts/azure-deployment.test.mjs
PASS15/15, zero skips,3.37s. The existing fail-closed missing-runtime render-negative
case intentionally emits its missing runtime diagnostic; real Azure remains unconfigured.
Scoped format-check and ESLint max-warnings0 pass. Per-edit formatter/re-read completed.

Author scope verification removed exactly the two new rules in memory, formatted
that copy and calculated SHA256670DEE14403FADA6628AEBF0FF30398103AA96355236F5221CCCFB6C9AAA9310,
matching the prior frozen source. This establishes that all other source bytes/rules
are preserved. No source edit was made by this verification.

## Qualification limits

Actual native/hosted GET equipment-azure-recovery for both identities, denial of a
foreign Application/recovery AppProject/list/watch/mutation and recurring actor
validation remain required. Native fixtures are frozen pending separate budget release;
no such provider pass is claimed by these manifest contract assertions.

Frozen SHA256:
- deploy/platform/azure/recovery-controls/roles.json:
  BC34EF067DAE4B6E4B2072727DDF870FFF3D058B23B6C093DB613A7D538FD8F3
- scripts/azure-deployment.test.mjs:
  9BE20A532A86325EC55923D19254384526B6B9D8FEDBE498438B0D24971C96EF
