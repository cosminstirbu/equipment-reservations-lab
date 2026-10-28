# Bounded implemented-source security review

**Verdict: changes_requested.** Two medium-severity source findings block this checkpoint. Neither requires a policy exception.

Scope: the frozen infrastructure, Terraform and provisioning scripts and their tests, with operational/readiness dependencies inspected where relevant. No changing Terraform roots were reviewed. Known pending hosted retrieval, qualification staging and full positive bootstrap integration are not treated as completed behavior.

## SEC-SRC001 — Ambient Terraform settings bypass controlled execution

**Severity:** medium  
**Blocking:** yes — deterministic provider inputs and private-output requirements.

**Evidence:** `scripts/azure-terraform.mjs:644–647` builds the Terraform environment by excluding only `TF_CLI_ARGS*` and `TF_DATA_DIR`. It preserves `TF_LOG*`, `TF_CLI_CONFIG_FILE` and provider development/debug overrides. No controlled CLI configuration replaces the default user configuration.

**Scenario:** An operator runs the command with an existing debugging/development environment:

- `TF_LOG_PATH` can write unclassified Terraform/provider diagnostics directly to another file, outside private subprocess capture.
- A CLI `dev_overrides` configuration can execute an unpinned provider despite a successful locked initialization. HashiCorp documents that subsequent commands disregard that provider’s lock entry. [Terraform CLI configuration](https://docs.hashicorp.com/terraform/cli/config/config-file).

**Preconditions:** Relevant ambient environment or user CLI configuration exists. No such configuration was activated during review.

**Remediation:** Supply an explicit controlled Terraform CLI configuration; reject/remove logging, reattachment and development overrides. Handle Windows environment-name casing. Bind the controlled configuration to the reviewed execution inputs.

**Verification:** Use harmless process fixtures to prove the child receives the controlled configuration and cannot retain raw diagnostics through ambient logging. Test explicit and default-user development overrides without cloud access or intrusive providers.

## SEC-SRC002 — Persistent foundation staging can execute obsolete source

**Severity:** medium  
**Blocking:** yes — reviewed-revision and reproducibility requirements.

**Evidence:** `scripts/azure-terraform.mjs:580–608` copies current `.tf` files and the lockfile into the persistent private foundation directory. It neither removes nor rejects obsolete staged `.tf` files.

**Scenario:** A resource/grant file existed during an earlier invocation and was later removed from reviewed Git. The staged copy remains, so Terraform still evaluates it although the current Git revision is clean and no longer contains that file.

**Preconditions:** Reuse of the foundation staging directory after a source-file removal or rename.

**Impact:** Actual Terraform inputs can differ from the reviewed revision. The current input hash does not detect this stale code.

**Remediation:** Enforce exact staged source inventory/content or use fresh staging while separately preserving authoritative state and migration evidence. Do not delete the only state copy.

**Verification:** Stage an old `.tf` file, remove it from the next source inventory, and prove it cannot affect the subsequent plan. Cover state preservation on staging failure.

## Other inspected behavior

The source separates human credential creation from recurring secret copying, validates expiry, retains a private recovery journal, uses private subprocess capture, checks saved-plan/state/revision associations, and requests nonadmin AKS credentials.

The journal’s private-parent inheritance and Windows ACL verification are appropriate for the inspected path. Actual full credential-rotation and bootstrap behavior still require their assigned integration evidence. No additional confirmed security finding is asserted for those pending paths.

Reported test counts were not independently rerun. No probes, file changes or paid actions occurred.

### Source hashes

```text
azure-infrastructure.mjs
FA91D4843AF38C8466146457C6FB7766BCAEA20502F2E1BE073DD4C204484A6A
azure-terraform.mjs
270ED72C9AADAA26888A55047DB9759F7B2448267E72A6D1D899E76A8EBF9BFE
azure-provisioning.mjs
E22669100D4385D7B613346CF5F265ED96A901540A9A81A1A674BCBAC372A8BA
azure-operations.mjs
16CB729DB6144647599501CFD9DB07F2D5C41B3792C7FCD8846E9855D43352D5
azure-readiness.mjs
929648D7117680458E479E91445FD0460B82A6C3233ACB3390774DC59D8F691A
azure-infrastructure.test.mjs
AE1444462E97C7C5C83EF803F0337A3601FF2F0578E52A7481EDB6A747E1648B
azure-terraform.test.mjs
75CDB584E6C24F460823CC81985AB8DC7FCBC1204E05BAF1581105D88B3F75E5
azure-provisioning.test.mjs
50D089AAE3970E250D8772E4B9A62C909E7CE2DA105D97C5051CA0FD9B5C8F6C
```

# Separate targeted design preparation review

**Verdict: pass for the new handoff/qualification design delta.** This does not approve the current implementation or close SEC-SRC001/002.

Verified snapshots:

- `plan.md`: `427E99B4A924D272DB7B81180B2ADD1EAF216C62018953FBCDD77ECED9B41D22`
- `contracts/operations.md`: `C22A020A6DF9C83E5ECC90665C07697ED75BCD29FD8B0830B1C6B6CB16D4CB4C`
- `tasks.md`: `5231C3CC7814842A327CDAEE35640A3B681AC206324171585941C02C0CC65157`

The design provides coherent boundaries:

- Actual protected hosted backup/restore identities produce separate proofs.
- Exact writer permissions protect each proof container; apply reads proofs rather than authoring them.
- Challenges bind principal, cluster, CA, generation, reviewed probe/role definitions, nonce and bounded validity.
- Replay, wrong identity, expired proof and changed inputs block activation.
- Credential-free qualification precedes production recovery bindings, CSI clients and SQL stages.
- Ordinary application readiness and snapshot publication precede hosted probes, avoiding the readiness/input cycle.
- Reviewed optional recovery activation remains distinct from ordinary bootstrap.
- Durable private projections avoid foundation-state access and expired/same-run artifact dependencies.

Implementation review must verify proof-container RBAC, direct authoritative reads, single-use challenge consumption, actual principal validation and fixture cleanup before production activation. Proof expiry gates protected operations; it does not claim automatic revocation of already deployed RBAC.

No new exception or risk acceptance is recorded.
