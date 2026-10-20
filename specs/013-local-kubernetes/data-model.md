# Deployment state model

No new business entity or HTTP business contract is introduced.

- CredentialBundle: schema version, generated secrets, CA material references; private
local files 0600 under ignored 0700 directory. Created once; restored or explicitly
reset when missing with existing state. Never serialized into Git/logs.
- DurableEnvironment: cluster name/context, ownership marker, retained PostgreSQL and
RabbitMQ volumes; four database/account identities. Running -> stopped -> running keeps
data; explicit reset destroys application data; teardown destroys named cluster.
- Release: exact source revision and one OCI index digest per application/bootstrap
image. Both target architectures required. Proposed -> reviewed/merged -> reconciled.
- Promotion: stable branch/PR identity, expected head revision and release source.
Compare-and-swap prevents overwriting concurrent edits; deployment-only changes do not
create another publication.
- VerificationRecord: environment, revision, command/action, exit status, outcome,
evidence path. Pending is distinct from pass; secrets excluded.

Platform owns namespaces/Retain PVs/controller definitions. Private setup owns Secrets;
Argo owns application workloads/claims with storage prune/delete protections. No
application deletion cascades through an Argo finalizer.


BrokerDefinitionsFile is a derived private artifact containing hashed broker credentials
and the existing production topology. It is generated atomically once per ephemeral
init volume from the private credential bundle, never committed or logged. The broker
consumes it read-only; it is not another authoritative topology or durable credential
store. Regeneration from retained credentials during pod replacement preserves the
runtime account contract.
