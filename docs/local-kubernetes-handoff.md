# Local Kubernetes and GitOps implementation handoff

Status: approved requirements from the planning interview; implementation and independent
review pending. Prepared 2026-10-20. Read this file together with the
[decision record](local-kubernetes-planning.md). Neither file claims implementation,
compatibility validation, or feature acceptance.

## Start here in the next session

Suggested owner prompt:

> Start the feature-team loop for the local Kubernetes/GitOps feature described in
> docs/local-kubernetes-handoff.md and docs/local-kubernetes-planning.md. Preserve the
> settled interview decisions. Create the formal Spec Kit artifacts, complete design
> research and independent preparation reviews, then implement and verify the feature.
> Do not create Azure artifacts, provision Azure, merge changes, or publish externally
> without separate authorization. Preserve unrelated work in this checkout.

The primary agent is coordinator; do not create a second coordinator. Follow
[AGENTS.md](../AGENTS.md), the [constitution](../.specify/memory/constitution.md),
[team protocol](agent-team/protocol.md), and
[coordinator role](../.codex/agents/coordinator.toml).
Create a new feature directory using the next available number at execution time;
do not assume 012 is still available. Explicitly resolve active feature state before
invoking Spec Kit skills. Create spec, plan, research, tasks, quickstart, and team
records through the repository workflow. This handoff supplies requirements, not a
substitute for independent preparation review or formal Spec Kit artifacts.

Inspect Git status first. This interview occurred alongside unrelated Spectral/OpenAPI
changes. Do not revert, commit, reformat, or incorporate those changes without checking
their ownership. Use a separate checkout/worktree if feature state or writes would clash.
Record the exact baseline revision and working-tree state; recheck repository findings
because the next session may start on newer code.

## Outcome and boundaries

Deliver one complete, reproducible local Kubernetes deployment on kind using the
existing macOS Podman VM. The deployment is a single-instance learning/demo system,
with downtime permitted and disposable data after explicit reset or cluster deletion.
Normal upgrades, pod replacement, setup reruns, and Podman VM restarts preserve data.

Deploy Angular, Inventory, Reservations, Notifications, PostgreSQL, RabbitMQ, Keycloak,
bootstrap jobs, and a standalone Aspire Dashboard container. Keycloak uses its own
PostgreSQL database and scoped credentials. Also switch Aspire's Keycloak to PostgreSQL,
retaining Aspire as the everyday unpushed-development workflow.

Reuse application images and shared Kubernetes definitions in a future AKS environment
without application source changes. Environment-specific networking, storage, trust,
secrets, and resource sizing are expected. Azure compatibility is a design assessment,
not an acceptance claim. Do not create an Azure overlay, Bicep/Terraform deployment,
Azure CI credentials, or Azure resources in this feature.

No local-dev/local-demo split, local image overrides, or local image-load workflow.
Both this local environment and the future Azure environment use GHCR images pinned
by multi-platform digest. No HA, backup system, automated credential rotation, service
mesh, managed cloud dependencies, or long-term telemetry backend is required.

## Authoritative standards and approved decisions

Read every applicable guide through the [engineering index](engineering/README.md):
formatting, testing, ASP.NET Core, Angular, Aspire, OpenAPI, observability, and resilience,
including their required cross-references. Use applicable project-local Aspire skills
when researching or changing AppHost wiring. Preserve test-first evidence for behavior
changes and test-design records for added/changed tests.

The owner approved planning a narrow amendment to the testing guide to support a
separately invoked local deployment verification workflow and ephemeral kind CI checks.
Materialize and review that exact policy scope before dependent implementation; normal
application tests remain independent of Kubernetes and must not construct, inspect,
run, or publish AppHost. No cloud-testing permission or broader policy relaxation was
approved. Follow governance for any further mandatory-rule changes.

The owner approved environment-configurable deployed OpenAPI/Scalar access through the
local HTTPS application origin, with existing authentication/authorization protections.
Keep default non-Development exposure disabled unless explicitly configured. Plan and
review the narrow deployment adaptation to the OpenAPI guide's direct-service access
rule: the agreed same-origin reverse proxy must preserve service-specific documents,
callbacks, authenticated requests, origin checks, and path handling. This is not an
external request proxy or a new combined API portal. Escalate any genuine policy conflict.

