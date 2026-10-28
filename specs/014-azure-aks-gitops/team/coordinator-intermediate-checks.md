# Coordinator intermediate checks

These are development checkpoints, not final handoff or acceptance evidence.
Date: 2026-10-26. No cloud resources were provisioned.

- `npm.cmd run infra:check`, Windows, elevated registry access, exit 1: the shared
  gate stopped at an unapproved TFLint resource scope. This is a correctly blocking
  result, not a passing quality gate.
- Independently ran the already verified pinned TFLint 0.65.0 with committed AzureRM
  plugin 0.33.0/configuration against the environment root. Captured JSON privately
  and projected only public source metadata: one issue, zero scanner errors, exit 2,
  rule `azurerm_resources_missing_prevent_destroy`, `main.tf:231`, resource
  `azurerm_key_vault.workload`. The earlier worker classification as ACR was wrong.
- Confirmed `.local/azure/owner-inputs.json` is ignored. It contains the actual
  certificate contact and tax input; personal contact is not committed.
- Inspected the unrelated AppHost lockfile difference: failed restore had replaced
  its dependency graph with empty `net10.0`. Restored exact tracked HEAD bytes after
  verifying that specific generated failure. Subsequent content diff is empty. This
  is not successful restore or build evidence.
- Feature 013 remains untouched by this feature.
- Root later ran `npm.cmd run infra:test` with elevated provider-registry access,
  exit 0: nineteen foundation and eight environment mocked native contracts passed.
  These tests did not provision Azure resources.
- Primary subsequently reported elevated `infra:check` exit 0 after the fourteen
  exact exception filters, plus `infra:test` exit 0. Preserve the earlier correctly
  blocking result as historical evidence; final checks still need the final revision.

Final format/lint/tooling/provider/schema/workflow checks must run against the frozen
current source after integration. Live Azure, DNS, browser identity, audit, backup,
teardown, hosted recreation and original-data restoration evidence remain pending.

### Subsequent integration review checkpoint

- The owner approved the exact workload-vault exception; the authoritative approval
  record and decision discovery now agree on fourteen scanner/linter scopes.
- GitOps reported native RabbitMQ queue-drain and denied-operation contracts passing.
  Its native pinned Dashboard contract exposed an OIDC redirect mismatch: the actual
  image challenges with the public root URI, while Terraform registered `/signin-oidc`.
  A bounded Terraform regression/fix is assigned; affected review hashes will change.
- Independent quality review identified Q-CI014-001: mixed Azure/application changes
  select the full lane, which omitted Terraform and Azure manifest gates. The operations
  owner is repairing this in the fifth repair batch; original-reviewer closure remains
  required. Four repair rounds are completed; the approved limit remains six.
- Recovery admission/RBAC is frozen for independent security review. Operations
  continues the unbuilt activation, recurring qualification and backup/restore CLI
  composition. A proposed qualification schema revision is held for preparation review.
- `git diff --check` passed at this intermediate checkpoint; AppHost lockfile has no
  content diff. No Azure resources, external publication or feature acceptance resulted.
- Root independently reran `infra:check` after the Dashboard redirect fix: sandbox
  initialization failed, then approved provider-registry access completed with exit 0.
  `infra:test` also completed with exit 0: twenty foundation and eight environment
  mocked native contracts. Both correspond to `terraform-dashboard-snapshot.json`.
  Independent quality verified all twenty-seven hashes and both canonical digests;
  bounded quality/security review passed the exact redirect delta. Live login is pending.
- Root independently ran the seven-file native provider suite with
  `AZURE_PROVIDER_CONTRACTS=1` and verified kind/kubectl paths. Default sandbox access
  failed local Podman prerequisites and cleanup; the elevated local-Podman run passed
  all thirty-seven tests with zero failures/skips in 110.9 seconds. This includes real
  native admission CREATE/UPDATE, exact restore reads/denials, PostgreSQL roles/dumps,
  RabbitMQ drain/permission/TLS contracts, Dashboard challenge/authentication and private
  telemetry provider configuration. Owned resources were cleaned up. Source hashes,
  command and scope limits are in `native-provider-snapshot.json`; no actual Azure,
  Entra login, hosted identity or recovery acceptance is established by this run.
- After the continuity-role delta, root independently reran `infra:check` and
  `infra:test` with approved provider-registry access. Both exited 0; thirty mocked
  native contracts passed (twenty-one foundation, nine environment). Both reviewers
  independently matched all twenty-nine source hashes and canonical root digests in
  `terraform-continuity-snapshot.json`. Actual Azure delegation/object-scope/secret
  operation tests remain pending. Fourteen exact approved exception scopes apply.
- Root independently passed the frozen broker transport, RabbitMQ and cert-manager/
  Pebble contracts: thirteen tests, zero failures/skips, 126.0 seconds, elevated local
  Podman access and verified tools. This includes all three repaired diagnostic paths,
  collector-suspended live queue totals and both restored ACME account associations.
  Exact bounded source and scope are in `broker-acme-verification.json`. No real ACME
  issuance/renewal, Azure authorization or full recovery correctness is established.
