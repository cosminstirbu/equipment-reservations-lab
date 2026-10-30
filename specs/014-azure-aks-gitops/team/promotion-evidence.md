# T040 dual-registry publication evidence

Scope: scripts/promote-images.mjs, component pipeline integration and their tests;
Azure image workflow and seven component wrapper workflows. Existing local mode
remains the default until AZURE_IMAGES_ENABLED is explicitly true after ACR exists.

## Design and test boundary

One existing source-proven GHCR publication is the only build. Dual mode copies its
immutable index to ACR; retries and ACR recreation reuse that same digest. Both raw
remote index bytes must hash to the recorded digest; each required platform's OCI
revision/source labels must match the original component record. No Git mutation
occurs before these checks succeed. Azure configuration is proposed for review;
the existing local publication mode retains its prior behavior.

Public command/process tests retain actual release/intent validation, process policy, hashing,
serialization and file output. A subprocess fixture replaces only the Docker
registry CLI boundary, using Docker's documented raw-index and image-config JSON
shapes. A preload redirects Docker execution into a real Node child process so
process exit status, private stdout/stderr and execution budgets remain real.
Fixture results are not live GHCR/ACR contract acceptance. Functional mismatches,
copy failure and repeat invocation must leave deployment references untouched.
After the shared lease requirement was clarified, successful narrow registry tests
call the exported runPromotionCommand through a real Node driver; these do not
claim to establish the configured Azure lease wrapper. The actual production CLI
test separately proves missing private lease inputs prevent all registry access.
Configured positive ARM/Blob wrapper contracts remain in azure-operations.test.mjs.
GitHub API contract fixtures preserve the real gateway, SHA1 Git blob verification,
source-lineage checks, patch generation, parent/tree creation and compare-and-swap.
The pure envelope validator is a justified solitary deterministic schema/policy test.

All registry calls are async private-capture, bounded to 45 seconds for reads and 120
seconds for immutable copy; no automatic mutation retries/circuit breaker. Explicit
operator retry is safe because content is copied from the same immutable source;
unexpected destination digests fail. GitHub API mutations use exact parents and
existing bounded private handling. Safe output is only phase/component/digest;
raw registry configuration/provider errors never reach logs.
The production dual/repopulate CLI requires withRegistryPublication: the shared
external operation lease, minimal recovery-storage runner admission and retained DNS
gate serialize publication against local and workflow destruction. Async child
execution allows lease/admission heartbeats; cancellation propagates to Docker and
GitHub requests. This adds operations-container lease and exact recovery-account/
DNS-gate prerequisites to AcrPush; it grants no state/secret read. The wrapper owner
bounded registry publication to 20 minutes. CLI destination must match the approved
output cache's acr_login_server. Workflow-private inputs are mode0600, Docker
credentials use a dedicated runner-temp directory, and always cleanup attempts all
owned inputs and credentials.

## Ownership and reviewed delivery decisions

- Coordinator and GitOps owner agreed image patches and release envelopes have one
  owner here. Runtime generation emits/hashes no application image values.
- Seven Azure image patches reuse existing imagePatch shapes, including bootstrap
  Jobs and RabbitMQ init container. Release envelope schema is exactly
  `{schemaVersion:1,source:<original GHCR component record>,image:<ACR repository>,digest:<source.digest>}`.
  `validateAzurePublication` validates the exact destination/repository/patch;
  async `verifyAzurePublication` additionally verifies actual source and destination.
- One `automation/azure-image-promotion` branch/PR accumulates the initial seven
  verified components. Strict Azure manifest checks remain pending/failing until
  complete; no second permissive bootstrap lane exists. Later updates use the same
  reviewed proposal flow. Transactions preserve sibling proposals, use main's current
  tree plus exact parents, refuse unmanaged branches/conflicts/races and never force
  an update. A merged branch can be reused safely. Same-source divergent digests and
  stale/unproven source lineage fail without changing refs. No automatic retry/merge.
- AZURE_IMAGES_ENABLED must explicitly equal true only after ACR is provisioned;
  ACR_LOGIN_SERVER identifies the current destination. Disabled mode retains existing
  GHCR/local behavior. Enabled mode gates every existing local promotion on successful
  main-only dual publication. GitHub PR/identity permissions are narrowed to trusted
  component/image jobs; readonly PR workflows are unchanged.
