# Coordinator working record

Date: 2026-10-26. Branch `014-azure-aks-gitops`, initial HEAD
`d1c7238345136340ddbf3a9454807cefffc43c32`. No cloud resources have been provisioned.
Feature 013 artifacts/status must remain untouched.

## Latest owner decisions

- Budget clarified: **EUR120/month including applicable taxes**, 40 running hours.
  This supersedes the original EUR100 target. The owner supplied 21% tax; do not
  infer tax from timezone. Actual prices/inventory must be refreshed before apply.
  Analyst requirements synchronization and targeted preparation reviews are complete
  for the current design; implementation and provider evidence remain pending.
- Explicit dual GHCR+ACR publication belongs to this feature; FR025/SC011 added.
- Owner explicitly approved the original eleven exact policy exceptions, later
  two exact AVD0057 Queue-rule false positives and the exact workload-vault
  lifecycle warning in proposed-policy-exceptions.md (fourteen scopes total).
  Actual protected Blob auditing remains mandatory; no audit gap was accepted.
- Owner supplied actual tax rate **21%**. Current design estimate EUR97.94 net is
  EUR118.51 including tax; actual prices/inventory must be refreshed before apply.
  Certificate contact and tax input are retained in ignored
  `.local/azure/owner-inputs.json`; no personal email is committed.
- Owner explicitly approved SEC-D002 native Azure audit processing scope. The exact
  exception and exclusions are recorded in proposed-policy-exceptions.md; original
  reviewer confirmed that scope. Actual stored-row validation remains pending.
- Three default implementation repair rounds closed SEC-TF001, SEC-TF002 and
  SEC-SRC001/002. New SEC-TF003 requires exact actor read access to the qualification
  challenge. Owner extended the limit from three to six without resetting history.
  Round four added read-only own-environment challenge metadata access across workload
  generations and passed original-reviewer closure. Four of six rounds are used.
  See run-state.json and findings.json.

## Active implementation ownership

- `/root/implementation`: shared tool locks, quality/config/preflight, private
  Terraform orchestration and provisioning/bootstrap helpers, package scripts,
  formatter exclusions and narrow engineering guide discovery.
- `/root/terraform`: both Terraform roots/native tests/provider locks; source
  authority/audit/handoff batches implemented, SEC-TF003 closed for reviewed source.
- `/root/gitops`: Azure app/platform/Argo manifests, azure-runtime generator/tests,
  deployment/observability tests and upstream vendor provenance.
- `/root/operations`: operations/recovery helpers/tests and Azure workflows except
  azure-images, operator runbook.
- `/root/promotion`: promotion/component pipeline helpers/tests, existing component
  wrappers, azure-images workflow and image affected-path classification.
- Architect's current drain/ownership/restore-read delta passed targeted preparation
  reviews at plan C42A81B0B7147E3667C067CB3B10C1B6F3FE025F903CAD9DB219AE2833BDACEC,
  with T001–T068 preserved. Verifier/security reviewers are reused for independent
  bounded and final reviews. Only six agents may run concurrently.

All workers were told they share the codebase, not to revert others, to format exact
owned files per edit and to retain intended RED/GREEN evidence. Do not run a global
formatter while they write. Final whole-repository checks are coordinated centrally.

## Settled implementation seams

- State: same account/RG but separate foundation/environment containers and keys;
  recurring workflow actors must not read foundation state.
- Operation lease container is in retained **recovery Storage**, not state Storage.
  Safety-stop/images require only the relevant narrow network/DNS prelude and
  operations-container lease rights in addition to their actual AKS/ACR duties.
- DNS control-plane metadata gate serializes firewall admission before Blob access.
  Release DNS before waiting for Blob; admit/revalidate an explicit list of backend
  resources. Environment Terraform needs recovery+state; stop/images need recovery.
- Canonical ARM tags: application=equipment-reservations, environment; workload
  resources additionally generation. Validate retained vs workload appropriately.
- Private derived output cache wrapper: version, environment, generation,
  subscriptionId, tenantId, sourceRevision, outputsHash, outputs(raw TF).
  Infrastructure sourceRevision need not equal subsequent application main SHA.
- Runtime generator owns reviewed nonsecret infrastructure projection, excluding
  application image references/hash. Promotion owns per-component image patches
  and source-proven envelopes. First image PR aggregates all seven components;
  bootstrap fails until complete. Source tests use complete generated fixtures
  before actual runtime configuration exists, without claiming cloud readiness.
