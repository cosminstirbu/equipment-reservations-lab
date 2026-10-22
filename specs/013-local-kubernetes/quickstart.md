# Local Kubernetes operational quickstart

Run commands from the repository root on the existing macOS Podman machine. This is
one demo environment, `equipment-local`, with context `kind-equipment-local` and
application namespace `equipment`. Aspire remains the workflow for unpushed development.

The commands below are implemented. Integrated local setup and acceptance have not yet
been executed, and the first genuine GHCR release is absent. Setup intentionally refuses
that missing prerequisite. Generated files, focused tests and standalone probes do not
establish a working complete deployment. See the evidence status at the end.

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

Before setup, the repository owner separately authorizes first publication and promotion.
The release workflow supports automatic publication for application changes pushed
to main and manual dispatch against any repository branch. Select **Release application images**
in Actions and choose the reviewed branch for an explicitly authorized manual run.
Manual dispatch publishes even without application changes; tags and PR/fork events
are excluded. Both architectures use the run's exact source SHA and immutable indexes.
All release runs share one serialized concurrency group. Workflow creation does not
authorize pushing, merging, publishing, creating PRs or changing repository settings
in this session.

Only main runs may create or update the deployment promotion PR. A manual feature
branch run publishes images for diagnosis/review without changing deployment references
or opening a promotion PR; it does not release that branch into the local environment.
Required validation and publication permissions apply equally to manual branch runs.
The branch-release implementation is present; final independent review and full-feature
human acceptance remain pending. The temporary Validate image-build diagnostic job is
being retired; use the ordinary authorized release path for future publication checks.

The publication job requires job-scoped `packages:write`. Confirm repository linkage
and package visibility allow unauthenticated pulls of each public GHCR package; a new
package must not be assumed public. The promotion job has only `contents:write` and
`pull-requests:write`. The owner must enable **Allow GitHub Actions to create and approve
pull requests** where repository/organization policy permits. No elevated personal token
is a fallback for a rejected policy. If publication succeeded but promotion was denied,
correct the authorized setting and rerun the failed promotion job in that same authorized
Actions run; do not invent digests or rerun publication locally to simulate release.

Review the single `automation/local-image-promotion` PR. It contains the actual source
revision and immutable OCI indexes for inventory, reservations, notifications, web,
database-bootstrap, identity-bootstrap and broker-bootstrap, each supporting Linux amd64
and arm64. Only local release metadata, image references and the two derived bootstrap
Job suffix fields may change. Concurrent or human-edited promotion branches fail closed.
A deployment-only merge does not republish or create another promotion.

After separately authorized review/merge, update this checkout to that reviewed revision
using your normal Git workflow. Argo watches the public repository's main branch, so
unmerged deployment files in this worktree are not a release that Argo can fetch.
Validate the real release and derived names:

```sh
node scripts/deployment-validation.mjs committed
node scripts/deployment-validation.mjs release deploy/environments/local/release.json
node scripts/deployment-validation.mjs jobs "$PWD"
kubectl kustomize deploy/environments/local > /private/tmp/equipment-local-manifests.yaml
node scripts/deployment-validation.mjs manifests /private/tmp/equipment-local-manifests.yaml
```

The committed check separately accepts only the strict initial-unreleased form or a
complete real release with independently current Job hashes; it runs before CI image/
hash transformations. It does not make absent release images deployable.
The rendered application manifests contain Secret references, not private Secret values.
Keep private-resource rendering/output out of shared files. These checks currently fail
until a genuine first release is present; that failure is intentional.

For a public configuration/Job-template-only change after a real release exists:

```sh
node scripts/promote-images.mjs refresh "$PWD"
node scripts/deployment-validation.mjs jobs "$PWD"
git diff -- deploy/environments/local/jobs
```

Refresh changes only the two local wrapper `nameSuffix` fields. It neither publishes
images nor creates a PR. Review the whole configuration diff through the normal process.
The exact public-input hash derivation is in [the plan](plan.md#targeted-design-clarification--deterministic-bootstrap-job-identity).

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

For diagnostic interfaces, run one command per terminal; each forward binds loopback
and lasts at most 180 seconds:

```sh
node scripts/local-kubernetes.mjs access dashboard
node scripts/local-kubernetes.mjs access argocd
```

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
- **Normal update:** after an independently reviewed real promotion merges, observe
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

Reset first halts reconciliation, then deletes only the equipment namespace, its two
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

Pending: actual amd64 builds and public GHCR indexes, hosted CI/publication/promotion
runs, reviewed main/Argo adoption and drift correction, integrated local setup/reruns,
browser login/logout/Scalar operations, actual export privacy/cardinality and pressure
limits, persistence/pod/update/VM-restart experiments, reset/fresh setup, final required
checks/independent reviews/convergence and explicit human acceptance. Detailed Aspire
metric-instrument inspection remains pending despite the bounded Aspire evidence above;
Aspire results do not substitute for Kubernetes acceptance. Azure artifacts/provisioning/
runtime validation remain outside this feature; no Azure action was performed or
authorized.
