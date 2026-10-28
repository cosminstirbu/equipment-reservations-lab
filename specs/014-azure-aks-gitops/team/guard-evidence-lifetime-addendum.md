# Guard proof lifetime and initial probe ownership clarification

Status: proposed targeted clarification; independent quality/security preparation
confirmation required before helper freeze or authoritative integration. No Azure
action is performed by this document. It preserves fresh activation checks while
avoiding a daily human/apply credential requirement for unchanged guarded operation.

## Exact evidence modes and consumption

Human family record schema has mode=human-policy-family, producer=actual configured
bootstrap human object ID, issuedAt actual UTC, expiresAt=null. Null is valid ONLY for
this mode. It binds environment/tenant/subscription, exact both-family assignment/
definition/parameter/scope/enforcement/exemption hashes, source/security-definition
closure, actual human principal, and BOTH selected APIs2026-02-01 and2024-11-01 with
complete actual response-provenance cases. It lives only in the human-writer retained
guard-evidence container. It is not a caller boolean or perpetual authorization for
changed policy: every use re-reads current actual guard/API/role/security-definition
state and compares the anchored tuple. Revocation, tuple change, missing record,
failed actual checks or unexpected exemption invalidates it and blocks operation.
Ordinary app-only release data remains separately validated under the approved model.

Workload generation record has mode=workload-generation, producer=actual protected
hosted apply principal, issuedAt/expiresAt UTC, lifetime<=24hours and exact new resource
ID/generation/current family-record digest/API/role/guard/source hashes. Only apply
writes guard-apply-evidence; this mode cannot satisfy human-policy-family. Protected
activation/grant consumes the valid fresh record by creating a separate canonical
consumption record in the apply-writer guard-apply-evidence container (consumed/<qualificationId>.json), under the existing common lease: mode=guard-generation-consumption,
qualificationDigest, actual generation/vault ID, guard/family/role hashes, reviewed
source/activation revision and actual consuming principal/time. The stored consumption
has no self-hash and is create-only; conflicting existing consumption/replay fails.
No passed/consumed boolean is accepted from caller configuration. Failed consumed
activation remains fail-closed: a new automated fresh generation qualification and
new consumption identity are required, never treating an existing record as success.

After successful grant/activation, the immutable consumed evidence is durable for its
UNCHANGED actual vault generation and tuple. The source qualification's24hour window
limits when it may be consumed; it does NOT retroactively expire a completed activation
or require daily approved apply. Recurring operations verify the canonical consumption
and original record digests, actual vault ID/generation, current family/guard/role/source
closure, and run fresh actual OWN-actor G3 negative/admission/cleanup/data-isolation
checks under their operation lease. Fresh mode=actor-operation proof binds actual actor,
nonce/lease/current consumed-generation digest and actual tuple, expiresAt<=15minutes
for phase-start validity, with cleanup always required even after expiry. Wrong producer,
mode/null expiry, missing consumption, changed tuple or stale own proof fails closed.
Changed vault/guard/API/role/security-definition requires applicable requalification;
unchanged daily backup needs neither fresh apply nor fresh human credentials. Existing
v2 actor qualification authority and prefix/container isolation remain unchanged.

## Fixed initial human workload probe

The guard helper owns creation, qualification and cleanup of one fixed deterministic
compliant workload probe vault under the retained workload RG during INITIAL human G1.
Name/resource ID derive only from reviewed environment configuration and fixed probe
suffix; no caller arbitrary resource target, no live production vault reuse. Before
creation, verify exact absence (including soft-deleted-name collision), reviewed RG,
actual enforced policy tuple and actual human principal. Refuse to adopt/delete an
existing unowned vault. Create only the fixed compliant properties under both pinned
API qualifications, with no secrets/keys/OIDC values and no operational network grants.
Retain actual create response/UID-equivalent ARM resource identity and owned-operation
evidence; qualify only that exact vault and actual retained recovery vault.

In finally, helper DELETEs ONLY its exact newly created owned disposable workload probe,
then polls actual active GET absence AND the provider's matching soft-deleted vault
record/location/resource identity. Never purge, disable purge protection, delete the
workload RG or touch retained recovery vault. Delete/collision/soft-delete uncertainty
is a failed cleanup and blocks initial qualification publication, not a success marker.
Purge protection/soft-delete retention mean repeated initial probe runs may encounter
a retained name; block with explicit human cleanup/review rather than generate random
names, silently recover it, or request purge authority. A subsequent reviewed naming
change is explicit configuration, not wildcard adoption. Private failure evidence is
bounded and excludes secret/token material.

Human's existing approved foundation authority executes initial probe actions only at
later authorized actual provisioning. Source implementation/native HTTP fixtures now
must prove exact create/delete ownership, no-adoption/no-purge, collision, API tuple,
finally cleanup and actual soft-delete checks. These fixtures and preparation PASS do
not establish live Azure guard enforcement or authorize paid provisioning by themselves.
