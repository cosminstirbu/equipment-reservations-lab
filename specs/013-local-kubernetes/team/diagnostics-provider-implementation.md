# Provider diagnostics implementation evidence

Date: 2026-10-21. Baseline: 623bfaf plus coordinator-approved diagnostics preparation.
Assigned subset: T047/T048 only; no task/checklist/verdict changes. Applied
speckit-implement with explicit feature directory `/c/Repos/equipment-reservations-lab/specs/013-local-kubernetes`.
Bash check-prerequisites --json --require-tasks --include-tasks succeeded; all
checklists read-only: diagnostics10/10, local-kubernetes14/14, requirements16/16.
No extensions.yml exists. Existing ignore configuration retained; no new publishable
package or generated artifact was introduced.

## Test design and classifications

This implements the approved design record in diagnostics-design.md. Public process
entry points remain actual test-file CLIs and verifyConfigRollout. Real internal
setup, assertions, process runner/error rendering, Node test reporting and cleanup
remain. Dedicated regression file deployment-provider-diagnostics.test.mjs scopes
external executable replacements to provider/tool names using a child-process preload.
The replacement delegates to actual Node executables for stdout/stderr and exit23,
29 and31. It does not mock process helper calls or change real provider assertions,
timeouts, permissions or prerequisites. No provider success is established by these
boundary regressions. The live-rollout regression retains real manifest copy/edit
and actual filesystem EISDIR failure, at the filesystem removal boundary; the
provider apply boundary emits a known safe primary OperationalFailure. It proves
primary preservation and separate safe cleanup without disclosing raw filesystem paths.

| Owned file | Operation classification and retained contracts |
| --- | --- |
| deployment-broker-retention.test.mjs | volume creation/removal, owned container stop/removal stream stdout+stderr; port machine response public capture; container run privately captures because starts can echo env-file/provider errors. Public authenticated HTTP assertions and real broker persistence assertions retained. cleanupAll attempts container, volume and private fixture cleanup independently. |
| deployment-database-bootstrap.test.mjs | source revision/precise image ID/public kustomize capture; tar/build/network/volume/removal stream; TLS generation/env-file starts private. Status-observing readiness/bootstrap/scoped SQL calls remain captured privately, now with validated failure metadata and measured duration. Known DatabaseBootstrap failure-type allowlist retained. Binary source archive deliberately captured with no raw binary tails. cleanupAll attempts all recorded exact containers, volume, network, image and private fixture. |
| deployment-dashboard.test.mjs | port mapping public capture; removal streams; env-file runtime startup private. Raw stderr/Error interpolation removed. Real authenticated Dashboard API assertions and bounded readiness retained. cleanupAll attempts provider removal and private fixture independently. |
| deployment-ingress.test.mjs | kind clusters response capture; create/delete cluster stream; public kubectl progress stream and get/kustomize capture; Secret commands, private stdin applies and openssl private. Forward captures bounded4000-character readiness suffix, drains stderr, emits safe readiness, normalizes spawn/exit/start timeout metadata, records unexpected later exits for teardown, and bounds termination5s then SIGKILL. Cleanup attempts every known forward, owned cluster and fixture independently. |
| deployment-config-rollout.test.mjs | public kustomize machine capture normalized via shared runner; temporary tree cleanup safe via cleanupAll; existing rollout/PVC/telemetry manifest assertions unchanged. |
| deployment-ci-contract.test.mjs | public version/render capture; openssl prepare/verify private; scoped injected mutation boundary unchanged. Final cleanup preserves primary and reports safe cleanup failure separately. Real TLS/private-mode assertions retained. |
| deployment-config-rollout-live.mjs | actual live rollout assertions unchanged, including bounded HTTP observation, pod identity and retained PVC checks. Filesystem finally now preserves primary failure with separate safe cleanup diagnostics. |

Safe labels are fixed at call sites; arguments, env, stdin, provider errors and
sensitive payloads do not enter ProcessFailure. Public capture uses shared4000-char
per-stream tails; long forward output is bounded without saving raw logs.

## Test-first and checks

Command: `node --test scripts/deployment-provider-diagnostics.test.mjs`.
Intended reds observed sequentially before each corresponding repair:

- Dashboard startup: status23 existed only in assertion values; raw PRIVATE_PROVIDER_PAYLOAD leaked, normalized status/duration absent.
- Ingress TLS setup: raw marker leaked, normalized status/duration absent.
- Broker startup: blanket inspect privately message hid status23 and duration.
- Database source revision: blanket private output suppressed message hid safe capture/status/duration.
- Configuration rollout and CI contract: raw execFileSync Error serialized raw command/output; normalized status/duration absent.
- Live rollout simultaneous failure: actual EISDIR replaced rollout primary failure and echoed owned fixture path.

The same command after repairs passed8/8 (exit0). Supplementary ingress async
forward failure uses an actual child exit23, no raw provider marker; broker regression
also verifies public stdout/stderr, retained primary status23 and distinct cleanup
status29/status31, demonstrating both provider removals attempted. Public git/kubectl
failure fixtures deliberately expect captured marker visibility because those operations
are audited public; private startup/TLS/forward fixtures require marker absence.

Each source edit was formatted with exact-file npm.cmd run format and reread.
Scoped ESLint command `node node_modules/eslint/bin/eslint.js` followed by all eight
owned script paths passed exit0. `git diff --check --` followed by seven tracked owned
script paths passed exit0. The Windows npm.ps1 execution-policy issue was avoided with
npm.cmd, without policy changes. The initial `--test` child runner experiment did not
execute the intended entry point; direct test-file CLIs then produced intended reds;
that setup failure is not counted as regression evidence.

Root owns final npm run format-check, npm run lint, npm run check, deployment/provider
checks and independent reviews after freeze. This worker's unprivileged actual Dashboard
probe failed because Podman socket identity was inaccessible, not because the assertions
passed. Coordinator reports Podman is available elevated and will arrange real-provider
checks; kind/kubectl/openssl absent on this PATH. No VM change/start or provider success,
POSIX signal proof, feature acceptance, commit, push or workflow trigger is claimed.

## Frozen script snapshot

| File | SHA256 |
| --- | --- |
| `scripts/deployment-broker-retention.test.mjs` | `7451cb29ed8578ef814b5b499ce55b29f2ce95d1085731aaab8af90c3f1fedda` |
| `scripts/deployment-database-bootstrap.test.mjs` | `e0a2d4e1a9c627ae3c878c4b9ae32a7339b3c2977058f4867c776dad2e917be4` |
| `scripts/deployment-dashboard.test.mjs` | `f29e56006211e1e06c0d2c94d2aa633dd30be429c627bab7a0f9fb04cb707311` |
| `scripts/deployment-ingress.test.mjs` | `1c9278e90232b42a88797cffcb1aef1e2a208a27c04a9fb3cf5dcdf2fcce3069` |
| `scripts/deployment-config-rollout-live.mjs` | `16efd7f43ff1be84a12a43bb6ac80186e3cef2beb7216b5ce3aaf0dac3b01910` |
| `scripts/deployment-config-rollout.test.mjs` | `a056c6d0b5cb6f18700eddf16db25e35fffd5c99de79a90ee686f9ded88a731c` |
| `scripts/deployment-ci-contract.test.mjs` | `6b5387ccc2345af9b605d0019a39984ba6b15ae4d50185cc55ffad133b41af4b` |
| `scripts/deployment-provider-diagnostics.test.mjs` | `d3a30b49add13896f717c43eaa6391a889ba003dfa1ea1e95f75e1abdbccfcc6` |
