# Local Kubernetes operational quickstart

Run commands from the repository root on the existing macOS Podman machine, or use
the Windows qualification steps below. This is
one demo environment, `equipment-local`, with context `kind-equipment-local` and
application namespace `equipment`. Aspire remains the workflow for unpushed development.

Genuine component images have now been published and promoted to main. Integrated
Windows qualification is in progress; macOS integrated acceptance remains pending.
Generated files, focused tests and standalone probes do not establish a working
complete deployment. See the evidence status at the end and the current
[Windows qualification record](team/windows-local-setup.md).

## Windows qualification

Install the pinned kind 0.33.0, kubectl 1.35.8 and mkcert 1.4.4 Windows binaries.
OpenSSL is also required (for example Git for Windows' `usr/bin/openssl.exe`).
Use a new PowerShell terminal so installed tools are visible in PATH. Existing
macOS commands and exact Unix private-file modes remain supported. Windows uses
owner-restricted NTFS ACLs, accepts SYSTEM/Administrators access, and checks the
exact local CA against the Windows system trust store without installing trust.

The owner explicitly runs `mkcert -install`, approves its trust prompt, adds the
two loopback DNS entries to the Windows hosts file, and generates the same TLS
filenames/SANs documented below. Setup never performs those host changes. On a
fresh Windows state directory, before generating private credentials:

```powershell
node --input-type=module -e "import {createPrivateDirectory} from './scripts/local-platform.mjs'; createPrivateDirectory('.local/kubernetes');"
```

This protects only that project-local directory; it does not change host trust.
Retain existing credentials and keys. Files must inherit that restricted ACL and
have no explicit grants to other users; setup refuses unsafe existing files.

The normal memory minimum remains 11000 MiB. For the owner-approved experimental
Windows 8 GiB trial only:

```powershell
$env:EQUIPMENT_EXPERIMENTAL_8G = '1'
node scripts/local-kubernetes.mjs prerequisites
node scripts/local-kubernetes.mjs setup
node scripts/local-kubernetes.mjs status
node scripts/local-kubernetes.mjs smoke
Remove-Item Env:EQUIPMENT_EXPERIMENTAL_8G
```

This requires at least 7680 MiB as measured inside the running WSL guest, allowing
for kernel overhead. Podman's Windows machine-memory metadata is not authoritative.
The opt-in is rejected on macOS. It does not lower workload resource limits or
establish measured capacity acceptance. Private state is local-only; copy selected
credentials privately with PowerShell `Set-Clipboard`, never into logs or chat.

The retained broker volume uses UID/GID 999 and a setgid 2770 root with no access
for other users. OnRootMismatch avoids recursively widening private file modes
when a pod is replaced. If an earlier deployment already changed `.erlang.cookie`
to 0660, inspect only its mode/ownership privately and restore that exact retained
file to 0600 before retrying. Never print, delete or regenerate the cookie or reset
the volume to recover. See the actual recovery in the qualification record.

## Prerequisites and compatible tools

Use Node 24.15.0, the pinned .NET SDK 10.0.301, Podman 6.0.2, kind 0.33.0,
kubectl 1.35.8 and mkcert 1.4.4. The existing running Podman connection must be rootful,
with at least 6 CPU, 11000 MiB allocated memory and 20 GiB free VM disk. Initial setup
needs loopback ports 80/443; smoke additionally needs 18888/18890 free. The tool checks
these prerequisites and never reconfigures the VM, installs host trust or edits DNS.

The owner installed kind/mkcert/kubectl under `/opt/homebrew/bin`. Installed kubectl
1.37.1 is incompatible with the selected 1.35.8 server's supported one-minor skew;
the CLI requires exactly 1.35.8. The checksum-verified temporary copy is available at
`/private/tmp/equipment-k8s-tools/kubectl` while that directory survives:

```sh
export PATH="/private/tmp/equipment-k8s-tools:/opt/homebrew/bin:$PATH"
kind version
kubectl version --client
mkcert -version
```

If the temporary tools were removed, download the compatible client into ignored local
storage, verify it, then put that directory first in PATH. This does not install globally:

```sh
equipment_tools="$PWD/.local/tools"
mkdir -p "$equipment_tools"
curl --fail --location --max-time 120 \
  https://dl.k8s.io/release/v1.35.8/bin/darwin/arm64/kubectl \
  --output "$equipment_tools/kubectl"
curl --fail --location --max-time 60 \
  https://dl.k8s.io/release/v1.35.8/bin/darwin/arm64/kubectl.sha256 \
  --output "$equipment_tools/kubectl.sha256"
printf '%s  %s\n' "$(cat "$equipment_tools/kubectl.sha256")" "$equipment_tools/kubectl" \
  | shasum -a 256 --check
chmod 755 "$equipment_tools/kubectl"
export PATH="$equipment_tools:/opt/homebrew/bin:$PATH"
kubectl version --client
```

This download is for the inspected arm64 Mac. A different architecture requires its
matching official binary and separate host compatibility evidence. No standalone Helm
or Kustomize is required; kubectl 1.35.8 bundles Kustomize 5.7.1.

## One-time developer DNS and trust actions

These are explicit owner actions, not actions performed by setup or by this session.
Using your normal privileged editor, add this entry to `/etc/hosts` without removing
unrelated entries:

```text
127.0.0.1 app.equipment.test identity.equipment.test
```

Do not also map these hostnames to a nonloopback address or IPv6 address: prerequisites
requires every resolved address to be 127.0.0.1. Pod issuer routing is configured
separately inside the cluster; host resolution alone does not establish it.

For a fresh environment, prepare the exact private filenames below. First inspect any
existing `.local/kubernetes` state; do not overwrite its certificates, CA or credentials.
The owner explicitly runs `mkcert -install` and approves its system trust operation:

```sh
umask 077
mkdir -p .local/kubernetes
chmod 700 .local/kubernetes
mkcert -install
mkcert -cert-file .local/kubernetes/tls.crt \
  -key-file .local/kubernetes/tls.key \
  app.equipment.test identity.equipment.test 127.0.0.1
cp "$(mkcert -CAROOT)/rootCA.pem" .local/kubernetes/ca.crt
chmod 600 .local/kubernetes/tls.crt .local/kubernetes/tls.key .local/kubernetes/ca.crt
```

Keep mkcert's `rootCA-key.pem` in its private CA directory; never copy that key into
this state directory, pods, Git, diagnostics or images. Only the public CA certificate
is distributed to application clients. The IP SAN is required for loopback Argo HTTPS; trusting a certificate alone does not
fix a hostname/IP mismatch. For existing state whose leaf lacks 127.0.0.1, explicitly
renew the leaf/key through your approved owner workflow using the same retained CA
and listed SANs; preserve the credential bundle and data. Setup must reject the old
incomplete leaf rather than silently generate one. It provisions the retained leaf/key
privately to Argo's dedicated server-TLS Secret as well as application ingress.
Setup checks certificate names/IP, expiry, matching key, the current mkcert CA and
macOS trust. Do not use TLS-verification bypasses.

## First release and GitHub permissions

The component-pipeline implementation is undergoing final integration and review;
see [the design](team/component-pipelines-design.md). Quality runs once before
parallel component work. PRs build affected components for both architectures without
publication; main publishes affected components relative to their own successful main
baselines; manual repository-branch runs select all seven. Each successful component
independently validates and commits its immutable image patch and provenance directly
to main, including manual repository-branch runs. No generated promotion PR is needed.
The image patches are `deploy/environments/local/images/NAME.yaml`; root references
are stable. Only that component's record/patch and its own bootstrap Job suffix change.
The promoting job validates formatting, committed consistency and real pinned
Kustomize/static policy against the exact proposed main tree before atomic mutation.
GITHUB_TOKEN pushes do not trigger another push workflow; Argo observes main normally.
See [the current direct promotion design](team/direct-component-promotion-design.md).


Proven promotion-metadata-only PRs and main pushes use static quality instead of
application builds/tests: scoped formatting, committed component/bootstrap consistency
and actual pinned Kustomize rendering plus existing structural/security policies.
Eligibility is restricted to the local overlay, its two bootstrap wrappers and the
seven known component record and image-patch paths; other manifests and any source/script/workflow/
build-input or uncertain comparison use full quality. Main additionally requires a
trusted successful full-quality ancestor, so a later manifest merge cannot bypass an
earlier failed source check. No proof means full quality; manual runs always use full
quality. The required summary identifies the mode. Static success establishes neither
application behavior nor complete Kubernetes admission/runtime readiness. See
[the current gate design](team/manifest-quality-design.md), pending implementation/review.

The lightweight gate performs no application/image build. A manifest-only PR also
selects no downstream component builds. On main, previously full-quality-validated
but unpublished component inputs may still build/publish downstream; a manifest merge
does not erase that backlog. Source that has not passed full quality forces the full
gate first.

Records live at `deploy/environments/local/releases/NAME.json`. A first promotion may contain
only one real record: missing components remain explicitly unreleased, and setup fails
before mutation until all seven are available. Never fill gaps with invented references.
No new preproduction or compatibility gate is introduced. Live runs, commits/pushes
and full-feature human acceptance remain separately authorized.

Before setup, the repository owner separately authorizes first publication and promotion.
For a manual run, select **Component pipelines** in Actions and choose the reviewed repository
branch. Manual dispatch publishes even without application changes; tags and PR/fork
events cannot publish. Component builds run concurrently; only promotion mutations share
a queue, with `queue: max` and `cancel-in-progress: false`. Up to 100 promotions may wait;
overflow/cancellation must appear as a failed component in the required summary.
The temporary image-build diagnostic job is retired.

Publication requires job-scoped `packages:write`. Confirm repository linkage and package
visibility allow unauthenticated pulls of each public GHCR package; a new package must
not be assumed public. Build jobs have no repository write authority. Promotion uses
`contents:write` and read-only Actions evidence access. Pull-request write access
is unnecessary. Repository branch rules must permit the workflow identity to update
main; authorization rejection stops promotion. Do not bypass branch rules, change
repository policy or substitute an elevated personal token automatically.

Each direct promotion retains an auditable commit and record containing
schemaVersion=1, component, repository `{id,name}`, sourceRevision, sourceRef, runId,
runAttempt, workflow, image and digest. The workflow identity is
`.github/workflows/validate.yaml`; the image must match that repository/component.
The seven names are inventory, reservations, notifications, web, database-bootstrap,
identity-bootstrap and broker-bootstrap. Every digest identifies an OCI index for Linux
amd64 and arm64. A promotion changes only its component record/image patch and, for
database-bootstrap or identity-bootstrap, its own derived Job suffix. Changed same-component targets fail closed; other components are preserved.
An identical deployed digest is a no-op and retains existing deployed provenance.
A deployment-reference-only merge does not rebuild otherwise-current images; previously
unpublished build changes remain selected until that component publishes successfully.

If one component fails, successful siblings may still publish and promote independently.
Use Actions' failed-job rerun on that original run after correcting an authorized
prerequisite; retained evidence must match its original SHA/run and target intent.
If that component previously built successfully, missing or expired retained result
requires a fresh authorized run. A component whose earlier producers all failed,
were canceled or never reached the build has no successful result to retain and
builds on rerun. Original run intent is always required on a later attempt; missing
intent requires a fresh authorized run even when no component succeeded previously.
That intent also preserves the original selected component set. Full reruns keep
successfully published components selected when their promotion failed; updated
publication baselines must not silently remove their pending promotion retries.
The original empty selection likewise remains empty for that run.
Do not substitute another run's artifact or manufacture a record. Changed same-component
target state requires fresh intent (an exact already-applied result is a no-op); unrelated main commits can be
incorporated while preserving other component records. Missing old publication baselines
conservatively rebuild; that does not authorize replacing required rerun evidence.

The trusted wrapper invokes `node scripts/deployment-ci.mjs component NAME --publish
--output PATH` and then passes its `component-result.json` plus `run-intent.json` to
`scripts/promote-images.mjs`. PR validation uses `component NAME` without publication.
These are workflow implementation interfaces, not instructions to publish locally:
use the authorized parent Actions run so source/run/intent evidence remains verifiable.

After separately authorized review/merge, update this checkout to the reviewed revision
using your normal Git workflow. Argo watches main; unmerged local files are not available
to it. Validate committed component state and derived names:

```sh
node scripts/deployment-validation.mjs committed
node scripts/deployment-validation.mjs jobs "$PWD"
kubectl kustomize deploy/environments/local > /private/tmp/equipment-local-manifests.yaml
node scripts/deployment-validation.mjs manifests /private/tmp/equipment-local-manifests.yaml
```

Committed-state validation accepts valid unreleased, partial and complete states with
matching overlay references and current available bootstrap hashes. It runs before CI
image/hash transformations. To inspect one actual merged record's schema and public
multiarchitecture index, use, for example:

```sh
node scripts/deployment-validation.mjs release deploy/environments/local/releases/inventory.json
```

Run that command only once the named genuine record exists. A partial state is not
deployable: manifest/runtime checks and setup remain blocked on missing components.
The rendered application manifests contain Secret references, not private Secret values.
Keep private-resource rendering/output out of shared files. A passing committed-state
check with missing images is not deployment success.

For a public configuration/Job-template-only change:

```sh
node scripts/promote-images.mjs refresh "$PWD"
node scripts/deployment-validation.mjs jobs "$PWD"
git diff -- deploy/environments/local/jobs
```

Refresh changes only existing bootstrap components' local wrapper `nameSuffix` fields.
Missing bootstrap records remain unreleased. It neither publishes images nor creates
a PR. Review the whole configuration diff through the normal process. Current component
hash inputs are in [the runtime contract](contracts/runtime.md#component-records-and-bootstrap-identity).

## Setup, status and private access

Install repository dependencies when needed, then run:

```sh
npm ci
npm --prefix src/Web ci
node scripts/local-kubernetes.mjs prerequisites
node scripts/local-kubernetes.mjs setup
node scripts/local-kubernetes.mjs status
```

Setup has a total 15-minute command budget. It verifies published indexes and suffixes,
creates/reuses private state, provisions Secrets before synchronization and waits for
application deployment readiness. No local image build/load override is supported.
Status prints pod/PVC/Job summaries without credentials. An existing operation lock
means another mutation may be running: inspect its owner before removing any stale lock.

The create-once bundle is `.local/kubernetes/credentials.json` (0600), beside private
kubeconfig/certificates in the 0700 directory. Back it up privately if you need recovery;
there is no backup service. Missing bundle plus existing durable state or kubeconfig
fails without replacement passwords. Restore the original bundle; do not delete the
ownership marker, regenerate credentials or reset storage as an ordinary repair.

Open https://app.equipment.test. Demo account password fields are:

| Username | Private bundle field |
| --- | --- |
| employee-a | alice |
| employee-b | bob |
| approver | manager |
| equipment-staff | staff |

Copy a selected password directly to the macOS clipboard without printing it. This
example selects employee-a; replace only `alice` with another listed field or
`dashboardBrowser` for Dashboard access:

```sh
node --input-type=module -e 'import {readFileSync} from "node:fs"; import {execFileSync} from "node:child_process"; const bundle=JSON.parse(readFileSync(".local/kubernetes/credentials.json","utf8")); execFileSync("/usr/bin/pbcopy",{input:bundle.alice});'
```

Paste only into the intended local login form, then clear the clipboard when finished:

```sh
printf '' | pbcopy
```

Do not paste private bundle contents into terminal transcripts, Git, chat or evidence.
The clipboard is local OS state; use your approved private editor/password workflow if
clipboard history is enabled. Login/logout, another user's denial and the reservation/
notification workflow still require browser acceptance.

Each service has a document/UI/callback under its fixed prefix:

| Service | Interactive UI | Document |
| --- | --- | --- |
| Inventory | https://app.equipment.test/services/inventory/scalar/v1 | https://app.equipment.test/services/inventory/openapi/v1.json |
| Reservations | https://app.equipment.test/services/reservations/scalar/v1 | https://app.equipment.test/services/reservations/openapi/v1.json |
| Notifications | https://app.equipment.test/services/notifications/scalar/v1 | https://app.equipment.test/services/notifications/openapi/v1.json |

Sign in through Scalar's equipment-docs PKCE client and verify a permitted write and a
forbidden operation. These actions change real demo data. Documentation remains disabled
outside Development unless the deployment explicitly enables it.

For diagnostic interfaces, run one command per terminal; each forward binds loopback.
The Dashboard forward lasts at most 180 seconds. The interactive Argo forward stays
open until Ctrl+C (or a connection/process failure); keep that terminal open:

```sh
node scripts/local-kubernetes.mjs access dashboard
node scripts/local-kubernetes.mjs access argocd
```

Dashboard telemetry uses a dedicated retained local volume and resumes the same
history after Pod replacement. It survives ordinary setup and stop, but explicit
application reset or cluster teardown deletes it. Storage is local to the kind
node, not a backup; the 1 GiB PV allocation is not a hard filesystem quota.
See [Dashboard storage design and verification](team/dashboard-persistence.md).

Dashboard opens at http://127.0.0.1:18888 and accepts the private `dashboardBrowser`
value entered manually, never a token-bearing URL. Argo opens at
https://127.0.0.1:18443 with username `admin`. Private setup supplies the owner-issued
leaf/key through `argocd/argocd-server-tls`; its explicit 127.0.0.1 IP SAN and retained
trusted CA must validate normally. Do not accept the generated self-signed fallback
or disable verification if setup/certificate preparation is incomplete. This supported
Argo Secret configuration is documented in [Argo TLS guidance](https://argo-cd.readthedocs.io/en/release-3.5/operator-manual/tls/).
Copy its initial admin password without printing the Secret:

```sh
node --input-type=module -e 'import {readFileSync} from "node:fs"; import {execFileSync} from "node:child_process"; const secret=JSON.parse(execFileSync("kubectl",["--kubeconfig",process.cwd()+"/.local/kubernetes/kubeconfig","--context","kind-equipment-local","-n","argocd","get","secret","argocd-initial-admin-secret","-o","json"],{encoding:"utf8"})); execFileSync("/usr/bin/pbcopy",{input:Buffer.from(secret.data.password,"base64")});'
```

If that initial Secret has been removed after an intentional password change, use your
retained Argo credential; the tool does not reset it. Databases, broker management,
health details and Keycloak administration have no public ingress.

## Smoke and durable-state verification

After actual setup and host trust, close manual Dashboard forwards so smoke can own
18888/18890. The lifecycle command prepares private smoke state, supplies the CA before
Node starts, forwards diagnostic ports, and cleans up its own forwards:

```sh
node scripts/local-kubernetes.mjs smoke
node scripts/local-kubernetes.mjs smoke --capture-persistence
```

Smoke performs real authenticated business writes/cancellation, notification checks,
permitted/denied calls, service-document/Scalar-asset and authenticated Dashboard/OTLP
checks. Export verification observes actual workflow/dependency spans and correlated
safe logs using the pinned Dashboard API, with finite polling and response-size limits;
API authentication alone or an empty export is insufficient. Fresh bootstrap evidence
may be absent after Dashboard restart: obtain a safe fresh setup/capture rather than
substitute synthetic telemetry. Resource `hasMetrics` proves ingestion availability,
not metric dimensions or retention pressure; detailed labels/instruments/pressure and
controlled provider-outage diagnostics remain the explicit manual T035 acceptance.
Capture additionally writes create-only 0600 `persistence-checkpoint.json`,
including original identity ownership, exact reservation/events and both notifications;
it refuses an existing checkpoint before another capture write. It contains business
identifiers, so keep it private even though it contains no password/token.

After each separately scoped lifecycle experiment, verify the same checkpoint:

```sh
node scripts/local-kubernetes.mjs smoke --verify-persistence
```

Verification reauthenticates with retained credentials and rejects identity recreation,
changed/missing events or duplicate notification effects. It needs no diagnostic forward
and performs no lifecycle/destructive action. The underlying direct command is also
available after the lifecycle command has prepared `smoke-state.json`:

```sh
NODE_EXTRA_CA_CERTS="$PWD/.local/kubernetes/ca.crt" \
  node scripts/deployment-smoke.mjs --state "$PWD/.local/kubernetes" --verify-persistence
```

Do not delete a checkpoint merely to turn a failed comparison into a pass. Capture a
new fixture only after deliberately archiving the prior evidence and starting the
intended fresh acceptance scenario.

## Lifecycle experiments and destruction boundaries

Run one experiment at a time, recording exact revision, environment, command/exit and
nonsensitive result. They are operator steps, not actions executed by this document.

- **Repeat setup:** rerun `node scripts/local-kubernetes.mjs setup`, then verify
  persistence. Credential bytes and existing human passwords must remain usable.
- **Pod replacement:** on this owned disposable demo, use the exact context to restart
  a selected Deployment, await rollout and verify the checkpoint. For example:

  ```sh
  kubectl --kubeconfig .local/kubernetes/kubeconfig --context kind-equipment-local \
    -n equipment rollout restart deployment/postgres
  kubectl --kubeconfig .local/kubernetes/kubeconfig --context kind-equipment-local \
    -n equipment rollout status deployment/postgres --timeout=180s
  node scripts/local-kubernetes.mjs smoke --verify-persistence
  ```

  Repeat separately for the broker/identity/application dependency under examination;
  downtime is accepted. Never restart the existing Podman VM as part of this command.
- **Normal update:** after a validated real promotion commits to main, observe
  Argo's full sync/current successful operation, run status/smoke and verify persistence.
  An image rollback does not automatically undo database schema migrations.
- **Prune/deletion safety:** agree the exact harmless drift or Application-only deletion
  experiment first, inspect retained PVC/PV ownership and verify the checkpoint before
  and after. The Application has no cascade finalizer; protected storage is not ordinary
  Argo-pruned data. Do not replace this with deleting a namespace, PVC or PV. Record
  actual self-heal/retention evidence rather than inferring it from annotations.
- **VM restart:** the owner explicitly schedules/restarts the existing VM, accounting
  for its unrelated workloads. This session has not done so. After that owner action,
  verify cluster status and the original checkpoint; hosted CI cannot supply this proof.
- **Missing credentials:** use a reviewed reversible private-file recovery exercise,
  retain the original bundle securely, assert setup refuses replacement, then restore
  its exact bytes/mode. Never discard the only bundle or log its content.

Argo database/identity Jobs have deterministic release/config names and Sync hooks.
Successful hooks are cleaned by HookSucceeded; no failure TTL/HookFailed cleanup is
allowed. BeforeHookCreation replaces the same named object during retry, including
configured bounded automatic sync retries. Capture safe failure diagnostics before
retry; retain the final failure when retries stop. Selective sync skips hooks, so it
cannot establish prerequisite bootstrap. Local setup must be judged against the current
operation, not a previously healthy old Deployment. CI directly applies raw Jobs without
Argo and explicitly waits for their completion.

These commands have distinct effects and must be deliberately selected:

```sh
node scripts/local-kubernetes.mjs stop
node scripts/local-kubernetes.mjs setup
```

Stop suspends reconciliation and Jobs/scales application workloads down while retaining
private credentials and durable data. Setup resumes the managed demo.

```sh
node scripts/local-kubernetes.mjs reset --confirm-delete-data
node scripts/local-kubernetes.mjs setup
```

Reset first halts reconciliation, then deletes only the equipment namespace, its three
named PVs and exact application data directories inside equipment-local's node. It
retains private credentials and the cluster/platform. Existing checkpoints should now
fail because data was explicitly destroyed; record that expected result, archive it
privately and capture a new scenario only after fresh setup.

```sh
node scripts/local-kubernetes.mjs teardown --confirm-delete-cluster
```

Teardown deletes only equipment-local and all of its data, after stopping reconciliation;
it does not delete the Podman VM or unrelated containers. Private credentials and TLS
files remain for deliberate reuse/recovery. Cluster deletion is not a backup strategy.
Fresh setup after reset/teardown and retained-state safety still need actual acceptance.

## Checks, failure diagnosis and evidence status

Run the required checks with the README's Podman/Testcontainers environment:

```sh
npm run format-check
npm run lint
npm run check
EQUIPMENT_KUBECTL=/private/tmp/equipment-k8s-tools/kubectl \
  CONTAINER_RUNTIME=podman npm run test:deployment
```

The separate deployment test runner serializes its provider modules for the measured
existing-VM budget; normal backend test parallelism is unchanged. Each module has a
hard 15-minute deadline plus bounded termination. Set DEPLOYMENT_TEST_TIMEOUT_MS only
to shorten that budget (1–900000ms), never to hide an unbounded test. It includes real
provider lanes; process doubles alone do not establish runtime acceptance.

The PR workflow separately builds disposable test images, creates its own ephemeral
kind environment and runs deployed smoke. This is CI infrastructure, not another
supported developer image-load workflow. Hosted workflows have not been executed here.

On failure, retain command/revision/exit status and use status plus authenticated Argo
operation history. Inspect only narrowly selected local logs privately; raw provider
output/telemetry can contain sensitive material. Do not publish bundle contents,
connection strings, token URLs, request bodies or full unreviewed exports. Correct the
identified dependency, restore original private state, and retry within documented
budgets. Never disable authentication/TLS/audit, broadly delete storage, or regenerate
credentials to clear a check. Complete-system memory/CPU/retention measurements remain
required; startup estimates are not measured capacity.

Evidence already recorded: minimal kind/Podman compatibility and temporary-CA
host/pod ingress routing; all seven native arm64 production images built, including the
final broker-telemetry image and UID999/0600 output probe; actual production frontend
static/nonroot startup; pinned standalone Dashboard authentication and selected container
limits. The final isolated Aspire PostgreSQL-Keycloak browser suite passed 27/27.
A controlled owned database outage produced API/readiness 503 with liveness 200 and
recovered to 200. Its actual OTLP capture contained 824 spans, 804 logs and 287 traces,
including 385 SQL, 28 messaging, 113 identity HTTP and 16 error spans, with 798 correlated
logs; inspected known-credential/JWT matches and forbidden attributes were zero.
Bootstrap workflows/resources were observed. The Dashboard metrics page and five
resources were observed, but instrument-detail automation failed, so detailed metrics
inspection remains pending. The isolated session stopped successfully, its private
credential fixture was deleted, and the original session/old identity volume remained. See [research](research.md),
[images evidence](team/images-evidence.md), [lifecycle evidence](team/lifecycle-evidence.md),
[deployment evidence](team/deployment-evidence.md) and [delivery evidence](team/delivery-evidence.md).
These are bounded claims, not complete-system acceptance.

Publication qualification now includes successful hosted PR quality/image validation
and all seven main publications/direct promotions in
[run 39803954908](https://github.com/cosminstirbu/equipment-reservations-lab/actions/runs/39803954908).
Integrated Windows setup, smoke and repeat-setup persistence results are recorded in
[Windows qualification](team/windows-local-setup.md), including the local repairs that
have not yet been adopted into main.

Pending: fresh corrected-main/Argo adoption and drift correction, integrated macOS
setup/reruns, browser login/logout/Scalar operations, detailed export/cardinality and
pressure limits, remaining persistence/pod/update/VM-restart experiments, reset/fresh
setup, final independent reviews/convergence and explicit human acceptance. Detailed Aspire
metric-instrument inspection remains pending despite the bounded Aspire evidence above;
Aspire results do not substitute for Kubernetes acceptance. Azure artifacts/provisioning/
runtime validation remain outside this feature; no Azure action was performed or
authorized.