## Design and artifact layout

Proposed layout; adapt names to repository conventions without changing responsibilities:

```text
deploy/
  base/                      # Shared application/dependency resources
  environments/local/        # Local URLs, storage, resource sizing, image digests
  argocd/local.yaml           # Application/Project configuration
  platform/                  # Pinned local ingress and Argo CD configuration
scripts/                     # Lifecycle, smoke-check, CI promotion tooling
specs/<next>-local-kubernetes/
  spec.md, plan.md, research.md, tasks.md, quickstart.md, team/
```

Use Kustomize bases and environment overlays for application definitions. Use pinned
upstream Helm charts only where their maintenance benefit is documented. Do not author
an application chart by default or let Helm and Argo CD independently own the same
resources. Pin chart versions and avoid fetching mutable remote manifests at runtime.

One namespace holds the demo application and its stateful dependencies; use deliberate
separate ownership for Argo CD and shared platform resources. Services reference
Kubernetes DNS/configuration, never AppHost-generated endpoints. Application images
support linux/arm64 and linux/amd64. Test the digest refers to a multi-platform index
and verify all third-party images support both target architectures.

## Required design research before coding

The architect owns a compatibility matrix with exact selected versions, official sources,
date checked, alternatives, and verification commands. Research is unfinished at handoff;
do not present a candidate as proven. Finalize these choices before dependent tasks:

1. Inspect host architecture, Podman version, existing VM resources, connection mode,
   ports, kind and kubectl availability. Prove a minimal kind cluster starts on that
   VM without destructive reconfiguration. Do not reset the existing VM.
2. Select a maintained ingress implementation supporting kind/Podman on macOS and
   plausible AKS use. Evaluate Gateway API support versus Ingress without adding
   unnecessary controllers. Prove host-to-cluster and pod-to-issuer routing.
3. Select local CA/certificate tooling and a reserved local hostname scheme, for
   example app.equipment.test and identity.equipment.test. Explicit host DNS setup
   and trusted certificates must work for the browser, pods, CLI, and CI. Loopback
   resolution on the host alone does not establish pod reachability.
4. Select local persistent-volume provisioning and reclaim behavior. Demonstrate pod
   replacement and VM restart durability. Local host paths belong in the local
   platform/overlay, not application images or a future cloud-independent base.
5. Pin compatible kind node, Argo CD, gateway/ingress, PostgreSQL, RabbitMQ, Keycloak,
   Aspire Dashboard, runtime/base images, Helm/Kustomize, and CI action versions.
   Check current repository pins before changing dependencies unnecessarily.
6. Set CPU/memory requests and limits, ephemeral/durable disk requirements, probe
   budgets, bootstrap deadlines, retry bounds, and Dashboard telemetry limits. Measure
   the complete system rather than treating earlier memory estimates as evidence.
7. Inspect existing provisioners, migrations, documentation callbacks, broker import,
   frontend proxy, and OTLP registration. Reuse production paths and identify gaps
   instead of creating parallel bootstrap implementations.

Use a short ADR only for a consequential, non-obvious tradeoff. Keep deployment
implementation detail out of a business glossary. Reference sources in research.md.

## Runtime contracts

### Routing and identity

Serve production-built Angular and API routes through one HTTPS application origin.
Keycloak has a separate stable HTTPS issuer. Select explicit service-specific API,
OpenAPI, Scalar, and callback routes; document prefix preservation/rewrites and test
them. Do not run the Angular development server as the deployed frontend.

Replace loopback-only assumptions with explicit validated configuration, preserving
Aspire behavior. Require exact issuer/audience checks, TLS certificate validation,
PKCE S256, scoped service credentials, explicit redirects/origins, and existing browser
write protection. Trust only known proxy headers/hops. Do not use Development mode
or disable certificate verification as a deployment workaround.

