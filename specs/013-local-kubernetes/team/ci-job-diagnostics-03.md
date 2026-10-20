# Hosted CI Job wait diagnostics — round 3

Baseline: c1ac45c75a7c29dd92dc1e29b9a3c33fa09a2509 in the primary checkout, feature013. Coordinator assigned diagnostics only, not an inferred Job behavior fix. Read AGENTS/protocol, constitution, applicable formatting/testing guides and current orchestration/manifests/provisioners. Applied diagnosing-bugs skill: unavailable deleted hosted state prevents a root-cause reproduction loop; this change repairs the missing diagnostic boundary without claiming the application failure was reproduced or fixed. No glossary/ADR files were found by repository discovery.

## Observed evidence and limits

Hosted run39417401158 passed the prior real Docker broker retention, config-rollout, ingress/CoreDNS and frontend routing checks. The deployment step subsequently failed at createEphemeralCluster's JobComplete wait (original line481), with execute suppressing all provider output. The cluster was deleted by normal workflow cleanup. The retained log contains no Job name, Job conditions, Pod phase, container exit code or failure reason.

Therefore database-bootstrap is the first Job in wave order, but the log cannot establish whether that or identity-bootstrap failed. Both share the same call site. Current static/offline-render inspection found Job envFrom references resolve the merged hashed runtime ConfigMap, wave ordering places config/providers before database/identity Jobs, private key references and password expansion order align with production configuration, and CI maps actual built tags to imagePullPolicy Never. No concrete credential, schema, image or timeout defect has been demonstrated.

The next runtime observation must distinguish image/config waiting from terminated process, resource kill, active deadline or retries. If exit1 is observed, existing sanitized bootstrap failure-type logging or a minimal real production CLI/provider reproduction may be needed later. This round does not collect raw logs, change process/Job deadlines, alter provisioning, rerun providers/builds or spoof the CI-only workflow.

## Reviewed design and implementation

Quality and security reviewers independently passed the design before writes. On a failed Job wait, preserve failure and emit the exact known public Job/namespace/name plus a bounded status projection. Validate namespace/name as DNS labels before querying. Run only two context/kubeconfig-scoped reads: that exact Job and Pods selected by its exact batch.kubernetes.io/job-name. Each request is5s, process timeout6s and capture128KiB; oversized/malformed/query failure yields diagnosticsUnavailable without masking the original failed wait stage.

Output contains only allowlisted Job condition type/status/reason, Pod phase, container waiting reason and integer terminated exit code0..255. Unknown enums become Other. Cap conditions, Pods and combined init/regular container statuses at10, and projected JSON at16KiB. Exclude arbitrary messages, pod/container names, specs, environment, Secret values, logs/events and raw exception text/cause. No new retries or success fallback are introduced. Job failure/root-cause resolution remains pending actual captured status.

## Test design and red/green evidence

Extend existing public createEphemeralCluster behavior tests. Retain real manifest validation, private temporary filesystem/Kustomize config generation, argument construction, JSON parsing/projection and failure handling. Replace only external kind/kubectl process transport through the existing run boundary. Faithful returned Kubernetes Job/Pod status JSON includes deliberately hostile private strings in excluded nested fields, reason/phase/name/message fields and thrown process errors. Assertions concern observable safe failure output, exact scope, finite limits, no cause/raw-value leakage and preserved failure when diagnostic reads fail; no private-method/call-count surrogate for Job success is claimed.

Before implementation `node --test scripts/deployment-ci.test.mjs` exited1,6/9: three new regressions exposed the original raw injected wait error without named stage or safe status projection. After implementation the same command exited0,9/9 in0.139s. Existing successful orchestration and build/image behavior tests remain green. No provider/build command was run. Focused ESLint/Prettier/whitespace checks follow below; aggregate checks remain coordinator-owned while the startup source owner finishes its disjoint work.

## Frozen checks and independent review

Final exact-file formatter and re-read completed; scoped Prettier check and ESLint --max-warnings0 exited0. An earlier scoped Prettier read reported deployment-ci.mjs still needed layout; the exact formatter was rerun before final hashes/checks. Final `node --test scripts/deployment-ci.test.mjs` exited0,9/9 (0.121s). No provider or build was invoked. Changed scope whitespace check passed.

Frozen SHA256:

- scripts/deployment-ci.mjs: b17ed7dc7020120095e3d7bfcda8e655c7b0090e4b392ec945745ae8ac5255e3
- scripts/deployment-ci.test.mjs: 19c53259f543c8f66cdc43c36d48b9ecca467764500e8a5f7a7536a247cadfa9

Quality and security reviewers independently verified both hashes and returned code PASS, no new blocking finding, without source edits or provider execution. Their verdicts cover diagnostics only. Deployment waits retain prior generic error behavior outside this Job-specific change. Coordinator owns aggregate format/lint/check and final hosted execution. A future named Job status can guide a separate evidence-based fix; the deleted run's actual bootstrap failure remains unresolved here.
