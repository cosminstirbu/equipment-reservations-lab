# Incremental delivery checkpoints

Owner approved this sequence on 2026-10-28. Stop after each milestone for review
and explicit permission to continue. This changes delivery sequencing, not feature
acceptance, security exceptions or permission to spend. Preserve all existing task
IDs and evidence. Source assessment baseline: `b2b0064`.

## Current checkpoint

2026-10-28: M0 accepted. M1 source-to-private-preview path now works and the actual
preview has independent quality/security assessment. **M1 is not complete:** no
retained foundation has been applied and live state/access/audit qualification is
pending. No automatic further Windows repair is planned.

Direct-user app assignment is now implemented, independently reviewed and verified
in a fresh actual preview. Before apply: obtain explicit source-publication
authorization and required Linux checks, then review a fresh main-qualified plan.
The local preview cannot be promoted into apply. No push/merge/apply is authorized.

## Outcomes and gates

| Milestone | Observable outcome | Acceptance boundary |
| --- | --- | --- |
| M0: feasibility | Deployment-readiness decision with exact blockers | Current quota/SKU, identity prerequisites and tax-inclusive BOM; supported runner and minimum safe dependency path |
| M1: foundation | Retained Azure resources and protected Terraform state | Reviewed plan, approved configuration/spend, native checks, actual state/access and Blob audit qualification before dependent sensitive use |
| M2: browser deployment | Application booking plus authorized Argo CD/Aspire browser access | Actual guarded vault creation/grants, runtime projection, immutable images, scoped secrets, trusted HTTPS, access denials and application readiness |
| M3: cost-conscious operation | Stop/start preserves a recorded booking | Actual lifecycle/readiness, serialized operations, safety schedule/override and running/stopped inventory |
| M4: GitHub delivery | Approved infrastructure change and dual-registry release | Actual OIDC/protected saved-plan execution, stale/unauthorized denials, verified GHCR/ACR content and GitOps reconciliation |
| M5: recovery/recreation | Original login and booking survive workload loss | Verified backup, protected teardown, clean hosted recreation, actual restore, independent final reviews and owner acceptance |

