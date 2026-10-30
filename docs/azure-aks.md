# Azure AKS learning environment

Implementation is in progress under [feature 014](../specs/014-azure-aks-gitops/spec.md). This runbook distinguishes implemented command interfaces from pending live qualification. Feature 013's local Kubernetes workflow remains separate.

## Architecture and retained costs

Terraform foundation and environment roots have separate state. The foundation retains DNS for codingfunlab.com, state, operation records, private plans, recovery storage, federated deployment identities and the versioned recovery key. Operation records and the common Blob lease live in the recovery account, separate from Terraform state storage. Workload destruction must not target that root. The environment contains AKS, its network resources, ACR and a generation-named workload vault. Argo CD owns downstream Kubernetes configuration; infrastructure bootstrap owns Argo installation.

Two shared system nodes, single-instance PostgreSQL/RabbitMQ/Keycloak and single replicas are accepted learning compromises. This is not a production availability commitment. Stopping AKS preserves objects and persistent data but may encounter restart capacity constraints. Disks, IPs, load balancing, ACR, DNS and retained storage can remain billable. Refresh the West Europe bill of materials against the owner-approved EUR120/month including taxes and 40-running-hour target before paid provision. The owner supplied a tax rate of 0.21; do not infer tax from a timezone or language. A schedule or budget alert is not a spending cap.

## Owner prerequisites

Supply restricted private configuration with actual subscription, tenant, operator group, narrow public source ranges, supported regional Kubernetes patch, recovery key version and ACME contact/terms acceptance. Never put passwords, tokens or application secret values in Terraform configuration or state.

After Terraform creates the retained Azure DNS zone, enter its assigned nameservers at Porkbun. Verify authoritative delegation before certificate issuance. Let’s Encrypt does not charge certificate fees; Azure DNS and supporting infrastructure retain their own charges. cert-manager performs DNS-01 issuance/renewal using zone-scoped Workload Identity. Certificate readiness after restart must use normal trust verification.

Browser hosts are app.codingfunlab.com, identity.codingfunlab.com, argocd.codingfunlab.com and dashboard.codingfunlab.com. Argo/Dashboard require Entra assignment and operator source restrictions, independently of Keycloak. Data services, identity administration, historical backends and telemetry ingestion remain private. Use authenticated temporary localhost forwards for diagnostics.

## Operator enrollment and removal