Publish only required application/login paths. Management, database, broker, health
details, and Keycloak administrative paths remain internal or explicitly forwarded.
Access Argo CD and Dashboard through loopback-bound port forwarding with browser
authentication. Verify a login URL does not leak its token into logs or Git.

### Bootstrap, recovery, and storage

Database provisioning precedes Keycloak/database-dependent jobs; identity provisioning
waits for Keycloak; applications become ready only when contractual prerequisites hold.
Broker provisioning must reproduce run-mode users, topology, permissions, and readiness.
Document Argo CD ordering, Job rerun triggers/cleanup, and failure visibility. Avoid
unbounded waits, fixed sleeps, and a circular dependency on authenticated service readiness.

Provisioning safely reconciles missing configuration without deleting business data or
overwriting existing user passwords. Reuse production migrations/provisioners, with
bounded retries and failure reporting. Ordinary database schema updates must not be
represented as automatically reversible by an image rollback.

Preserve separate databases/credentials for services and Keycloak on one PostgreSQL
instance. Scope bootstrap administrative authority separately from runtime accounts.
Move Aspire Keycloak to PostgreSQL with fresh bootstrapped realm/demo users; preserve
the old identity volume until explicitly removed. No migration of existing sessions or
manual realm configuration is promised.

### Secrets and lifecycle ownership

Generate credentials once into ignored, permission-restricted local files and provision
Kubernetes Secrets before application synchronization. Reuse them on setup reruns.
Missing credential files with existing durable state cause a clear recovery failure,
not silent credential replacement. Keep secrets out of images, logs, Git, rendered
manifest artifacts, PRs, and CI diagnostics. Keep local CA keys private as well.

Separate platform setup, secret provisioning, Argo CD ownership, and application
reconciliation. Auto-sync/self-heal merged configuration. Explicitly guard persistent
resources and application cascaded deletion against data loss; test intentional removal
and document prune behavior. Stop/reset must prevent Argo CD from recreating resources
mid-operation. Distinguish stop, application reset, and complete cluster teardown.

### Observability

Export correlated traces, structured logs, and metrics to each environment's standalone
Aspire Dashboard through authenticated internal OTLP. Secure browser access; do not
enable unauthenticated ingress for convenience. Bound memory and retention; telemetry
can disappear on Dashboard restart. Do not promise AppHost process controls/resource
health features from a standalone OTLP viewer.

Preserve instrumentation/privacy requirements for SQL, broker, and identity calls and
bootstrap failures. Inspect actual exports for credentials, tokens, bodies, personal
data, unsafe URLs and high-cardinality metrics. Record exact limits, sampling, failure
behavior, and absence of long-term storage.

## Delivery workflow and CI

PR checks run existing required validation, manifest/schema checks, and appropriately
scoped deployment checks without publishing images. Use unprivileged fork-safe checks;
never expose publish credentials to untrusted PR code. Pin actions and restrict token
permissions by job. Prefer existing tooling and avoid self-hosted runners on this Mac.

After application changes merge to main, test/build and publish public multi-platform
GHCR images. Generate a reviewable PR updating only local environment digest references.
Record the source revision and published digests. A deployment-only merge validates
manifests without republishing or recursively opening promotion PRs. Handle an existing
promotion PR and concurrent changes without losing updates.

PR deployment smoke tests may use locally built test images in an ephemeral CI cluster;
this is test infrastructure, not a second supported local deployment workflow. Release
acceptance must additionally exercise the actual published GHCR digests.

Document GitHub permissions required for package publication and promotion PR creation,
including any account setting that cannot be enabled automatically. Workflow file changes
do not themselves authorize pushing/merging or publishing packages in this session.

## Dependency-ordered implementation batches

