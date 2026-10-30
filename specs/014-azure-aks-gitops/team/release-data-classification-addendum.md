# Exact application release-data classification addendum

Status: proposed; independent quality/security preparation PASS required before any
manifest exclusion or authoritative change. No application artifact is execution-code
closure merely because its digest changes; its parser and constrained interpretation
remain immutable reviewed code. This proposal changes no permissions or policy exceptions.

## Exact data-path inventory

Only the following 28 literal paths may be classified as application-release data.
Unknown files, additional components or alternate extensions fail closed, never match
a glob. Missing Azure files are allowed only before first complete seven-component
promotion; recovery/app readiness requires the complete validated Azure set.
- deploy/environments/local/images/web.yaml
- deploy/environments/local/images/inventory.yaml
- deploy/environments/local/images/reservations.yaml
- deploy/environments/local/images/notifications.yaml
- deploy/environments/local/images/database-bootstrap.yaml
- deploy/environments/local/images/identity-bootstrap.yaml
- deploy/environments/local/images/broker-bootstrap.yaml
- deploy/environments/local/releases/web.json
- deploy/environments/local/releases/inventory.json
- deploy/environments/local/releases/reservations.json
- deploy/environments/local/releases/notifications.json
- deploy/environments/local/releases/database-bootstrap.json
- deploy/environments/local/releases/identity-bootstrap.json
- deploy/environments/local/releases/broker-bootstrap.json
- deploy/environments/azure/images/web.yaml
- deploy/environments/azure/images/inventory.yaml
- deploy/environments/azure/images/reservations.yaml
- deploy/environments/azure/images/notifications.yaml
- deploy/environments/azure/images/database-bootstrap.yaml
- deploy/environments/azure/images/identity-bootstrap.yaml
- deploy/environments/azure/images/broker-bootstrap.yaml
- deploy/environments/azure/releases/web.json
- deploy/environments/azure/releases/inventory.json
- deploy/environments/azure/releases/reservations.json
- deploy/environments/azure/releases/notifications.json
- deploy/environments/azure/releases/database-bootstrap.json
- deploy/environments/azure/releases/identity-bootstrap.json
- deploy/environments/azure/releases/broker-bootstrap.json

## Fixed interpretation and provenance

The immutable independent classifier must enumerate these exact paths and reject extra
fields, duplicate keys, YAML anchors/tags/multiple documents or ambiguous parses. Each
images file is only the canonical imagePatch(component,image@digest) output. Inspection
of scripts/component-images.mjs targets and ALL seven actual local canonical patches
establishes this exact table (same target shapes apply to Azure publication):

| Component | apiVersion / kind | metadata.name | Sole spec.template.spec list / sole item name |
| --- | --- | --- | --- |
| web | apps/v1 Deployment | web | containers / web |
| inventory | apps/v1 Deployment | inventory | containers / inventory |
| reservations | apps/v1 Deployment | reservations | containers / reservations |
| notifications | apps/v1 Deployment | notifications | containers / notifications |
| database-bootstrap | batch/v1 Job | database-bootstrap | containers / database-bootstrap |
| identity-bootstrap | batch/v1 Job | identity-bootstrap | containers / identity-bootstrap |
| broker-bootstrap | apps/v1 Deployment | rabbitmq | initContainers / definitions |

Each exact list contains one item with only name and image. Broker-bootstrap is the
SOLE initContainers exception: only Deployment rabbitmq's definitions.image may change;
it is not a Job and not a broker-bootstrap named container. Reject containers instead,
any other initContainer, extra item, adjacent field, metadata name/path or API/kind.
For the other six, initContainers is forbidden. All patches forbid command/env/args/
volumes/serviceAccountName, labels, namespace, annotations, resource policy and any
other subtree or key. Root allows only apiVersion,kind,metadata,spec; metadata only name;
spec only template; template only spec; pod spec only the exact table list key.
Compare normalized structure AND canonical generated patch bytes with the immutable
reviewed imagePatch implementation; a semantically broader patch is not release data.

Local release JSON exact keys: schemaVersion,component,image,digest,repository,
runAttempt,runId,sourceRef,sourceRevision,workflow. schemaVersion=1; component exact
filename; repository exact reviewed numeric ID/name; sourceRef=refs/heads/main;
sourceRevision forty lowercase hexadecimal Git SHA; runId/runAttempt positive safe
integers; workflow literal .github/workflows/validate.yaml. image is exact reviewed
GHCR repository for component, digest sha256 plus64hex, never tag-only or caller registry.
Local image patch must equal image@digest from its corresponding release record.

Azure release JSON exact wrapper keys schemaVersion,source,image,digest with
schemaVersion=1. source is the fully validated local release record above; image is
exact configured reviewed ACR loginServer/repository/component mapping (actual
publishDualRegistry convention), digest EXACTLY source.digest. Azure image patch must
match this wrapper. No independently rebuilt digest or altered repository identity.
Actual OCI index/config digest and org.opencontainers.image.revision/source labels are
verified against registry responses and trusted GitHub run/repository/workflow main
provenance using immutable existing promotion/publication validators. Private transient
verification response handling remains required; record claims alone are insufficient.
Reject foreign source, wrong registry/component/image-key, missing counterpart, unknown
fields, moving tags, digest mismatch and non-reviewed main promotion ancestry. Routine
updates may change only valid digest/provenance values in this fixed data schema.

Every ordinary promotion retains its reviewed Git commit, exact selected release-data
hash map and actual Argo deployed revision/digests. Recovery compatibility checks bind
actual selected release/schema version separately from the initial identity/role probe
closure. A changed application digest alone need not repeat both hosted actor identity
qualification; changes to the immutable classifier, imagePatch parser, release validator,
loaded module closure, authorization, admission, SQL, proxy or recovery execution asset
DO require applicable requalification. This separation is not a data-integrity bypass.

## Immutable remainder and required tests

All loaded JS code/re-exports/imports and scripts/promote-images.mjs, component-images
and release/provenance parser dependencies remain in complete immutable closure even
if loaded only for initialization. Dockerfiles, deploy/images/nginx.conf, workflow/
lock/runtime/tool pins, main Kustomizations and all authority/SQL/proxy templates remain
immutable. deploy/environments/local/release.json (aggregate legacy path) is NOT one
of these 28 exceptions; any needed future classification requires explicit review.
Generated runtime installation maps and recovery-activation.json retain their separate
already-reviewed exact classifications; this addendum creates no other exclusions.

Before implementation acceptance, intended-red tests independently mutate each fixed
patch shape/role-like field, registry/provenance field, unknown 29th path, new component,
duplicate key and executable import, and prove failure. A valid routine seven-component
app promotion with unchanged full code/authority closure succeeds without fresh initial
both-actor approval. Actual current release maps/provenance still validate at operation
start; no stale record or caller bool substitutes. Manifest enumeration remains complete
across immutable, installation, activation and exact28 release-data categories.

Preparation repair5 Q-D014-006: corrected broker target after direct inspection of all
seven actual canonical patch files and targets in scripts/component-images.mjs. Tests
must include valid broker definitions initContainer image-only promotion, wrong Job/
metadata/container paths and every adjacent-field negative; no other exception inferred.