Argo CD and Aspire Dashboard use direct `Equipment.Operator` app-role assignments
to the reviewed bootstrap human. The operator group remains for Azure/AKS access;
adding a member does not enroll that person in the two operator apps. This avoids
the premium license prerequisite of group-based application assignment. The
[approved contract](../specs/014-azure-aks-gitops/contracts/operations.md#owner-approved-direct-operator-app-assignments)
owns the access model.

Additional operators require explicit reviewed individual app-role assignments and
the appropriate Azure/AKS group membership. Remove both app assignments and group
membership when removing an operator; group removal alone leaves direct app access.
Verify denial using a fresh browser session after revoking applicable sessions.
Manage tenant/subscription administrator roles separately. Keep the protected
emergency-access procedure available and verify login/removal behavior during M2.

## GitHub trust setup

Retained federation environment names are azure-plan, azure-apply, azure-destroy, azure-lifecycle, azure-safety-stop, azure-admission-reaper, azure-backup, azure-restore and azure-images. Configure each environment's identity, branch restrictions and approvals consistently with the Terraform subjects before running workflows. Apply/destroy/restore require approval; unattended safety-stop and reaper must not wait on an approval gate. This single-owner repository cannot claim independent two-person approval. Do not enable prevent-self-review if no eligible independent reviewer exists.

Fork PRs receive source-only checks and no Azure identity. Privileged jobs use reviewed trusted revisions, job-scoped OIDC and SHA-pinned actions. Never run untrusted checkout under pull_request_target. Terraform plans/state/dumps/token output must remain private and must not be uploaded as public Actions artifacts. Approve only a plan bound to the exact SHA, inputs, policy/tool hashes, state lineage/serial and expiry; stale association requires a new plan and review.

## Current operations interface

The following CLI actions exist; actual Azure qualification is still pending:

```powershell
node scripts/azure-operations.mjs stop --config PATH --outputs PATH
node scripts/azure-operations.mjs safety-stop --config PATH --outputs PATH
node scripts/azure-operations.mjs reaper --config PATH --outputs PATH
node scripts/azure-operations.mjs start --config PATH --outputs PATH --state PRIVATE_DIRECTORY --kubeconfig PRIVATE_KUBECONFIG
```

PATH for outputs is a restricted derived cache wrapper, consumed through an allowlisted Terraform projection. The wrapper binds environment, generation, subscription, tenant, recorded infrastructure revision and selected-output hash. Bootstrap refreshes this cache from verified Terraform outputs; it is not a separate infrastructure authority or a committed inventory. GitHub environments supply AZURE_CONFIG_JSON and AZURE_OUTPUTS_JSON as private inputs. Do not print them or commit them. Commands retain private provider responses and print only safe phase/state metadata. An Azure authenticated session is required. Actual Azure/GitHub qualification remains pending; these commands are not approved for live use yet.

Start requires restricted private smoke-state.json, credentials.json, internal-ca.crt and persistence-checkpoint.json in its state directory, plus a nonadmin kubeconfig. Dedicated seeded test credentials must match the generated deployment values; weak historical fixture passwords are rejected. Lifecycle has no Key Vault secret-read permission: retain these private inputs locally or supply them through the protected lifecycle environment. Never include credentials in the output snapshot. The hosted start input/credential delivery workflow is still pending.

Start waits for the recorded thirty-minute stop settling interval, holds one bounded ninety-minute operation lease and renews each admission with an expiry no longer than thirty minutes. It records readiness only after actual Deployment/certificate convergence, mounted CSI secrets, six deployed HTTP scenario checks, retained persistence and correlated native Prometheus/Loki/Tempo history. Private diagnostic forwards use localhost, normal internal CA trust and authenticated Kubernetes transport; the Dashboard frontend uses HTTP inside that encrypted tunnel, while OTLP and historical services use HTTPS. Local process/API fixtures do not establish a live readiness pass or elapsed retention.

Backend access admits the runner to required retained storage accounts through the exact reserved DNS record's ETag gate. DNS is released before waiting for the common Blob lease; admission is revalidated after acquisition. Environment Terraform requires recovery storage for that lease and state storage for its backend; stopping needs only recovery storage. Cleanup removes all owned admissions before releasing Blob. Canonical resource tags must match application equipment-reservations and environment; workload resources must additionally match generation. Unknown addresses/tags and uncertain asynchronous writes block further mutation.

The unattended stop identity can stop/read the exact cluster, access only the recovery operations container, and manage the exact recovery-account network prelude and DNS gate. It cannot access state data, manage state-account network rules, start AKS, change AKS API access or read application secrets. Storage ARM write is broader than a firewall-only permission; exact resource scope and trusted fixed-purpose workflow code constrain it. The independent reaper uses ARM and DNS only, so blocked Blob/vault endpoints do not prevent cleanup.

The native Blob lease is renewable for sixty seconds; an admission record has a separate maximum thirty-minute expiry. An expired record does not automatically revoke Azure access. Finally cleanup and the independent five-minute reaper remove owned admissions and verify baseline. Unexplained addresses, invalid records, failed heartbeat or failed cleanup block further work. managedClusters/write is broader than property-only network access permission; exact resource scope and trusted fixed-purpose code constrain it. Lost-run cleanup is best effort through GitHub/Azure outages, not a guaranteed wall-clock TTL.

Monitor reaper and safety-stop workflow failures and last-run freshness. The safety stop targets 23:00 Europe/Bucharest, including seasonal offsets. A valid override needs actor, reason, issued time and expiry no more than twenty-four hours later. Schedules can run late or be disabled after inactivity; retain manual stop and authenticated ARM repair access. Never broaden source ranges to regain access. Repair only the exact recorded stale admission, preserve operator ranges and verify baseline before retrying.

## Recovery acceptance

Clean creation and restoration are separate operations. While running, quiesce writers, drain messaging, dump exactly the four application/Keycloak databases without owners or privileges, and capture compatible allowlisted credential/client/ACME state. Global PostgreSQL roles are not exported or restored. The separate reviewed Azure recovery bootstrap creates narrow backup/restore roles; restore can SET ROLE only to the four existing database owners. Envelope-encrypt each bounded object before uploading: fresh AES-256-GCM key and nonce, retained version-pinned RSA-OAEP-256 key wrapping. Backup authority can wrap; protected restore authority can unwrap. The RSA private key never leaves Key Vault. A lost retained key/version makes its encrypted backups unusable.

A completion marker requires actual isolated restore verification, not merely upload hashes. Keep seven successful daily sets; partial failures never displace the last verified point. Stopped backup must not start AKS. Destruction requires a fresh verified point and drain proof. Before restore, verify compatibility, suspend reconciliation/writers/bootstrap reseeding, restore credentials before data, then deliberately resume and prove original login/booking/messaging. Failed restoration remains failed; do not blindly retry mutations.

The approved recovery transport uses authenticated kubectl exec with the pinned PostgreSQL image's own clients and a separate isolated validation Job. Orchestration, encryption and upload remain external; no retained recovery credentials or unwrap permission enter application pods. This avoids an additional local PostgreSQL installation. Functional implementation and permission qualification of this transport remain pending.

The reviewed daily deny-sync window is 20:00–22:00 Europe/Bucharest, with backup planned at 20:05. This blocks Argo synchronization during that window; writer downtime is bounded by the actual quiesce/dump interval. Before scaling, sufficient window time must remain for all worst-case drain, dump, isolated verification, cleanup and exact replica restoration budgets. Backup never starts a stopped cluster. It scales web to zero, drains messaging, then stops the remaining writers and restores recorded replicas in finally cleanup. Restore requires a reviewed maintenance Git revision with synchronized zero writers and no seed Jobs. Native hosted backup/restore identities must prove named-resource allows and forbidden-resource denials on harmless qualification targets before credentials or recovery roles are activated. No administrator fallback is permitted.

Each isolated verification server uses emptyDir and only its verification password. Its owned Job and ClusterIP Service use the validated per-point `equipment-verify-<16hexhash>` name, fixed port 5432 and fail-closed admission policy. The backup client streams restore to that server; the actor cannot exec into verification Jobs. Cleanup attempts both exact owned resources. The shared lease prevents safety stop from racing backup, but an overrun can therefore make the 23:00 stop fail: independent time bounds and visible missed-run signals remain required.

Recovery now has fixed-client dump/owner-restore transport, backup/restore orchestration and a create-only Blob envelope/marker adapter, with process, crypto and native HTTP boundary tests. Completion follows isolated verification and successful cleanup/replica restoration; failed points cannot replace a successful marker. Compatibility and every encrypted object are authenticated before live restore writes. Public backup/restore composition still awaits actual identity qualification, approved broker-drain access and exact credential-bundle integration. Hosted workflows, full live recovery verification and destructive rehearsal remain pending. Do not perform teardown based on boundary tests.

The initial qualification producer is `node scripts/azure-qualification.mjs prove --config PRIVATE --locator PRIVATE --actor backup|restore --nonce UUID`. The dedicated Azure qualification workflow runs it only on trusted main under the actual protected azure-backup/azure-restore identities. Its private inputs are AZURE_CONFIG_JSON, AZURE_BOOTSTRAP_LOCATOR_JSON and AZURE_QUALIFICATION_NONCE; the nonce is not a public dispatch input. Bootstrap publishes an immutable private challenge only after ordinary readiness, binding actual cluster CA, reviewed roles, credential-free fixture UIDs and expected principals. Each actor must observe its own identity, successful named exec/scale permissions and actual HTTP 403 denials before its create-only proof is written. Local human execution is rejected.

Initial challenge keys are `activation/<environment>/<generation>/<nonce>.json` in qualification-challenges. Proof keys are `activation/<environment>/<generation>/<nonce>/<actor>.json` in the actor's qualification-backup or qualification-restore container. Actors cannot write challenges or list/read consumption records. Actual hosted qualification, direct two-proof validation/consumption, reviewed activation and recurring fresh proof composition remain pending. The reviewed record path is deploy/platform/azure/recovery-activation.json, outside Kustomizations; its presence is never authority to activate recovery.

The protected recovery configuration file has exactly `{ "version": 1, "brokerMonitorPassword": "..." }`, with a supplied 32–256-character credential and restricted file permissions. Bootstrap and backup must receive the same actual protected value. It is not generated silently or put in Terraform, snapshots or proxy Pod environment. Broker-monitor transport and its real queue/outbox drain checks are being integrated under the reviewed narrow access contract.

## Verification and acceptance

Azure PR/source checks run deterministic Terraform gates, mocked native contracts,
manifest checks and a fixed fast tooling suite. These checks do not provision Azure
or establish native-provider acceptance. The exact suites are in the source workflows.

Use the manual **Azure native provider qualification** workflow for the full local
provider/Kubernetes suite on the Linux runner. It has read-only repository permissions,
no Azure identity and one test file at a time; internal concurrency tests remain intact.
Run affected scenarios before accepting dependent deployment work. The workflow must
be available on the default branch before GitHub dispatch is possible. Keep it pending
until its revision-specific run actually passes; source-only green checks cannot
substitute for it. Existing application and local Kubernetes checks remain unchanged.

Use the [feature rehearsal](../specs/014-azure-aks-gitops/quickstart.md) and [operations contract](../specs/014-azure-aks-gitops/contracts/operations.md). Required acceptance includes trusted four-host HTTPS, positive/negative operator access, deployed journeys, private dependency denial, secret rotation, pod replacement, stop/start persistence, correlated bounded history, private-plan approval denial and complete recovery rehearsal. Each result must identify the tested revision and distinguish local fixtures from actual Azure/GitHub/browser evidence. Independent reviews, convergence and explicit owner acceptance remain completion gates.