| Batch | Responsibility and completion evidence |
| --- | --- |
| 1. Formal preparation | Analyst translates all decisions into acceptance criteria; architect completes compatibility research and contracts; reviewers clear requirements/design and the scoped policy amendment before code. |
| 2. Application portability | Test-first configuration/proxy/issuer/docs changes; PostgreSQL-backed Aspire Keycloak; safe provisioner reruns. Existing behavior and provider suites pass. |
| 3. Images | Production frontend and API/bootstrap images, non-root where supported, reproducible builds, multi-platform evidence, no secrets in layers. |
| 4. Platform and lifecycle | Minimal kind/Podman setup, ingress/TLS/DNS, secret storage, local volume provisioning, Argo CD bootstrap, safe reruns and clear prerequisite failures. |
| 5. Application deployment | Base/local overlay, dependencies, Jobs, probes, requests/limits, issuer trust, Dashboard security, storage protection and synchronization. |
| 6. CI and promotion | Fork-safe tests, ephemeral kind verification, GHCR publication definitions, digest-update PR logic and loop-prevention checks. |
| 7. End-to-end evidence | Local and CI acceptance matrix, operational quickstart, reset/teardown checks, independent quality/security reviews and convergence. |

Assign stable task IDs after research. Split batches further where necessary; do not
parallelize dependent writes or allow multiple agents to own the same file accidentally.
The coordinator routes analyst/architect/coder/reviewer work under the existing protocol.

## Acceptance and evidence matrix

| Check | Required evidence |
| --- | --- |
| Prerequisites | Actual macOS/Podman/VM versions, architecture, allocated resources, available ports and kind readiness; no unrelated containers lost. |
| Fresh and repeat setup | Bounded successful setup from documented prerequisites, repeat without regenerated credentials, preserved data or duplicate bootstrap effects. |
| Authentication | Browser login/logout, exact issuer, service authentication, permitted and forbidden calls, unchanged browser-write protection, no TLS bypass. |
| API documentation | Each generated document and Scalar UI, valid routing/security metadata, login, permitted write and denied operation; exposure disabled by default outside Development. |
| Business flow | Representative reservation and notification flow using real deployed APIs, identity, PostgreSQL and RabbitMQ; observable eventual delivery without duplicate effects. |
| Persistence | Durable state survives controlled pod replacement, deployment update, and Podman VM restart; restart capture identifies the tested revision. |
| Recovery and ordering | Missing dependency/bootstrap failure is diagnosable, readiness recovers with bounded retries, liveness avoids dependency-driven restart loops. |
| Telemetry | Correlated success/failure traces, logs and metrics, authenticated OTLP/browser access, inspected safe attributes, configured resource limits. |
| GitOps release | Actual GHCR multi-platform digest deploys after approved manifest change, drift correction works, promotion does not loop. External actions need authorization. |
| Destruction safety | Normal sync/application deletion does not silently remove durable data; intentional reset/teardown is explicit and successful; fresh setup works afterward. |
| Missing credentials | Existing data plus missing secret files fails safely with recovery instructions and no replacement credentials. |
| Aspire regression | PostgreSQL-backed Keycloak bootstrap/login, existing development workflow, API docs and correlated telemetry remain functional; old volume retained. |
| CI distinction | Ephemeral kind smoke checks pass on hosted runner; macOS trust/network/VM checks are separately recorded, not inferred from CI. |

For every command/check record environment, revision, exit status, result and evidence
location without sensitive output. Design test cases using the testing guide; do not
replace behavior tests with YAML snapshot assertions. Required handoff checks include
`npm run format-check`, `npm run lint`, and `npm run check` with Podman, plus new deployment
verification. Re-run affected independent reviews and convergence on the final revision.

Unavailable tools, missing GitHub permissions, unrun workflows, unperformed external
publication or local trust actions remain explicit pending gates. Do not claim deployed
GHCR or GitOps release evidence from generated workflow files alone.

## Final team handoff and completion

Quickstart must explain prerequisites, one-time DNS/trust actions, setup/status/access,
URLs and demo credentials retrieval without leaking them, first image publication and
promotion, failure diagnosis, data semantics, reset/teardown, and deferred Azure work.

Preserve requirement IDs through tasks and evidence. Independent quality/security
reviewers own their verdicts; coder/architect cannot self-approve. Run convergence only
after implementation as the protocol requires. Obtain explicit human feature acceptance
and reconcile spec/tasks/team metadata before reporting complete. No automatic merge,
push, package publication, GitHub settings change, or Azure deployment follows from a
passing implementation review.
