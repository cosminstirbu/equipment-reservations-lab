# T089 bounded delegation producer/cache implementation

Scope: actual existing workload delegation descriptor only. Grant resources, conditions,
scopes and permissions remain unchanged. Native mocked Terraform contracts exercise
source-derived role/assignment/raw-condition/rule/hash output. Public deterministic
schema tests preserve real canonical hashing and schema collaborators; these are justified
solitary validation cases, not provider authorization evidence. Tests must reject missing,
foreign, extra and mutated descriptors before cache acceptance.

The pure evaluator requires independently trusted expectedDescriptor. Self-consistent
caller hashes alone cannot establish source provenance. Actual clean-source reconstruction,
live inherited-role audit and publication prerequisites remain explicit unfinished gates;
the mandatory G3 barrier remains. No cache root or permission is added.

## Producer-only checkpoint

Coordinator narrowed this batch before JS/cache edits: only delegation.tf, vault-guard.tf
and the existing foundation native contract file changed. The new nested output is NOT
yet operationally admissible to the old strict JS schema. That explicit migration gate
is intentional; no compatibility bypass or successful publication is claimed.

The producer reads the existing named RBAC Administrator definition at workload scope
through a new read-only data block, then emits complete sorted role attributes, actual
existing apply/destroy assignment attributes, exact rendered condition bytes/hashes,
assignment semantic hashes and the full version1 semantic hash. Six normalized rules
derive from existing locals/resources, including the base null principalIds meaning
ANY ServicePrincipal. No role assignment, scope, condition or permission changed.

Intended RED: the backend-free mocked foundation command failed with status1; private
JSON inspection confirmed Unsupported attribute specifically for workload_delegation.
The ordinary sandbox first lacked registry access. An escalated backend-free retry
initialized pinned providers and established the intended red without Azure requests.

GREEN: `node scripts/azure-quality.mjs test --directory infra/azure/foundation` passed
31 native mocked contracts, exit0. It includes backend-free init/validate and the new
actual-source output/condition/role/assignment/semantic-hash and all-six-rule assertions.
No mock file or provider lockfile was edited. Expanded assertions initially distinguished
Terraform tuple/list representations despite identical JSON arrays; the final contract
compares serialized arrays, the public output boundary, while retaining sorting and
uniqueness expectations. All existing foundation contracts remain passing.

Scoped pinned formatting and `git diff --check` passed on the three edited files.
Whole-repository checks and independent reviewer verdicts remain coordinator-owned.

Existing source preservation was verified independently in memory: removing only the
new data/pure-local block reconstructs delegation.tf SHA256
`A51373DEC9360F944BE7B35E90D4E7234574A4E6B20279B5E08764700717028A`, exactly matching
the earlier reviewed terraform-inspection-description-snapshot.json entry. Thus the
previous grants, condition strings and source locals retain their original bytes.

| Frozen file | SHA256 |
|---|---|
| infra/azure/foundation/delegation.tf | 9EC8A8A78FC3C987F0754B5BAEDF1C522CFF571C3ADE5444B7F9AEFE70DE9685 |
| infra/azure/foundation/vault-guard.tf | 3E6BB8ECC56F403CDD01852CFAE32C24257C868171CCB2139C23BA3F496AA36D |
| infra/azure/foundation/tests/foundation.tftest.hcl | C2AFE7377F051B18AE67963167233FD42F350E228CCFBF4D27F9242EE1D6F985 |

## Exact next migration dependency

- azure-infrastructure.mjs/.test: require and validate the new nested descriptor, bind
  actual actor/scope references and canonical hashes, without treating self-hash closure
  as independently trusted provenance.
- azure-guard-test-fixture.mjs: faithful source-shaped delegation fixture extension;
  it is an existing explicit immutable test-only closure asset.
- azure-handoff.test.mjs and azure-guard-activation.test.mjs: migrate existing seeds and
  public handoff/activation boundary regressions as needed. azure-handoff.mjs may need
  actor-context binding but must keep one complete vault_guard, no new root cache field.
- Guard helper independently owns parser/equivalence/evaluator. Its expectedDescriptor
  must come from trusted source/actual observations; caller maps alone are insufficient.
  Clean-source reconstruction, actual current role/assignment/condition observations,
  inherited authority closure and publication gate remain unbuilt/pending.

No source-audit, actual Azure authorization, hosted fixture, runtime causal repair,
successful native-cluster reproduction, spending or acceptance is claimed. This staged
producer subset does not complete T089 or enable an operational workflow.