- The protected azure-images GitHub environment uses AZURE_IMAGES_CLIENT_ID,
  AZURE_TENANT_ID and AZURE_SUBSCRIPTION_ID plus private AZURE_CONFIG_JSON and
  AZURE_OUTPUTS_JSON. Coordinator verified azure/login v3.1.0 commit
  a641126d1b8aa4d1fa005f4f92df94a3a4c4c906 through official annotated-tag dereference.
- Native GITHUB_TOKEN review PRs require the owner's Approve workflows action before
  required runs execute, per the coordinator's current official GitHub-doc evidence.
  Required checks must pass the exact candidate head before merging; hosted behavior
  remains acceptance work. No new GitHub App private key was introduced.
- ACR recreation reads committed reviewed release envelopes using exact trusted-main
  Git SHA, preserves the original publication record, and rechecks/copies the retained
  GHCR digest; it does not depend on expired Actions artifacts or rebuild source.
- T028 classification excludes only infra/azure/, the seven audited Azure operational
  scripts, five Azure workflows, existing deploy configuration and explicitly named
  infrastructure/operation package scripts. Other infra paths, unknown Azure build
  scripts, application/build inputs and dependency metadata remain conservative.

Provider contracts consulted 2026-10-26:
[Docker inspect](https://docs.docker.com/reference/cli/docker/buildx/imagetools/inspect/)
and [single-index carbon copy](https://docs.docker.com/reference/cli/docker/buildx/imagetools/create/).

## Preparation

- Read AGENTS, constitution, team protocol/coder role, implement skill, feature
  artifacts and formatting/testing/tooling/resilience/observability guides.
- `SPECIFY_FEATURE_DIRECTORY=specs/014-azure-aks-gitops` prerequisite check through
  Git Bash passed; both custom/built-in checklists have zero unchecked entries.
- No extension hooks file exists. No external publication or cloud mutation authorized
  in this batch; actual remote-registry acceptance remains pending.

## RED/GREEN

Commands ran on Windows/Node24.15.0. Each source edit was followed by exact-file
`npm.cmd run format -- <owned paths>` and reread. The default PowerShell npm.ps1 was
blocked by execution policy; npm.cmd was used without changing system policy.

| Exact focused command | Intended RED | GREEN |
| --- | --- | --- |
| `node --test --test-name-pattern='dual publication' scripts/promote-images.test.mjs` | Exit1: valid dual mode failed because command did not exist (after fixing a Windows file-URL fixture prerequisite). | Exit0: copy/retry plus partial-copy, source/destination mismatch, missing platform, wrong labels and untrusted identity cases. |
| `node --test --test-name-pattern='verified Azure publication' scripts/promote-images.test.mjs` | Exit1: missing proposeAzure export. | Exit0: exact Azure patch/envelope, review branch CAS and PR, no main update. |
| `node --test --test-name-pattern='aggregate Azure proposal' scripts/promote-images.test.mjs` | Exit1: merged branch refused; subsequent same-source divergent digest was wrongly accepted. | Exit0: aggregation, race/unowned branch denial, merged branch reuse and divergent-content denial. |
| `node --test --test-name-pattern='ACR recreation' scripts/promote-images.test.mjs` | Exit1: repopulate command missing. | Exit0: real committed Git envelope reused without current-run substitution or build. |
| `node --test --test-name-pattern='explicit Azure mode' scripts/component-workflows.test.mjs` | Exit1: missing azure-images workflow; subsequent missing explicit main guard failed. | Exit0: all seven local promotions gated, protected main-only OIDC, pinned actions. |
| `node --test --test-name-pattern='Azure-only infrastructure' scripts/component-selection.test.mjs` | Exit1: infrastructure-only changes selected all seven images. | Exit0: PR/main select none; mixed Inventory change still selects its consumers. |
| `node --test --test-name-pattern='registry authentication' scripts/promote-images.test.mjs` | Exit1: Windows az.cmd spawn prerequisite failed. | Exit0: actual child success/status19 failure with private output suppressed. |
| `node --test --test-name-pattern='Azure publication validation' scripts/promote-images.test.mjs` | Exit1: malformed image value threw TypeError instead of safe policy error. | Exit0: exact schema/registry/repository/patch and safe rejection. |
| `node --test --test-name-pattern='lease heartbeat' scripts/promote-images.test.mjs` | Exit1: sync registry execution prevented heartbeat ticks during child execution. | Exit0: async child waits permit heartbeat. |
| `node --test --test-name-pattern='prevents authenticated GitHub' scripts/promote-images.test.mjs` | Exit1: aborted lease still attempted GitHub request. | Exit0: abort stops before authenticated request. |

Broader verification:

- `$env:MANIFEST_KUBECTL=(Resolve-Path .cache/promotion-tools/kubectl.exe).Path; node --test scripts/promote-images.test.mjs scripts/direct-promotion.test.mjs scripts/component-workflows.test.mjs scripts/component-selection.test.mjs`: exit0, 93 tests/92 pass/one Windows-specific skip, 178s. This run predates the final async lease/API extraction; selection implementation remained unchanged afterward. Actual cached kubectl rendered production promotion candidates and real Git promotions in either order. Cached executable SHA256 F675D70224B42B84E0442E8D7644EFBE440E4451A4B02BDC5D95823A96316BA8.
- `npx.cmd eslint scripts/promote-images.mjs scripts/promote-images.test.mjs scripts/component-workflows.test.mjs scripts/component-pipelines.mjs scripts/component-selection.test.mjs --max-warnings 0`: exit0.
- Exact-owned-file `npx.cmd prettier --check` across the five JavaScript files and nine workflow files: exit0.
- `git diff --check -- scripts/promote-images.mjs scripts/promote-images.test.mjs scripts/component-workflows.test.mjs .github/workflows`: exit0 at the checked snapshot.
- `npm.cmd run format-check`: exit1 due other workers' in-flight cert-manager, middleware CRD and azure-terraform files; no unrelated formatting performed.
- `npm.cmd run lint`: exit1, .NET restore/build NU1301 because api.nuget.org sockets were sandbox-blocked. No elevated retry; coordinator owns final whole-repository gates after source freeze. Existing AppHost lockfile status had no content diff; no unrelated restoration was performed.

Final affected-scope rerun:

- `$env:MANIFEST_KUBECTL=(Resolve-Path .cache/promotion-tools/kubectl.exe).Path; node --test scripts/promote-images.test.mjs scripts/direct-promotion.test.mjs scripts/component-workflows.test.mjs`: exit0, **66 tests/65 pass/one Windows-specific skip**, zero failures, 15.89s. This matches the async shared-lease command implementation and isolated workflow-input/credential cleanup. Includes actual Git and kubectl candidate rendering, real subprocess cancellation/heartbeat, public production CLI lease-prerequisite denial and actual workflow write/cleanup shell execution.
- Final scoped ESLint command above: exit0. Final exact-owned-path `git diff --check`: exit0. Exact-file Prettier checks passed; all subsequent source edits were formatted and reread.
- Operations owner reported positive configured-wrapper contract coverage in azure-operations.test.mjs: real private config/cache/parser/hash, real token child process and native HTTP ARM/Blob fixtures; shared lease held, DNS gate released, recovery-storage admission present during callback and removed afterward, with no AKS/state/vault requests. Its precise command/revision evidence belongs to that owner's report.

SHA256 handoff snapshot:

| File | SHA256 |
| --- | --- |
| scripts/promote-images.mjs | 9EEB27A35AF8B7071569E1046DFC7D0DC5FA24C7B743C0895BFCFE14273AF513 |
| scripts/promote-images.test.mjs | 2937E8BAD9F3BB6C0E41BB0B48693BCFD95267CE86A0A439899FA678BCE709DA |
| scripts/component-pipelines.mjs | 3F2E8BBC341930AE797DFACE903F3B34F2B7DE285BD8E67414D6576DDFD768AA |
| scripts/component-selection.test.mjs | 75219040E7089FEE65E65846D9C92355D833A6B15246F0BE3DDF2B36E3A19484 |
| scripts/component-workflows.test.mjs | 719DE606350DD35B4304CCAB6AEA3637E112D4228837B056A08F21D9F65026E6 |
| .github/workflows/azure-images.yaml | DFFB7E91F83C0EB9129277E024E3CA043E7BC6DD00F729DCFDB803D6CCD06FF7 |
| .github/workflows/validate.yaml | CF4467F5E3C5B2C9F4C46AC246D403B7AD736B4EDEC0600B13ECF462E83C6A96 |

Remaining gates: actual GHCR/ACR publication and image-content/source contract,
controlled remote partial/mismatch/retry, hosted protected OIDC and native PR-run
approval behavior, new-ACR recreation, all final global checks after source freeze,
independent quality/security review and human acceptance. No external publication,
PR creation, push or cloud mutation was performed by this worker. T028's central
manifest-quality path gate is coordinator-owned and is not established solely by
the component selector tests. No checklist verdict or task acceptance was self-approved.
