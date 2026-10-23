# Deployment state model

No new business entity or HTTP business contract is introduced.

- CredentialBundle: schema version, generated secrets, CA material references; private
local files 0600 under ignored 0700 directory on Unix, or owner-restricted NTFS ACLs
on Windows as defined by the runtime contract. Created once; restored or explicitly
reset when missing with existing state. Never serialized into Git/logs.
- DurableEnvironment: cluster name/context, ownership marker, retained PostgreSQL,
RabbitMQ and Dashboard volumes; four database/account identities. Dashboard Resume
uses a stable application name and one writable database across Pod replacements.
Running -> stopped -> running keeps data; explicit reset destroys application data;
teardown destroys named cluster.
- ComponentRelease: independent source revision/ref and verified OCI index digest per
application/bootstrap component; both target architectures required. Missing components
remain explicitly unreleased, without a fabricated complete release.
- Promotion: selected component, captured expected target/proposal and exact fresh main
parent. Candidate validation precedes an atomic non-force direct-main update; no
promotion PR. Compare-and-swap preserves unrelated updates and rejects stale targets;
identical deployed digests are a no-op. See [current design](team/direct-component-promotion-design.md).
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
