# Independent implementation quality review 01

Reviewer: /root/quality (verifier_reviewer)

## Reviewer response (verbatim)

Verdict: **changes_requested** for frozen `implementation-012-01`.

Reviewed baseline `4dd685c4e34288f94e932dcd49beb22eea965075`, actual changes and surrounding source/manifests, feature artifacts, scoped policy amendments, design adaptations and implementation evidence. Independently verified all **106 file hashes** against `team/implementation-snapshot-01.json`; no mismatches. Declared snapshot digest: `a66f1edbb52a98e060bf5ffccb191b1abdc14d52b331a3df9329633985cfaaa3`.

| ID | Severity | Blocking | Evidence and impact | Remediation / owner |
|---|---|---|---|---|
| Q-I001 | High | Yes | `deploy/base/rabbitmq.yaml:3` uses a Deployment, with persistence mounted at line 55, but no stable hostname or `RABBITMQ_NODENAME`. Replacement pods acquire new hostnames and therefore new RabbitMQ node identities/data directories. Retaining the PVC does not preserve usable broker queue/message state across replacement. Violates FR-007 / AC-2.1. | Deployment coder: configure a supported stable, resolvable node identity or stable StatefulSet identity. Add a real broker test retaining a durable message/queue across container replacement with changing transient hostname and the same volume. Kubernetes pod replacement remains a required later acceptance check. |
| Q-I002 | Medium | Yes | API Deployments consume `equipment-runtime` through `envFrom`; `deploy/base/web.yaml:52` consumes both public configuration files through `subPath`. No configuration checksum, generated ConfigMap reference or equivalent rollout mechanism changes their pod templates. A configuration-only GitOps update can become Synced/Healthy while pods retain old issuer/docs/proxy configuration. | Deployment coder: implement deterministic public-configuration rollout triggers without secret-derived hashes. Cover API and frontend configuration changes, including actual observable proxy/service behavior and retained durable data. |
| Q-I003 | Medium | Yes | `src/BrokerBootstrap/Program.cs:81` refuses every existing output file. `BrokerExecutableTests.ExecutableCreatesOnlyPrivateDefinitionsWithoutDisclosingAuthority` explicitly requires repeated execution to fail. The production initContainer writes to an `emptyDir`; init containers can be re-executed while their output remains. A valid previous output then blocks broker recovery. Violates safe bootstrap reruns in FR-006/FR-007. | Foundation coder: accept a securely validated identical complete output as successful reconciliation, or implement another reviewed atomic/idempotent approach. Preserve restrictive permissions, unexpected-file refusal and secrecy. Add repeated-execution success and mismatch/unsafe-file failure tests. |
| Q-I004 | Medium | Yes | `deploy/base/rabbitmq.yaml:102` starts the definitions initContainer without the runtime OTLP endpoint/protocol, authentication header/key or service configuration. The executable’s production instrumentation cannot export its success/failure workflow to the authenticated Dashboard under this launch configuration. Violates FR-015 / AC-4.1. | Deployment coder: wire scoped OTLP configuration/authentication into the initContainer. Verify correlated success/failure exports through the production registration against an authenticated collector and rejection with missing/wrong credentials. |

Q-I001 follows RabbitMQ’s documented [hostname-derived node identity](https://www.rabbitmq.com/docs/clustering) and [node-specific data directory](https://www.rabbitmq.com/docs/configure). Q-I002 follows Kubernetes’ documented [environment-variable and subPath update limitations](https://kubernetes.io/docs/concepts/configuration/configmap/). Q-I003 follows the explicit [init-container idempotence requirement](https://kubernetes.io/docs/concepts/workloads/pods/init-containers/).

The earlier Q-I004 message incorrectly included database-bootstrap because combined tool output was truncated. That portion is **withdrawn**: its Job correctly supplies the OTLP key/header/service configuration. The finding applies only to the broker definitions initContainer.

Security owns separate findings for HTTP ingress exposure and promotion overwriting concurrent main-branch changes; these are not duplicated above.

Two evidence questions remain:

- Initial delivery classification/promotion/build test records show missing-module failures followed by green. Supply any intended-behavior red evidence; module absence alone does not establish constitutional test-first compliance.
- The committed-release suffix validator exists, but I found no PR invocation against current committed release/configuration inputs. CI recomputes test-image Job names instead. Identify another enforcing check or wire this validation into the appropriate release-present path.

Source portability, provider isolation/password preservation, private lifecycle ownership, fixed destructive scopes, image definitions, CI boundaries and promotion logic were inspected against the requirements and test-design records. The four defects above prevent implementation approval.

Coordinator reports frozen `format-check` and `lint` passing. Full `npm run check` and the complete separate deployment checks remain pending for this review. I executed only read-only inspection/hash checks; no files were changed.

Recorded Aspire/browser, native arm64 image and standalone Dashboard probes provide bounded evidence. They do not establish actual published multiarchitecture GHCR releases, hosted CI success, complete Kubernetes setup/recovery/configuration rollout, GitOps adoption, VM durability, detailed metric/cardinality inspection, convergence or human acceptance. Those gates remain pending.
