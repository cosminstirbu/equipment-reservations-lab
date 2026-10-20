# Local Kubernetes deployment planning

Status: interview in progress. This is a decision record for a later implementation
handoff, not an approved implementation plan. No deployment is authorized by this file.

## Settled scope

- Use kind with the existing Podman environment as the local Kubernetes target.
- Deploy Angular, Inventory, Reservations, Notifications, PostgreSQL, RabbitMQ,
  Keycloak, bootstrap processes, and the standalone Aspire Dashboard container image.
- Design shared application images and Kubernetes definitions for eventual AKS reuse,
  allowing environment-specific configuration without application source changes
  when switching targets.
- Deliver local deployment artifacts only. Azure provisioning and deployment artifacts
  are deferred; Azure portability remains a design consideration.
- Target a single-instance demo, accepting downtime. Data must survive ordinary pod
  restarts; deleting the environment may intentionally erase demo data.
- Conduct the planning interview first. Implementation will be handed to the feature
  team in a separate session after the user confirms shared understanding.
- Argo CD watches deployment manifests in the existing public
  `equipment-reservations-lab` repository; secrets remain outside Git.
- Include GitHub Actions for tests, image builds, and public GHCR publication.
  Application images in Kubernetes use GHCR references pinned by digest. The later
  environment decision supersedes the earlier local image build/load workflow.
- Retain Aspire for everyday development. Maintain explicit Kubernetes deployment
  configuration separately, with shared version/configuration contracts to prevent drift.
- Use stable local application and Keycloak hostnames with locally trusted HTTPS.
  A one-time developer trust setup is acceptable. Browser and service identity issuer
  configuration must agree, without weakening token validation.
- Initially expose Argo CD and the standalone Aspire Dashboard only through local
  port forwarding, with the authentication requirements recorded below.
- A local setup command generates credentials, retains them in ignored local files,
  and provisions Kubernetes Secrets before application deployment. Ordinary updates
  and restarts reuse credentials; secret values must not enter Git or command output.
- Run PostgreSQL, RabbitMQ, and Keycloak in Kubernetes. Keycloak uses a dedicated
  PostgreSQL database and credentials on the shared demo PostgreSQL instance.
- Also change Aspire development to use PostgreSQL for Keycloak, with the existing
  local identity data handled as recorded below.
- Ordinary deployments preserve application data. Provide a separate explicitly
  destructive reset command; cluster deletion may erase data. Backups and recovery
  after cluster deletion are outside scope.
- Require Dashboard browser authentication and authenticated cluster-internal OTLP
  ingestion. Telemetry is bounded and temporary and may disappear on Dashboard restart.
- CI publishes images and proposes manifest updates through pull requests. Argo CD
  automatically deploys merged changes with immutable image references.
- Recreate Aspire Keycloak realm/demo accounts in PostgreSQL through bootstrap rather
  than migrate the existing database. Preserve the old volume until explicitly removed;
  existing sessions and manual identity configuration do not carry over.
- Add a separate explicitly invoked deployed smoke-check workflow, keeping normal
  application tests independent of Kubernetes and AppHost. Verify authentication,
  reservation/notification behavior, persistence after pod replacement, and correlated
  telemetry, with justified manual browser checks.
- Owner approved planning a scoped testing-guide amendment for local deployment
  verification. Cloud deployment and automated AppHost tests remain outside this scope.
- Use Kustomize with a shared application base and environment-specific overlays.
  Use pinned upstream Helm charts only when they provide a clear maintenance benefit;
  do not author an application Helm chart by default.
- Environment means deployment target: the local machine now and Azure in a future
  feature. Both use GHCR application images pinned by digest. Implement only a local
  environment folder now, with no Azure overlay or provisioning artifacts.
- Do not create separate local-dev/local-demo environments or local image overrides.
  Unpushed development continues through Aspire.
- Publish application images for linux/arm64 and linux/amd64, pinning multi-platform
  image digests. Verify third-party image architecture support as a prerequisite.
- Serve Angular and application APIs through one HTTPS origin using internal API
  proxy routes; Keycloak uses a separate HTTPS hostname. Database, broker, and
  management endpoints remain internal.
