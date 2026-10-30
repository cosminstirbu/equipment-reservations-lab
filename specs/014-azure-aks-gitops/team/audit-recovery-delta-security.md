# Targeted preparation security review — audit and recovery delta

**Verdict: changes_requested.** One narrowly scoped policy decision remains: Azure-native audit metadata processing before transformation. No provisioning or actual disclosure is asserted.

Reviewed hashes:

| Artifact | SHA-256 |
|---|---|
| `spec.md` | `19D1024F90F7C8CB55F09CBC5221A80539B8CE49DE24BE67D84C8BAC2CEF2C72` |
| `plan.md` | `E6EC1711E8DD5AF84149E355535B79EB7704D6CD45F3C46EE515CDE0BBC033E8` |
| `tasks.md` | `E6057614F079E573A6BCC3C056AE0F7522DB9D434F9328C106DB213E3B50D6B2` |
| `contracts/operations.md` | `112D4889B3FE49AFBAFD47A18FF910F0237DECD11644CBE9B3D99025712F3E30` |
| `data-model.md` | `93B535ECA4164C9152908D9FE0A4992729A919F561ECB848875DC218E7A3F464` |
| `research.md` | `25617383D0B49494B3D76BFA64B270044EDAA627BC33203D68150FDC05C86B5F` |
| `quickstart.md` | `DCCE1F89DE50943FE7CE83808259B4BD800E25D0D8FC8FD12B75680D1CB34768` |
| `decisions.md` | `61E1E41E820991D68E19BB2DF804C903A76BAFB12D548B48C0D3CE6D6656C675` |

## SEC-D002 — Native audit metadata reaches Azure Monitor before privacy transformation

**Category:** security/design-policy  
**Severity:** medium  
**Blocking:** yes, before enabling affected diagnostics.

**Evidence:** Plan, “Protected retained Blob auditing,” explicitly distinguishes ingestion transformation from source-side redaction. Constitution V requires specific human approval for personal data in telemetry; the observability guide applies this to exported fields. Approval to remove sensitive/personal fields before durable ingestion does not explicitly cover their earlier provider processing.

**Scenario:** Human or workflow Blob requests produce native diagnostics. Azure Monitor receives those records before the workspace transformation removes disallowed fields.

**Confirmed field distinctions:**

- Native schema includes caller IP/port and requester UPN; UPN can appear for human requests.
- Other excluded metadata includes requested/source/destination URIs, object identifiers, authentication hashes and authorization-policy details.
- `AuthenticationHash` is a hash; `AuthorizationDetails` describes authorization policy. These are not evidence that bearer credentials are logged. Microsoft explicitly states SAS tokens themselves do not appear in these logs. [Schema](https://learn.microsoft.com/en-us/azure/azure-monitor/reference/tables/storagebloblogs), [Blob monitoring guidance](https://learn.microsoft.com/en-us/azure/storage/blobs/blob-storage-monitoring-scenarios).

Workspace transformations operate after source delivery and before workspace ingestion. This establishes transformation order, not a bound on provider buffering or a guarantee of zero intermediate persistence. [Transformation documentation](https://learn.microsoft.com/en-us/azure/azure-monitor/data-collection/data-collection-transformations).

**Required resolution:** Obtain specific approval for unavoidable Azure-native metadata processing, or redesign collection to exclude forbidden data before export.

A reviewable approval scope is:

- Only `azurerm_storage_account.state` and `.recovery`, their `blobServices/default` diagnostics, and StorageRead/Write/Delete categories.
- Processing by Azure Storage diagnostics and Azure Monitor before the configured workspace transformation.
- Native metadata such as caller IP/port, human UPN where present, object/URI metadata and derived authentication/authorization metadata.
- No permission to add passwords, raw tokens, request/response bodies, plaintext backup contents, or application personal data.
- Existing safe-column transformation before workspace storage; no raw secondary sink/export/archive.
- Thirty-day retention applies to transformed workspace records. Do not promise a documented maximum for internal provider processing when none has been established.

**Verification:** Attach/verify transformation before diagnostics, inspect actual stored rows for forbidden fields, test operator-only access, and expose audit gaps. Synthetic tests supplement this evidence; they cannot prove provider internal retention.

No risk acceptance is recorded by this review.

## Other reviewed changes

**SEC-TF002 design solution: pass.** Foundation-owned authority grants the explicit human operator Secrets Officer at the retained workload RG. Environment delegation remains ServicePrincipal-only. This resolves the human-grant mismatch without permitting workflows to assign arbitrary Users. Source closure still requires implementation re-review.

**OIDC credential seam: pass.** Initial creation/rotation remains human maintenance; recurring deployment reads only the two named source secrets and writes compatible workload copies. No recurring Graph-write, whole-vault read, or recovery unwrap authority is introduced.

**Backup authorization/quiescing: pass for preparation.** The design specifies reviewed deny-sync windows, exact scale subresources, bounded drain, failure restoration, persisted maintenance ownership, distinct fixed client Pods, and isolated verification constrained by fail-closed admission. Arbitrary Deployment/Argo edits and ClusterAdmin substitution remain prohibited. Actual AKS authorization/admission denial must precede role activation.

**Budget and exceptions:** The fixed EUR120 tax-inclusive calculation and required actual tax input are consistent. Only the eleven explicitly approved exceptions may activate; Blob auditing is not waived. Unapproved new scanner findings remain blocking.

No other policy decision is required by this bounded delta review. No implementation sources changed or assessed for full approval; no intrusive checks or paid operations ran.