- Installer solely owns Argo installation and its CSI SecretProviderClass; SPC is
  excluded from downstream GitOps to avoid startup dependency. Other SPCs are GitOps.
- Backups use external orchestration with authenticated kubectl exec into pinned
  PostgreSQL clients and an isolated verification Job; private buffers/encryption
  remain external. No added local PostgreSQL binary prerequisite.
- GitHub current docs support approval-required PR workflow runs for bot-created
  opened/synchronize/reopened events. Use GITHUB_TOKEN and document Approve workflows
  to run; no extra GitHub App private key. Hosted acceptance must verify actual behavior.

## Review and verification state

Initial requirements/design/analyze passed; repaired delta passed at plan
E010145C2F20BBA916E698F4759C0B712500A177FFB49BCD81759F590299B98A,
tasks 4AB5E7B3F6CDAEEB41A54982ABBF5656B10EEC24CE5EFE55ABF32DC641DF2347.
These are preparation verdicts, not implementation approval. Reports are preserved.

Bounded Terraform security review found HIGH SEC-TF001: ambient planner object ID
would receive Secrets Officer through a saved plan. Original reviewer closed the
source bug after explicit approved-principal inputs and distinct-planner regression;
see terraform-security-repair-round1.md for exact reviewed hashes. Actual Azure
authorization qualification remains pending. Original reviewer also closed SEC-TF002
after moving the explicit human grant into human-only retained foundation. Fourteen
exact scanner/linter scopes are owner-approved; Blob auditing is required. Root
independently reproduced the workload-vault prevent_destroy finding after the worker
misclassified it as ACR. Its separate exact exception is now owner-approved; the
existing ACR scope was not silently broadened.

Native TF schema tests were 6/6 foundation and 4/4 environment before repairs;
fmt/validate passed, scanner/linter deliberate findings did not pass. Tool/CLI/process
and manifest tests are progressing, not final qualification. Pinned backend native
configuration checks caught/fixed an unsupported Tempo v2 config under v3.

Baseline format-check/lint passed with elevated NuGet access before implementation.
Later workers' full lint attempts failed sandbox network restore; these are not
regressions or passing evidence. Root must rerun final checks after freeze. Check
AppHost lockfile churn against original before restoring any generated-only change.
Root verified the later AppHost lockfile difference was exactly an empty net10.0
dependency graph from failed restore, then restored the exact tracked HEAD bytes.
This repair is not a successful restore/check result or a dependency upgrade.
Root independently ran `npm.cmd run infra:test` with provider-registry access:
exit 0, foundation19/environment8 mocked native contracts passed. Primary later
reported elevated `infra:check` and `infra:test` both exit 0 after fourteen exact
exception filters. These are source/mock gates, not actual Azure acceptance.

Live Azure role discovery: default subscription matches local CLI, current human has
Azure Owner and own-role Graph lookup confirms Global Administrator. Do not require
the broader roleAssignments Graph endpoint, which failed despite own-role success.
Actual ACME contact and 21% tax input are saved privately. Full deployment config,
operator group, DNS delegation and GitHub protected environments are not established.

Full code review, checks, live local deployment, backup, teardown, hosted recreation,
explicit recovery, convergence and human acceptance remain pending. Do not declare done.

Subsequent checkpoints: fifth implementation repair batch is closed by the original
reviewers (`ci-quality-repair.md`, `recovery-admission-security-repair.md`). Final approved
repair batch six addresses broker counter freshness and safe failure metadata; it is
not yet closed. Preserve the six-round limit without resetting author work-batch counts.
The root independently passed thirty-seven native provider tests without skips; exact
bounded source is recorded in `native-provider-snapshot.json`. Later broker/permission
source changes require affected revalidation, not reuse of that snapshot as current.

Qualification v2 and the separately reviewed writer-observation/credential/ACME proposal
are integrated into authoritative artifacts; there are now seventy-two task IDs. Both
new designs have bounded preparation passes, not implementation acceptance. Source work
continues on proof consumption/activation, launch closure, exact recovery permissions,
private continuity bundles, and public backup/restore orchestration. No Azure resources
have been provisioned. The user's progress question was answered without claiming a
completion percentage, live success, or feature acceptance.
