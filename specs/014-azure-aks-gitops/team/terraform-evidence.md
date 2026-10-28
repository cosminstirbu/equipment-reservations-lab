# Terraform resource contracts

Scope: T010 native mock-provider tests and T011 retained foundation, feature 014 only.
Tests retain actual Terraform HCL evaluation, provider schemas and plan construction.
Only Azure/AzureAD provider side effects are replaced by Terraform native mocks.
Assertions concern planned encryption, persistence, federation and authority boundaries;
they do not claim live Azure acceptance. Resources cannot be provisioned by these tests.

## Red evidence

`terraform -chdir=infra/azure/foundation test -no-color` and environment equivalent,
using pinned Terraform 1.17.0 and signed AzureRM 5.11.0/AzureAD 3.10.0 providers:
exit 1, reference to undeclared resource (`azurerm_storage_account.state` and
`azurerm_kubernetes_cluster.application`) before resource implementation. Initial
unknown-provider setup failure was resolved before recording the intended red.

Checklists: requirements 16/16; azure-operations 20/20; zero unchecked.
Spec Kit prerequisite script ran successfully with Git Bash and resolved feature 014.
No extension hooks installed. No paid Azure operation executed.

## Source/output classification

Terraform initialization and schema retrieval in private .cache; signatures verified
by Terraform. Plan/state/provider diagnostics stay private, with selected safe evidence
only. Application secret values are not Terraform inputs/resources/data sources/outputs.
AzureRM storage resource computed account keys can enter private state despite shared
key authentication being disabled; these are not application credentials and disabled
keys do not authorize Blob data access. State remains sensitive and access-controlled.

## Pending

T012 held for Premium managed OS disk design amendment. Foundation network fields
await architect resolution of hosted-runner access and scanner policy constraints.
Independent review, full static gates and live acceptance remain pending.

## T010-T012 current finite batch evidence

Both roots implemented against signed AzureRM5.11.0/AzureAD3.10.0 schemas and exact
Terraform1.17.0. Lockfiles include verified Windows/Linux hashes. AKS5.11 requires
node_provisioning_profile and subnet service_endpoint blocks; these were checked
against the actual provider schema rather than legacy examples.

Current commands and outcomes:

- terraform fmt -check -recursive infra/azure/foundation infra/azure/environment: PASS.
- terraform -chdir=infra/azure/foundation validate -no-color: PASS.
- terraform -chdir=infra/azure/environment validate -no-color: PASS.
- terraform -chdir=infra/azure/foundation test -no-color: PASS, six native cases.
- terraform -chdir=infra/azure/environment test -no-color: PASS, four native cases.
- TFLint foundation with committed config and pinned plugin: PASS.
- TFLint environment: FAIL, ACR prevent_destroy warning; no suppression.
- Actual pinned-policy Trivy source scans: FAIL on exact design-policy findings
  listed in terraform-policy-findings.md. Supplying explicit synthetic source expiry
  resolves the unknown-variable AVD-AZU-0014 finding without suppression.

Native tests use mocked apply for resource graph assertions and mocked plan for
negative validation. Real provider schemas/configuration checks remain enabled;
only external provider effects are mocked. Schema-valid ARM IDs replace Terraform's
otherwise random mock strings. Mock tests do not prove Azure provisioning or policy
acceptance. Test-fixture future expiry and zero tax are synthetic, never defaults.
Supplementary scope assertions were added after core resource implementation; initial
intended RED was captured before resources. No claim that every later assertion had
an independent pre-implementation red execution is made.

Least-privilege correction: foundation/environment state use separate containers in
the same account with separate keys; workflow Blob data grants cover environment
state only. Operations live in the existing recovery account; stop has no state-account
network/data role. Reaper has no Blob operations data grant and uses ARM recovery.
Network ARM write privileges are broader than firewall-property permissions and
must remain exact-resource scoped behind trusted operational command contracts.

Explicit control-plane and kubelet managed identities avoid implicit identity
ownership and permit exact subnet/IP/identity/AcrPull grants. This also permits native
contract evaluation of the configured kubelet identity rather than bypassing a missing
computed provider block. Keycloak/AppHost/local feature013 remain unchanged.

Separate root inputs beyond config:
foundation recovery_key_expiration_date (required reviewed future timestamp),
network_gate_ready (defaultfalse until operational TXT record verified);
environment foundation (validated IDs/principals projection), workload_secret_scopes
(canonical name-only map derived from scripts/azure-runtime.mjs).

Pending: exact scoped security/TFLint exceptions or design fixes; source-expiry fixture
integration in shared quality CLI; post-create operator/lifecycle/recovery grants and
Entra registrations in assigned later tasks; actual saved-plan security scan;
repository-wide format/lint (coordinator); independent implementation review; live
Azure/DNS/HTTPS/hosted/recovery acceptance. No paid apply was executed.

## SEC-TF001 targeted repair

Removed ambient caller identity from BOTH roots' authority decisions. Required
foundation variable bootstrap_operator_object_id is the reviewed human ID; explicit
approved_operator_object_ids output feeds environment grants. Workload secret
population uses only that explicit set plus the configured apply principal. The
identity creating a saved plan is no longer a grant input.

Regression boundary: actual native Terraform mocked plan with planner object ID
99999999-9999-4999-8999-999999999999, apply ID55555555-5555-4555-8555-555555555555,
and approved human ID77777777-7777-4777-8777-777777777777. Before repair, the new
saved_plan_never_grants_planner_secret_access assertion failed (four passed/one failed)
because planner received Secrets Officer. After repair, five environment cases pass,
including the same distinct-planner assertion. Foundation six cases remain green.
Both roots validate and fmt-check pass; foundation TFLint passes.

No risk acceptance is claimed for SEC-TF001. Independent reviewer closure is required.
T033/T036/T046 are NOT complete: remaining exact resource bindings/Entra/crypto grants
and ambiguous recovery Kubernetes authority remain pending. Coordinator requested a
bounded freeze before architect Blob-audit design; no broad Writer/ClusterAdmin
recovery grants were added. User-approved policy handling is owned by the coordinator
and primary quality owner; no inline or broad suppression was added here.