- Pull requests validate without publishing deployment images. Application changes
  merged to main publish images and open a digest-update PR for the local environment.
  Deployment-only PR merges validate manifests without another publication/promotion loop.
- Provide documented commands for prerequisites, idempotent setup, status, operational
  UI access, smoke checks, and explicitly destructive teardown/reset. Inspect the
  existing Podman VM and report incompatibilities/resource shortages. VM changes and
  local CA trust installation require an explicit developer action.
- Expose each API's OpenAPI document and Scalar UI through the application HTTPS
  origin, including working Keycloak callbacks. Exposure is environment-configurable.
- Database, identity, and broker provisioners safely rerun during deployment, creating
  missing configuration without deleting application data or overwriting existing
  user passwords. Configuration changes are explicit; ordinary deployment does not
  reset identities or credentials.
- If durable state exists but local credential files are missing, setup stops with
  recovery instructions rather than generating replacement credentials. Automated
  credential rotation and backups are outside scope; destructive reset is explicit.
- Acceptance covers fresh and repeated setup, a GHCR image update through Argo CD,
  login and reservation/notification flows, persistence after pod replacement and
  Podman VM restart, correlated telemetry, and reset followed by successful setup.
  Also verify Aspire with PostgreSQL-backed Keycloak. Rebuilding kind may erase data.
- Argo CD automatically applies updates and corrects configuration drift. Persistent
  data and whole-environment deletion require an explicit destructive command; protect
  durable storage from routine synchronization and accidental Application deletion.
  Document intentional resource removal and lifecycle ownership.
- GitHub Actions also creates an ephemeral kind cluster for deployment smoke checks,
  separate from existing application tests. Hosted-runner container-runtime checks do
  not establish macOS Podman networking, certificate trust, or VM restart behavior;
  collect those acceptance results locally.
- The plan may select concrete ingress, local certificate tooling, hostnames, storage,
  versions, and telemetry limits through documented compatibility research. Evidence
  must address kind/Podman, ARM64/AMD64, secure issuer reachability, bounded resources,
  and plausible future AKS configuration. Escalate scope changes, paid services, or
  weakened standards. No paid Azure provisioning is authorized.

## Confirmed consolidation and handoff

All interview questions Q1-Q29 have been answered, including revised Q16/Q17.
The environment decision supersedes the earlier local build/load and local-dev
proposals. The owner confirmed shared understanding and requested the detailed
[implementation handoff](local-kubernetes-handoff.md) for a separate team session.
No implementation has started. Concrete compatibility research remains a required
preparation step, not completed validation.

## Repository findings

- Existing Aspire orchestration remains the development entry point.
- No application container build, Kubernetes, or GitHub Actions deployment artifacts
  were found at the start of this interview.
- Frontend issuer validation currently allows only loopback hosts. Backend nonlocal
  issuers require HTTPS. Local deployment needs deliberate issuer reachability and
  certificate trust for browsers and pods.
- RabbitMQ provisioning currently depends on AppHost run-mode wiring; deployment
  must preserve its users, topology, and readiness behavior.
- Kubernetes must preserve the database and identity bootstrap dependencies currently
  expressed through AppHost sequencing.

## Technical research required for the plan

- Concrete local URLs, TLS implementation, and issuer reachability.
- Concrete secret provisioning, storage, and reset mechanics.
- Dashboard authentication configuration, telemetry limits, and acceptance evidence.
- Concrete deployment verification procedure and scoped testing-guide amendment.
- Concrete GitOps deletion safeguards and CI cluster-validation implementation.

## Applicable standards and evidence

The [constitution](../.specify/memory/constitution.md) and
[engineering index](engineering/README.md) govern the eventual plan. Source changes
will require the formatting, testing, ASP.NET Core, Angular, Aspire, observability,
and resilience guides; deployed API documentation changes also require OpenAPI guidance.
Planning must identify evidence for local workflow success, authentication, persistence,
messaging, safe correlated telemetry, restart/reset behavior, and eventual portability
limitations. Azure runtime validation is outside this feature.

The existing testing boundary excludes automated AppHost construction/inspection and
places manifest generation/cloud deployment outside its supported policy. Resolve the
new deployment-validation scope explicitly before dependent implementation; any change
to mandatory engineering policy requires owner approval.