M2 may be application-ready with recovery-qualification-pending, as already allowed
by the [plan](plan.md) and [operation contract](contracts/operations.md#preparation-repair6-q-d014-007-creation-versus-grant-plan).
It cannot bypass vault family/current-generation qualification before secrets or
operational grants. Recovery credentials, production bindings, SQL and Application
remain gated. Initial verified image publication is a prerequisite for M2; complete
publication/promotion automation remains M4. This split needs owner agreement before
dependent implementation. Destructive recreation waits for M5's verified backup.

## Task mapping

Shared IDs denote slices, not permission to mark the entire task complete.

| Milestone | Primary task groups | Cross-cutting slices |
| --- | --- | --- |
| M0 | T006–T007, T060 feasibility only | Read-only assessment of foundation, installer and guard prerequisites |
| M1 | T001–T013 | T057–T058, T060, T063; prerequisite producer/guard portions of T076–T078, T080, T082–T083, T085–T086, T088–T089 |
| M2 | T014–T022, T035–T039; browser portion T041 | T055–T056, installer T061, separation T065/T068/T075, ordinary activation T082/T086, T084; initial artifact portion T040 |
| M3 | T030–T034 | T008–T009, T026, T057, T060 |
| M4 | T023–T024, T027–T028, T040; release portion T041 | T056, T063, T069, T075, T079, hosted apply T082; source preparation T029 |
| M5 | T025, T029, T042–T049 | T059, recovery T061, T062, T064–T074, T076–T078, T080–T083, T085–T091 |

T050–T053 provide scoped runbook/check/review/convergence work at each integrated
milestone. T054 remains final full-feature acceptance. Existing completed history
and unmet live checks remain unchanged.

## Execution boundaries

- M0 is read-only: three specialist assessments, maximum 20 active minutes each,
  no native cluster reruns, no paid resources, no code repairs. Coordinator owns
  this checkpoint and status metadata; specialists return concise evidence.
- Existing Ubuntu 24.04 native provider lanes in `pull-request.yaml` and
  `validate.yaml` are the intended acceptance runner. They have not been qualified
  at this checkpoint. Windows/Podman feedback is not substitute Linux evidence.
  A fixture capacity/scheduling change requires implementation and verification;
  none is made here. No workflow dispatch or publication occurs in M0.
- Use focused/static checks while editing and affected integrated gates at handoff.
  Follow the current [verification profiles](../../docs/engineering/testing.md#verification-profile).
- Historical preparation 9/9 and implementation 18/18 remain exhausted. M0 assesses
  a changed strategy; it does not reset repair budgets. A concrete integration
  batch and explicit extension are needed before resuming blocked repairs.
- Retain the existing trusted human/trusted-main/installer/backup-producer boundary.
  Evidence is not WORM or independent signing. Do not expand the threat model or
  add machinery for compromise of these trusted anchors without an owner decision.
- At each checkpoint, report implemented, source-verified and live-qualified
  separately. No passing subset or milestone implies full-feature completion.

## M0 checkpoint: 2026-10-28

**Status: M0 accepted by the owner on 2026-10-28; M1 authorized, starting with the
bounded source integration batch below. No live deployment clearance.**

### Current evidence

- Ignored owner inputs contain the supplied 21% tax; the deployment configuration
  still needs to bind the selected account, operator group and exact SKU/patch.
  Subscription and tenant are discoverable from the existing CLI session; the owner
  does not need to supply them again. No private values were copied here.
- Follow-up direct `az account show --only-show-errors --output json` succeeded
  outside the sandbox: enabled default subscription, tenant and user identity are
  present. The sandboxed call failed on access to local Azure configuration.
  This corrects the earlier unavailable account observation. Subsequent checks below
  supersede the initial unknown quota and permission prerequisites.
- Subsequent direct read-only CLI checks established a concrete quota blocker:
  `az vm list-usage --location westeurope` succeeded in 2.665 seconds. Regional
  cores: limit 10, used 0. Dsv5-family cores: limit 0, used 0. The planned two
  D4s_v5 nodes require eight family cores. No quota request or alternative
  configuration was applied. This supersedes the earlier unverified quota status.
- Security prerequisite reads support the current human bootstrap authority:
  subscription ARM permissions cover resource groups, custom roles/assignments,
  policy definitions/assignments, identities/federation, Storage, Key Vault and audit
  collection rules. Three permission blocks, no pagination; one visible unconditional
  Owner role and no visible subscription deny assignments. Graph showed Global
  Administrator membership and app registration allowed by default-user policy.
  These are read-only prerequisite observations, not successful creation/federation,
  data-plane/provider qualification or proof of future workflow permissions.
- `az aks get-versions --location westeurope` succeeded in 1.926 seconds and returned
  approved-family patches 1.35.0 through 1.35.8. Candidate exact patch: 1.35.8;
  no deployment input was changed. Actual SKU/deployment capacity is not guaranteed.
- `az vm list-skus --location westeurope --size Standard_D4s_v5 --all` did not
  finish within the investigation window; the local client was interrupted (exit 1).
  Subscription-specific SKU restrictions remain unknown. Existing `runAzure` wrapper
  also failed status 2 after 2.755 seconds while direct CLI succeeded; this does not
  establish authentication failure. No wrapper repair or repeated SKU sampling occurred.
- Follow-up SKU qualification at approximately 09:14 UTC used a bounded direct ARM
  `Microsoft.Compute/skus` GET, API 2021-07-01, server-side West Europe location
  filter and 30-second HTTP timeout. It succeeded in 5.480 seconds with no next page:
  exact Standard_D4s_v5, West Europe, zones 1/2/3, restrictions empty, 4 vCPUs and
  16 GB memory. This supersedes the unknown SKU restriction status above and establishes
  advertised eligibility, not guaranteed physical allocation. A preceding unresponsive
  CLI request was interrupted; no source/configuration or cloud mutation occurred.
- The EUR120 monthly cap at 40 running hours includes 21% tax. Refreshed public
  baseline meters with existing quantities/reserves total EUR97.93911386 net /
  EUR118.50632777 gross, leaving EUR1.49367223 gross headroom. The stopped scenario,
  conservatively retaining the same variable/audit allowances, is EUR81.74711386 net /
  EUR98.91400777 gross. This is a usage estimate, not a hard billing cap; actual
  retained inventory, variable operations and deployment runtime must remain bounded.
- Public Azure MCP retail checks confirmed EUR Consumption prices for D4s_v5
  compute (0.2024/hour), P6 disk (9.8796/month plus 0.5377 mount), E4 disk
  (2.1119/month plus 0.2974 mount), IPv4 (0.0044/hour), ACR Basic (0.1466/day),
  first-tier DNS zone (0.44) and audit ingestion (2.6311/GB). Follow-up public queries
  resolved Standard global load-balancer included rules (0.022/hour), LB data
  (0.0044/GB), Blob Hot LRS first-tier storage (0.0172/GB/month) and Key Vault
  Standard operations (0.0264/10K). Existing usage/verification allowance EUR16 and
  audit processing/query allowance EUR0.50 are retained. Source retail lookup behavior
  remains separately unqualified; no missing-meter fix was made to the tooling.
  Individual variable-operation tariffs were not all refreshed; the EUR16 reserve
  remains an assumption requiring actual transaction/egress/runtime checks.
- Ubuntu native verification is already declared in CI. No run was performed here;
  prior local native failures remain unresolved, and the approved VM restart was
  never executed. No more local runtime sampling occurred.
- Terraform roots, source gates, runtime overlays, secret provisioning, Argo install,
  readiness and operational helpers are reusable, subject to their recorded review
  scope. No current live Azure result is claimed.

### Concrete source dependencies

1. `azure-terraform.mjs` deliberately rejects guard qualification and environment
   planning through unfinished `requireGuardAuthorityContract()`.
2. Foundation now emits `workload_delegation`; the strict JavaScript output/cache
   schema migration is incomplete. Resolve producer/consumer agreement first.
3. Complete current authority/G3 validation and actual qualification before replacing
   that barrier; never remove it merely to enable deployment.
4. Connect ordinary application activation/pointer publication to the real
   creation → qualification → reviewed grant → bootstrap → readiness sequence.
5. Separate optional recovery configuration/challenge failure from ordinary bootstrap
   readiness, preserving recovery grants and qualification gates.
6. Supply actual verified component release artifacts for the first deployment;
   the required Azure release directory is currently absent.

### Independent specialist verdicts

Architect: read-only assessment; the dependency path above is source-blocked and
requires integrated producer/cache/authority/activation work. Minimum initial image
publication must precede M2. No source or cloud mutation was performed.

Security reviewer verdict (verbatim):

> Verdict: needs_information for milestone sequencing; M1 is viable in stages,
> while M2 remains source-blocked at `b2b0064`. No new vulnerability finding or
> risk acceptance.

Read-only permission follow-up verdict (verbatim):

> Permission prerequisites: read-only evidence supports bootstrap authority;
> execution remains unqualified.

Feasibility specialist follow-up verdict (verbatim):

> M0 remains no-go before M1: West Europe DSv5 family quota is zero.

Vault qualification protects application-secret use as well as recovery. Audit
resources may be staged before qualification, but dependent sensitive use requires
actual transformation/privacy/access/gap evidence. Existing source/design closures
do not establish live gate closure.

Documentary delta review after this record and discovery/status links were written
(reviewers' verdicts verbatim; no implementation or live acceptance):

> Security: pass — documentary delta only. Milestones, discovery links and checkpoint
> metadata preserve security gates, historical evidence, exhausted 9/9 and 18/18
> budgets, and explicit owner stops. M1 audit staging remains conditional; M2 guard
> qualification remains blocking. No M0 feasibility acceptance or subsequent
> execution authorization is implied.

> Architecture: Scoped consistency verdict: pass for milestone documentation and
> metadata only.

Author checks: changed Markdown links/anchors, JSON syntax, consistency/readability
and `git diff --check` passed. No application build or provider tests were run for
this documentary change.

### Next decision

The owner authorized the two 12-vCPU quota requests on 2026-10-28. Initial quota
reads returned `MissingRegistrationForResourceProvider`; `Microsoft.Compute` was
already registered. The necessary `Microsoft.Quota` registration was requested and
reached Registered; reads succeeded after propagation. Azure MCP quota tools expose
reads only, so the requests used Azure CLI `az rest` and the documented Quota API
2025-09-01. Exact JSON bodies specified only the resource name and LimitValue 12.
Temporary non-secret request files were removed after each submission.

Both West Europe PUT requests succeeded and returned requested limit 12 with
`provisioningState=InProgress`: `cores` (previously 10) and `standardDSv5Family`
(previously 0). A subsequent successful `az vm list-usage` reported effective
regional limit **12**, used 0; Dsv5-family limit **0**, used 0. Regional increase is
effective; the family request is submitted but not yet established as approved.
Follow-up quota API status reads were unavailable at that point; no rejection or
approval was inferred from that. At 2026-10-28 09:11 UTC, the first check in the
owner-requested ten-minute monitoring window succeeded: Compute usage reported
**Dsv5-family limit 12, used 0**, and **regional limit 24, used 0**. The requested
family increase is effective and the quota blocker is cleared. Monitoring stopped
immediately as requested. We submitted limit 12 for each; the later regional value
24 is Azure's observed effective limit, not an additional request by the agent.
This authorization covers quota administration only, not M1/resource provisioning.

Complete remaining SKU/configuration/source feasibility checks and obtain M0
sign-off. No further quota increase or alternative configuration is authorized. Eight
family cores are the initial steady-state minimum; the existing environment sets
`max_surge = "1"`, so a third four-core node requires 12 during upgrades. The
regional limit was 10 and is now 24. Quota is capacity
permission, not permission to create a permanent third node; surge runtime remains
part of the cost allowance. The submitted quota path preserves the
approved design and does not authorize provisioning. Do not start M1 or resume
guard repairs at this checkpoint. Positive quota/capacity and a complete passing
cost check remain required before paid workload deployment. At M0 sign-off, agree
the next integration batch and repair-budget extension: align the
`workload_delegation` producer/cache/consumer schemas and shared fixtures, run focused
contracts and obtain targeted independent reviews. Keep the unconditional authority
barrier until real current-authority/G3 validation and qualification are integrated.
Initial image-publication sequencing and deployment configuration also need agreement
before dependent implementation. No security waiver is proposed.

## M0 closeout proposal

The architecture follow-up recommends **conditional GO for bounded M1 source
preparation**, not apply. Missing private operator group/CIDRs/backend names block
configuration qualification and apply, not this source integration. A narrow Graph
query for group names starting with equipment/codingfunlab returned zero candidates;
it neither proves that no suitable group exists nor selects/creates a group.

Proposed first batch: coordinate the already-reviewed Terraform
`workload_delegation` output with the strict consumer/cache schema and shared fixtures.
Keep existing grants, conditions and the unfinished-authority barrier unchanged.
Deliverable: matching producer/consumer contracts, focused passing checks, and
independent quality/security delta reviews. Do not expand into full G3, activation,
recovery or local Podman diagnosis in this batch.

Owner accepted M0 and authorized M1 on 2026-10-28, including this proposed first
source batch with up to three implementation repair rounds (historical limit
18 → 21), maximum 60 active minutes before reporting progress or intervention.
Preparation remains
9/9; no counter resets. The shared milestone stop remains in force: do not proceed
to M2 without explicit approval. This bounded source batch alone does not complete
M1; actual foundation qualification remains its milestone acceptance requirement.
Any separate paid apply still needs a concrete reviewed plan, private configuration
and all applicable safety/cost gates. No additional cloud mutation, publication or
security exception follows from the proposal.

Architecture follow-up verdict (verbatim):

> Yes: conditional GO for bounded M1 source preparation, with live deployment
> feasibility still conditional on the exact SKU check and confirmed private inputs.

The exact SKU check subsequently passed as recorded above. Private configuration,
actual provider qualification and source gate completion remain mandatory before use.

## M1 execution ledger

Started 2026-10-28 09:16 UTC, source baseline `b2b0064` plus the existing M0
documentation changes. Scope: T089 producer/cache/consumer schema integration only.
One coder owns affected JavaScript implementation/shared-fixture/tests; coordinator
owns documentation/status. Independent quality and security reviewers assess the
frozen batch. No Terraform declaration, grant, barrier or cloud mutation is planned.

Standards: custom authority-validation behavior retains test-first; preserve strict
schemas and actual trusted-expectation boundaries. Use focused regressions, affected
contracts and scoped format/ESLint. Reuse unchanged Terraform producer reviews and
native evidence. Native Linux/provider and actual Azure gates remain pending; no
new local Podman investigation. Do not mark T089 or M1 complete from a passing subset.

Pre-execution: no extension hooks configured; Spec Kit prerequisites resolve feature
014 and its existing artifacts. Requirements checklist 16/16 and operations checklist
20/20 checked. These are requirements-quality evidence, not implementation acceptance.

Batch design decision: the cache lacks independent source facts for every role in
the delegation descriptor. Do not construct a trusted expected descriptor from the
received descriptor. Reuse the existing parser through a small production transport
validation API (exact nested fields, grammar and hashes) and cross-bind only the
independently available workload scope/apply/destroy identities. The authority API
continues requiring an independent expectedDescriptor, and the unconditional G3
barrier remains. Security scope guidance (verbatim):

> Option A is acceptable for transport validation only: exact schema, supported
> grammar, canonical hashes and independently available scope/principal crossbindings.
>
> Keep authority validation unchanged: mandatory independent expectedDescriptor,
> no self-derived expectations, and the unconditional authority barrier. Missing
> source facts still block semantic publisher/current-authority qualification.

This expands the coder's owned files to the existing guard helper and its focused
tests, solely for parser reuse. Tests cover valid producer-shaped projection and
malformed/hash/grammar/crossbinding rejection plus preserved authority rejection;
real parser/fixture/cache stay in the boundary. No provider fixture is necessary
for transport parsing, and no test result establishes actual Azure authority.

Implementation round 19, first batch frozen for review (six JavaScript files):
`azure-infrastructure.mjs`/test, `azure-vault-guard.mjs`/test,
`azure-guard-test-fixture.mjs`, `azure-handoff.test.mjs`. The reviewed producer-shaped
delegation fixture is reused; Terraform, grants, conditions and authority barrier
are unchanged. No whole task checkbox is completed.

Author evidence on the frozen source:

- RED: `node --test --test-name-pattern 'workload delegation transport|guard output schema' scripts/azure-vault-guard.test.mjs scripts/azure-infrastructure.test.mjs`:
  exit 1, two intended failures (missing API and rejected nested field), 194 ms.
- GREEN: same focused command, two passed, zero failed/skipped, 211.5 ms.
- `node --test scripts/azure-vault-guard.test.mjs scripts/azure-infrastructure.test.mjs scripts/azure-handoff.test.mjs scripts/azure-guard-activation.test.mjs`:
  84 passed, zero failed/skipped, 22.194 seconds. After explicit cache-negative
  assertions were added, the handoff file passed 2/2 again in 395.97 ms.
- Scoped format-check, ESLint for the six files and whitespace checks passed.

Independent security verdict (verbatim):

> pass — bounded first-M1 transport/cache batch. No new findings.

Security independently ran focused parser/transport/schema/cache tests: 11 passed,
zero failed/skipped, exit 0, 438 ms. Mandatory independent expectation, lack of any
source-authority claim and unchanged barrier were inspected. This is not deployment
approval.

Independent quality verdict (verbatim):

> pass for the frozen six-file T089 transport integration at b2b0064 plus reviewed
> working diff. No findings.

Quality independently ran three affected suites: 82 passed, zero failed/skipped;
the focused unfinished-G3 regression passed 1/1. Six-file format check, scoped ESLint
and whitespace check passed. Reviewer made no edits. Both verdicts cover this
source subset only; actual source authority/provider qualification and M1 acceptance
remain pending.

Owner separately requested a dedicated Entra security group containing only the
current signed-in user. Created `equipment-azure-operators` after exact-name collision
check; security-enabled, mail-disabled. Actual membership GET verified exactly one
member, the current user. Identifier is stored only in existing ignored private
owner inputs. No role assignment or other group membership was changed. This is the
only cloud setup mutation in this batch; it was explicitly authorized separately
from the source-only implementation scope.

Owner also selected this machine's current public IPv4 /32. The detected value is
stored only in ignored private owner inputs. No firewall was changed. Dynamic IP
changes require a future explicit configuration update; no broader fallback range.

## Proposed M1 initial foundation preview refinement

**Owner approved on 2026-10-28; implementation pending.** Source reviews passed the first batch,
but the next initial foundation plan currently requires clean deployment code at the
exact GitHub main SHA. The working feature is not on main; a local commit alone
does not meet that contract. Publishing unfinished feature implementation merely
to inspect its first foundation plan is not proposed.

Proposed limited change: allow a local-human initial foundation preview at an exact
independently reviewed, clean feature commit. All of these conditions must hold:

- Operation is plan, stage foundation-bootstrap, audit stage create, network gate
  false, backend authority verified local/uncreated. No remote foundation maintenance,
  audit bind/enable, family proof, environment plan or hosted execution qualifies.
- Preserve exact clean HEAD verification at entry and subsequent revision assertions;
  approval names a specific SHA, never an arbitrary branch. A commit is still required.
- Retain private local plan/review files, pinned tools/providers, provider registration
  disabled, state/input binding and resolved-plan security scan.
- Keep remote-main enforcement on apply and every existing mutation/hosted path.
  Preview output is not apply approval and cannot be promoted directly to apply;
  a fresh qualifying plan/review is required under the existing apply contract.
- Preserve the unfinished G3 barrier and pending native/provider/security gates.

This preview contacts Azure/providers and writes sensitive local files. It performs
no cloud-resource mutation; it is not side-effect-free. The existing initial path
has no remote plan publication or operation admission, whereas remote foundation
maintenance may take leases/locks and is excluded. Meaningful tests must demonstrate
the narrow allowed case and rejection of every excluded path, including apply reuse.
Use existing revision/backend validation; do not add a new trust framework.

Security scope assessment (verbatim):

> Supported minimal option: a separately approved local-human initial foundation
> preview from an exact independently reviewed, clean feature commit. Keep remote-main
> enforcement for apply, hosted execution and every other mutation path.

Owner approved this exact source-policy refinement and local checkpoint commits
(no push/merge). This is not permission to
provision or treat preview evidence as deployment acceptance. A later reviewed-source
publication/apply decision remains separate. Existing M1 authorization does not waive
the current main-only contract. No preparation budget has been reset or extended.

Approved refinement execution: prior independently reviewed transport batch and M0/M1
records committed locally as `5f684cf`; nothing pushed or merged. Round 20 starts
with focused revision/backend-preview regressions before implementation. Private
draft configuration now binds verified account/tenant/operator group/current IPv4,
AKS 1.35.8, supplied tax and initial null recovery-key version. Naming is deterministic
and generation is 20261028a. Proposed key expiry is 2027-10-28T00:00:00Z for preview
review only; no key is created. A repository ACL check initially failed; the two
private input files were restricted to the current owner, preserving values, and
both checks now pass. Neither private contents nor identifiers are committed.

Read-only initial naming checks: proposed foundation resource group does not exist;
the proposed deterministic state-storage name is available. No existing resource is
adopted or created. Availability may change before any later apply.

Round 20 implemented and frozen against `5f684cf`: four files,
`azure-terraform.mjs`/test and `azure-infrastructure.mjs`/test. Explicit preview flag,
local human/account verification, narrow eligibility, entry/context revision and
backend rechecks, preview artifact marker/input association and apply rejection.
No hosted/main apply or G3 barrier relaxation.

Author evidence: intended RED (missing revision API and existing-state rejection),
two failures, 596.7 ms. Affected two suites passed 31/31, zero skipped, 12.645 s;
final focused preview/revision/CLI cases passed 3/3, zero skipped, 5.706 s. Scoped
four-file format-check, ESLint and whitespace checks passed. Existing local Terraform
source-staging test ran; this is not Azure provider/native cluster qualification.

Security verdict (verbatim):

> pass — scoped round-20 initial foundation preview. No new findings.

Independent focused revision/preview tests passed 3/3, zero failed/skipped, 5.989 s.
Reviewer confirmed excluded mutation paths, provider registration disabled,
non-promotable preview and unchanged ordinary/main/apply/G3 constraints. Source
approval does not establish actual preview success or provisioning permission.

Quality verdict (verbatim):

> pass for round 20’s frozen four-file diff on 5f684cf. No findings.

Independent focused preview/revision/G3 tests passed 4/4, zero failed/skipped;
four-file format-check, scoped ESLint and whitespace checks passed. No reviewer edits.
Both source verdicts cover the exact reviewed delta; native/live M1 gates remain open.

Round 20 committed locally as `ff87a21`. Private configuration pinned to that exact
clean source; validation and both private-file ACL checks passed. Actual approved
`executeInfrastructure('plan', ...)` preview stopped at the first Azure account read:
exit 2, 680 ms, total 1.883 s. No Terraform plan, operation lease, remote publication
or resource mutation occurred. Direct Azure CLI reads previously succeeded, so the
remaining round 21 is scoped to the exact Windows CLI-wrapper invocation. No retry
with weaker identity checks or alternate credentials is authorized.

Round 21 causal wrapper repair frozen against `ff87a21` (infrastructure module and
its test only). Real Windows cmd → controlled az.cmd fixture reproduced literal
quotes in the account/show argv (RED 1 failed, zero skipped, 313.5 ms), without
authentication/network. This excludes account configuration or PATH selection as
the cause of that corruption. One Windows verbatim-argument option fixes the quoting;
Windows percent expansion is rejected rather than silently interpreted. Quoted
spaces/URL ampersands and Unix behavior are retained.

The same regression passed 1/1, zero skipped, 548 ms. Actual original authenticated
`runAzure(['account','show'])` then passed outside the sandbox in 1.278 s; only safe
enabled/user status was exposed. Scoped formatting/ESLint/whitespace checks passed.
No Terraform, preview identity policy, authority barrier or cloud resource changed.
Independent delta reviews are pending before the preview retry.

Round 21 independent verdicts (verbatim):

> Quality: pass for the frozen two-file round-21 delta against ff87a21. No findings.

> Security: pass — scoped round-21 Windows argv repair. No new findings.

Quality independently passed the real Windows argv regression 1/1, zero skipped,
521 ms; security passed it 1/1, zero skipped, 560 ms. Reviewers inspected current
production callers (none needs percent-encoded arguments), unchanged Unix/private
capture and retained argument allowlist. No reviewer edits. Source repair is accepted
within scope; actual preview remains to be retried. Implementation limit 21/21 is
now exhausted; another source repair requires a changed-strategy budget decision.

Round 21 committed locally as `b77ed18`. Actual preview from that clean reviewed
source passed the repaired account read, then failed on an Azure read timeout
(30.029 s; total 36.105 s), before Terraform planning. A single diagnostic rerun
through existing `preflight` run injection exposed fixed safe labels only: account,
AKS versions, VM SKU enumeration. The last phase timed out at 30.010 s (total
32.865 s). This identifies the broad `az vm list-skus --location ... --all`
preflight call as the blocker. No timeout increase, unchecked SKU substitution,
provider mutation or source diagnostic instrumentation was made.

**Checkpoint: needs_intervention; M1 incomplete.** No saved foundation plan exists.
Three authorized repair rounds (19–21) are used. Source fixes passed their reviews;
the actual source-to-private-plan path remains blocked by SKU discovery. Native
Linux, actual foundation/audit and later milestones are still pending.

Proposed changed strategy, not implemented: replace broad CLI SKU enumeration in
T007's preflight with a bounded regional ARM resourceSkus read using the existing
private token/request boundary. The same regional query succeeded during M0 in
5.480 s. Select exact D4s_v5, validate scope/region/schema and complete pagination,
and continue rejecting missing/restricted/ambiguous/incomplete results. Preserve
current time budgets, subscription binding, private output, quota/cost/permission
checks and all preview/apply gates. No fallback to the earlier observation as a
caller-supplied ready flag. Reuse existing provider-contract tests; add focused
faithful response/pagination negatives only for changed owned behavior.

Request one additional implementation repair round (21 → 22), maximum 20 active
minutes before reporting a result/intervention, with independent delta reviews and
one unchanged real-preview retry after a local checkpoint commit. This is a concrete
API strategy change, not more samples of the stalled CLI call. No provisioning,
push/merge, permission expansion or timeout inflation is requested. Owner approval
is required by the existing bounded-execution protocol before dependent repair.

Owner approved this exact round-22 strategy on 2026-10-28. Started 09:51 UTC;
20-active-minute checkpoint, one actual-preview retry after independent review and
local commit. Existing guides/reviews are reused; one coder owns the SKU read and
focused contracts, two reviewers assess the frozen delta. No new cloud mutation,
permission or timeout change is approved.

Round 22 frozen: infrastructure module and focused tests only. New regional ARM
discovery uses existing private CLI token acquisition and standard fetch, exact
subscription/resourceSkus/API/filter pagination, complete response checks and exact
single configured SKU selection. Existing total 120 s/per-request maximum 30 s
budgets and quota/price/permission/preview/apply gates remain unchanged.

Verification choice under current guides: targeted regression for the changed
provider boundary, not a universal test-first requirement. Real preflight,
configuration/capability/cost logic remain in the test; CLI and ARM are narrow external
boundaries with faithful two-page response and failure fixtures. RED caught the old
broad CLI call (one failure, zero skipped, 172.8 ms); four focused tests then passed,
zero skipped, 170.4 ms. Scoped two-file format-check, ESLint and whitespace checks
passed. No provider/native runs by coder. Independent delta reviews pending.

Round 22 independent verdicts (verbatim):

> Quality: pass for round 22’s frozen two-file delta on e933f80. No findings.

> Security: pass — scoped round-22 regional SKU discovery delta. No new findings.

Quality passed four focused tests, zero failed/skipped, 190 ms, plus scoped
formatting/ESLint/whitespace checks. Security passed the focused complete/paginated
SKU regression 1/1, zero skipped, 165 ms, inspecting token/header privacy, forbidden
redirects and same-origin/subscription/path/API/filter checks before every request.
No reviewer edits. Actual provider/preview qualification remains pending.

Round 22 committed locally as `7796bb8`. The single authorized actual preview
retry progressed past regional SKU discovery, then failed quota validation in
16.827 s, before Terraform planning. Read-only inspection of the two relevant CLI
quota rows confirmed regional limit/currentValue `"24"`/`"0"` and Dsv5-family
`"12"`/`"0"`: all four values are strings. The numeric-only evaluator rejects the
provider boundary shape despite sufficient actual quota. No validation was bypassed,
plan generated, timeout changed or resource created. Unchanged retail BOM read also
passed independently (13 entries, 723 ms).

**Checkpoint: needs_intervention; limit 22/22 exhausted, M1 incomplete.** Concrete
next proposal: normalize only canonical nonnegative safe-integer decimal strings
for CLI quota limit/currentValue at the response boundary, retaining the evaluator's
numeric contract and all existing quota thresholds/denials. Reject missing, negative,
fractional, whitespace/noncanonical, overflow or unrelated coercible input. Preserve
existing numeric responses. Focused faithful CLI-shape and invalid-value tests plus
independent delta review are sufficient; no new fixture framework or provider-loop
investigation is proposed. Request one additional repair round (22 → 23), maximum
15 active minutes, and one post-review/local-commit preview retry. No source work
on that proposal occurs before owner approval; no broader authority or provisioning
is requested.

Owner approved round 23 on 2026-10-28: strict CLI quota normalization only,
15-active-minute checkpoint, independent delta review and one actual preview retry
after a local commit. No threshold, permission, timeout or other gate change.

Round 23 frozen against `64b5183`: infrastructure module/test only, 17 production
lines. CLI quota rows are copied and limit/currentValue normalized only from canonical
nonnegative safe-integer strings; valid numeric counts retained. Pure evaluator and
eight-core threshold unchanged. Public preflight tests retain actual evaluator/cost
logic and reuse faithful CLI/HTTP boundaries. RED reproduced the observed string
counts being rejected (one failure, zero skipped, 172.98 ms). Four focused tests
passed, zero failed/skipped, 192.24 ms; scoped formatting/ESLint/whitespace checks
passed. No provider/native calls by coder. Independent delta review pending.

Round 23 independent verdicts (verbatim):

> Quality: pass for round 23’s frozen two-file delta on 64b5183. No findings.

> Security: pass — scoped round-23 quota normalization. No new findings.

Quality passed four focused tests, zero failed/skipped, 159 ms, and scoped
formatting/ESLint/whitespace checks. Security passed the focused boundary regression
1/1, zero skipped, 161 ms. Both inspected strict syntax/range handling, unchanged
numeric evaluator/thresholds and copied response rows. No reviewer edits. Actual
preview remains pending.

Round 23 committed locally as `e1a54a9`. The single actual preview retry passed
quota validation and progressed into private workspace setup, then failed Windows
ACL preparation (exit 1, 736 ms; total 36.653 s). No saved plan or resource creation.
Read-only checks confirmed the existing workspace directories are regular,
current-user-owned and pass the repository's 0700-equivalent ACL checker; no state
or remote-authority marker was present.

A disposable empty-directory reproducer isolated the actual helper defect: first
`createPrivateDirectory(parent)` succeeds, second call fails ACL rewriting (558 ms).
The same privacy assertion succeeds on already-prepared real directories. The
probe touched no real state/configuration and its empty directories were removed.
This is a repeat-setup defect in the shared Windows helper, not insufficient Azure
quota or permission, and not evidence that broader file access is acceptable.

**Checkpoint: needs_intervention; implementation 23/23 exhausted, M1 incomplete.**
Proposed round 24 (maximum 15 active minutes): make private-directory setup idempotent
by verifying and reusing an already-valid private directory before attempting an ACL
rewrite. Preserve regular-directory/symlink, owner and access checks, and verified
preparation/failure for invalid permissions. Extend existing helper tests with a
real Windows repeat-setup regression and affected privacy cases; obtain independent
delta reviews. Then local checkpoint and one actual preview retry. No Terraform
policy, ACL broadening, timeout change, cloud mutation, push or merge is proposed.
Owner approval is required before this additional repair; no implementation yet.

Owner authorized the final bounded Windows attempt on 2026-10-28 after clarifying
verification profiles and stopping criteria. Round 24 implements only the proven
private-directory repeat defect, then one preview retry; no automatic round 25.
Overall closure checkpoint: 45 active minutes from 10:40 UTC, with a different
Linux execution proposal if Windows remains blocked. M1 is not complete merely
because source repairs or a preview pass. No apply, publication or security waiver.

Verification profile: this helper enforces file access controls, so its focused
real-Windows regression begins failing before the fix. No universal test-first rule
is applied to unrelated wrappers/output/declarations. Existing owner/allowlist/link
tests are reused; only helper/module test files are owned by the coder.

Round 24 frozen against `a937780`: `local-platform.mjs` and its existing test file,
six production lines. Existing regular/non-symlink, owner and full-control/allowlist
checks must pass before reusing the directory; otherwise existing preparation and
final verification remain. Unix behavior and Windows ACL policy are unchanged.
RED reproduced second-call failure (one failed, zero skipped, 1.783 s). All five
helper tests then passed, zero failed/skipped, 6.037 s, including real Windows
repeat/broad-grant/inherited/link coverage. Scoped formatting/ESLint/whitespace
checks passed. No coder cloud/provider calls; independent review pending.

Round 24 independent verdicts (verbatim):

> Quality: pass for round 24’s frozen two-file delta on a937780. No findings.

> Security: pass — scoped round-24 Windows private-directory reuse. No new findings.

Quality passed two targeted tests, zero failed/skipped, 6.465 s, plus scoped
formatting/ESLint/whitespace checks. Security passed all five helper tests, zero
failed/skipped, 6.380 s. Both confirmed unchanged privacy validation and Unix
behavior, with no new TOCTOU guarantee claimed. No reviewer edits. One final actual
Windows preview retry follows a local commit; no automatic further repair.

## Actual foundation preview checkpoint

Round 24 committed locally as `023588d`. The final Windows preview succeeded in
49.010 s with phase `foundation-preview-not-for-apply`. Private inputs/plan/review
retain owner-only access. Pinned Terraform inspection confirmed source revision,
binary plan hash, input hash, preview marker and uncreated state. No raw plan JSON
was emitted or retained as a new report.

Actual actions: **270 creates, 10 data reads, zero updates/deletes**. Managed scope:
203 role assignments, 17 custom roles, nine workload identities/federated credentials,
two storage accounts/11 containers, two RGs (including workload shell), DNS zone,
retained recovery vault/RSA3072 key, audit workspace/table/DCR, guard policies and
two operator app registrations/service principals/app-role assignments. No AKS,
nodes, load balancer or application-secret resources. Counts are Azure objects,
not a claim of 270 billable services.

Storage plan: HTTPS/TLS1.2, shared keys/public nested access disabled, private
containers, deny-default/no-bypass networking and versioning. Recovery vault: RBAC,
purge protection and 90-day soft deletion with deny-default/no-bypass networking.
Audit remains create-stage only, with readiness/diagnostics/network gate disabled
and family qualification null. Sensitive use remains gated. Role scopes/conditions
that depend on new resources still require actual enforcement qualification.

Actual-preview verdicts (verbatim):

> Quality: pass for the actual foundation preview only at 023588d. No quality findings.

> Security: pass — bounded security assessment of the initial foundation preview at
> 023588d; not apply approval. No new confirmed vulnerability.

Reviewers inspected the private resolved plan in memory using pinned Terraform,
confirmed plan/input/review association, scope and staging, and changed no files,
ACLs or cloud resources. This is not M1 acceptance or permission to apply.

### Pre-apply decisions and remaining work

- Both operator app-role assignments resolve to the configured operator group.
  [Microsoft requires Entra P1/P2 for group-based enterprise-app assignments](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/assign-user-or-group-access-portal).
  Read-only Graph subscribedSkus returned zero entries with no next page; no premium
  plan was found for the current user. The EUR118.51 estimate does not include a new
  Entra license. No license was purchased or assignment changed. Recommend direct
  app-role assignments to the one approved user while retaining the group for
  Azure/Kubernetes access; owner design approval and scoped IAM review are required.
- Proposed recovery-key expiry in the actual preview is 2027-10-28T00:00:00Z.
  Confirm that date and an owner renewal/rotation responsibility before a real apply.
- Reviewed deployment source must reach GitHub main for the unchanged apply contract.
  Publication is not authorized yet. Prefer publishing the feature branch and
  obtaining required Linux validation before any merge/apply decision. Main release
  workflow can publish components, so do not dispatch it as if it were a read-only
  check; choose a source-only validation path with explicit owner authorization.
- Generate a new qualifying plan/review after source publication; this preview is
  explicitly non-promotable. Apply only reviewed exact bytes after authorization.
  Then complete remote-state authority and audit create → bind → enable/privacy/
  authorized/denied access/gap qualification. M1 acceptance waits for those outcomes.

The final Windows attempt succeeded; no Linux fallback for preview execution is
needed. Linux acceptance checks remain pending independently. No new round 25,
security exception, push/merge or paid provisioning has been inferred.

Concrete licensing refinement proposed for owner decision: in
`foundation/operators.tf`, change only the two operator app-role principals from
`config.operatorGroupObjectId` to the existing reviewed
`bootstrap_operator_object_id`. Keep assignment-required, tenant-only apps,
`Equipment.Operator` role, operator IP controls and the group used for Azure/AKS
unchanged. No automatic runtime fallback or purchase. Update operator enrollment/
removal documentation: removing a group member alone will not revoke an individual's
app assignment; direct assignment removal is required. Any additional operator needs
explicit enrollment. Apply declaration verification profile (implement then pinned
native checks/appropriate IAM delta review), not universal test-first. Actual app
login and denial verification stays in M2. Do not implement before owner approval.

Owner approved this exact direct-assignment refinement on 2026-10-28. Implement-first
declarative change now frozen: operator app principal expression and existing native
assertion only. Existing tenant/role/assignment-required/IP and Azure/AKS group are
retained. Runbook/plan/model/task links now distinguish direct app enrollment/removal
from group membership. No premium purchase, publication or apply is authorized.

Pinned foundation format, check (fmt/backend-free init/validate/TFLint/Trivy) and test
passed; 33 mocked native contracts, zero skipped. Initial sandbox registry access
failed; outside-sandbox run passed with no provider/lockfile change. This follows
the declaration verification profile, with no test-first requirement or invented
RED. Actual browser access/denials remain M2. Independent delta review pending.

Direct-assignment independent verdicts (verbatim):

> Quality: pass for the operator-assignment delta on 2613159 and the reviewed
> documentation changes. No findings.

> Security: pass — scoped direct operator-assignment source and documentation
> delta. No new findings.

Reviewers inspected exact two-principal change, unchanged tenant/role/assignment/
group boundaries and enrollment/removal guidance; reused the passing 33 native
contracts and pinned gates. No redundant tests or live calls. Fresh private-plan
principal confirmation remains before the next owner checkpoint.

Direct-assignment change committed locally as `048c6e9`. Fresh private preview
succeeded in 43.550 s: still 270 creates, 10 data reads, zero updates/deletes.
Pinned private plan inspection confirmed exactly two app-role assignments, both to
the reviewed bootstrap user, neither to the operator group. Security independently
confirmed plan/review revision/hash binding and those exact principals; unchanged
earlier plan assessment remains applicable. Security verdict (verbatim):

> pass — resolved operator-assignment delta only.

No license, live app assignment, firewall or cloud resource was changed. The approved
licensing prerequisite is resolved in source/planned configuration; actual M2 login
and removal evidence remain pending. This is not M1 acceptance or apply permission.

Next publication proposal: push only branch `014-azure-aks-gitops` and open a draft
PR against main so existing read-only PR/source Linux checks can run. The PR remains
explicitly work in progress; no merge or apply. Do not dispatch the main release
workflow for this purpose. Before publishing, confirm private input/plan/state paths
remain ignored/untracked. Publication and external PR creation require explicit
owner authorization; neither has occurred. Source must later qualify on main and
receive a fresh exact plan/review before any apply decision.
