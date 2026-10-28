Verdict: **changes_requested**, bounded to the four supplied files. No files changed; no cloud actions or intrusive probes.

Independently confirmed SHA256:

| File | SHA256 |
|---|---|
| admission.json | `67A2CA6AF319BC19FB9844CE113700E9C6DB3EEF5EE76F368D68C4EDE3EF8E38` |
| roles.json | `46E578EF7983F32E0CC488032C2C05AAB2560FAD302E5F0C64A9D569177D69FC` |
| qualification.json | `73060B82A2D698FCCE92F6173910BAD046C7DDBFEDCAF8BDFD200CEE8077EA10` |
| azure-runtime.mjs | `6245D2BAB41768156FE299A9B628380F9D314022C19EC8270F3163113C683086` |

**SEC-GO001 — Medium, blocking: verification admission permits unreviewed template additions.**

Evidence: admission.json:48 fixes CPU/memory values without bounding resource-map keys; :68 fixes the CSI driver and SPC without excluding `nodePublishSecretRef`, `fsType`, or additional `volumeAttributes`. The policy also leaves `dnsConfig` and container termination-message settings unconstrained.

Scenario/preconditions: the backup principal legitimately has Job-create authority. It can submit a nominally valid verification Job with additional CSI secret-reference/driver inputs or resource requests outside the reviewed template. Admission consequently fails the agreed exact-template boundary. For example, an additional large `ephemeral-storage` request remains unconstrained and can prevent scheduling. Arbitrary secret exfiltration through these fields was **not established** and is not claimed.

Remediation: bound resource-map keys and all supported optional template fields with security or execution effects; explicitly reject additional CSI inputs, custom DNS configuration and unreviewed termination-message settings. Account for API defaulted fields rather than comparing raw source JSON blindly.

Verification: native admission must allow the rendered Job and deny individual mutations for CSI secret reference, extra CSI attributes/fsType, extra resource keys, DNS configuration and termination-message path/policy. Test CREATE and UPDATE.

**SEC-GO002 — Medium, blocking: admission has no recovery SQL bootstrap path.**

Evidence: admission.json:24–32 matches every CREATE/UPDATE Job in `equipment-recovery`, then requires `equipment-verify-<hash>` and the verification ServiceAccount/template. No installer-specific SQL exception exists in these four files. The contract requires a separate cloud-only recovery SQL bootstrap Job (operations.md:185–192; plan.md:761–764).

Consequence: once this policy is active, the legitimate separate SQL bootstrap Job cannot be created. Recovery activation cannot satisfy its database-role prerequisites.

Remediation: provide the reviewed SQL installation path with explicit authenticated installer authorization and its precise intended scope. A name-only exemption must not let the backup Job creator submit an administrative workload.

Verification: actual installer can create the intended SQL Job; backup and restore cannot create that Job, exploit its name, or bypass verification admission.

**SEC-GO003 — Medium, blocking: restore lacks required Deployment-read authorization.**

Evidence: roles.json:121 grants restore GET only on `deployments/scale`. It supplies no `deployments` GET rule for the five writers. operations.md:150–151 explicitly requires both named Deployment and scale GET for writer-zero verification.

Consequence: the actual restore principal cannot perform the agreed Deployment checks, encouraging an incorrect fallback to incomplete checks or broader permissions.

Remediation: add GET on exactly `web`, `inventory`, `reservations`, `notifications`, and `keycloak` Deployments. Keep scale mutations and other Deployment access denied.

Verification: actual restore principal can GET those five Deployment and scale resources; cannot read another Deployment or patch/update either resource.

Other bounded observations: actor bindings use their corresponding supplied principal IDs; fixed client exec grants remain actor-separated; qualification Pods have no WI/CSI credentials; installer qualification bindings remain outside the generated Kustomization. No additional confirmed security finding in those portions.

Evidence limitations: this was static source inspection and hash verification. No Kubernetes CEL compilation, native admission/RBAC tests, real SQL execution, CSI behavior or Azure-RBAC qualification was performed. Service admission constrains the reviewed selector, port and external-exposure fields; this does not establish live network isolation or full feature approval.
