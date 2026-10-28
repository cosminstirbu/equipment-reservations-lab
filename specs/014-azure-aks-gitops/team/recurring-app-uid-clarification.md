# Recurring recovery Application UID observation clarification

Status: PROPOSED narrow clarification for independent review alongside delegation
proposal; no authoritative/source change, new permission, exception or live action.
It preserves exact optional Application GET and actual current-target validation.

## Stored-source truth

Actual createRecoveryActivationRecord in scripts/azure-recovery-activation.mjs returns
version2 record with environment/generation/tenant/subscription/clusterCA/sourceRevision,
challenge/proof hashes, definitions/manifest and installationState. It contains NO
historical Application UID. The same source installs equipment-azure-recovery only
AFTER consumed activation and checks absence before creation. Therefore immutable
activation/consumption cannot truthfully bind a UID that did not yet exist. Do not
invent originalApplicationUid or backfill immutable consumed evidence from a caller.
Source definition deploy/argocd/azure/recovery/application.json remains immutable,
including exact namespace/name/project/repo/path/destination/sync policy. Current
reviewed revision is independently validated clean Git/GitHub provenance and approved
closure/installation state, not an arbitrary application.status.sync.revision value.

## Exact recurring observation

Under the current actual actor's common operation lease, GET ONLY
/apis/argoproj.io/v1alpha1/namespaces/argocd/applications/equipment-azure-recovery.
Require exact metadata namespace/name, nonempty provider UID, no deletionTimestamp,
full source/spec matching immutable reviewed Application (with only explicitly reviewed
renderer substitutions), status Synced+Healthy at actual current trusted reviewed
revision, and no active sync/operation. Validate current source/authority/installation
closure against the actual private consumed activation; valid later app-only revision
uses the already-approved unchanged-closure path, not false equality to historical SHA.
Missing/unknown/status error/spec mismatch is failure. No list/watch, other Application,
peer RBAC or global admission-object read is introduced.

Fresh own mode=operation proof records applicationObservation {namespace:'argocd',
name:'equipment-azure-recovery',uid:ACTUAL_UID,resourceVersion:ACTUAL_RESOURCE_VERSION,
specHash:CANONICAL_REVIEWED_SPEC_HASH,revision:ACTUAL_VALIDATED_REVISION} plus the existing
actor/principal/lease/nonce/generation/consumed-activation/role/source/cluster bindings.
UID is observed actual process evidence, not caller input or historical assertion.
Only the actual actor's existing private operation-proof producer writes it. Existing
freshness/expiry/cleanup requirements remain; no longer proof lifetime is added.

Before first mutation and each destructive phase boundary, repeat exact GET under the
same still-owned lease, require SAME UID as the fresh own proof and revalidate spec,
revision and healthy/sync/operation/deletion checks. ResourceVersion may legitimately
advance; never require it equal across status updates, but every observed record must
be actual and satisfy the same UID/spec/current-target criteria. Deletion/recreation
with identical name/spec and a different UID fails before the next write; no automatic
adoption or new success proof in the same operation. Restart with fresh normal validation
and proof only after owned cleanup and a new operation lease. Errors never mean absence.

This is checkpoint observation, not a Kubernetes atomic lock preventing a privileged
external delete immediately after GET. The external operation lease serializes our own
mutations; it does not lock Argo/API globally. Do not claim historical identity continuity
or impossible zero-TOCTOU guarantees. Existing source/permission control boundaries and
actual target validation continue; cleanup still runs even when UID/lease/proof changes.

## Required evidence

Native tests: current valid UID/spec/revision positive; empty UID, deletion timestamp,
foreign source/project/destination, wrong revision, nonhealthy/sync operation failure;
UID change after initial probe and before mutation yields zero protected writes; UID
change between later destructive phases blocks next phase and runs owned cleanup;
resourceVersion-only advance with same valid UID is acceptable. Prove immutable initial
activation has no fabricated UID and private fresh own proof binds actual returned value.
Actual hosted source/status/UID observations and authorization remain pending provider
acceptance; source fixture success does not establish them. No new grant or exception.
