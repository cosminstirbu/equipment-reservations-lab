# T004/T005 current quality-gate audit

Date: 2026-10-26. Evidence-only author audit; no task/checklist/reviewer verdict changes. This session owns all current feature WIP per coordinator clarification; existing newer qualification/activation files were preserved without assuming independent review. Only this evidence file was written.

## Scope, method and actual current result

T004 requires failing public CLI/actual-tool fixtures for format/configuration/Azure lint/security, immutable policy selection, missing scanner/policy and private-error containment before T005. T005 requires the same local/CI formatting, backend-free per-root init/validate, Azure TFLint and offline pinned Trivy gates plus explicit formatting; every unapproved enabled finding/scanner error blocks.

Reused constitution and engineering formatting/testing/tooling/resilience/observability rules. Existing tests retain actual Node children and checksum-verified local native tools; no subprocess mocks, cloud/app runtime or paid actions. Source and authenticated/unclassified native diagnostics remain privately captured, projected through fixed safe failure metadata; test markers assert selected public stdout/stderr containment. Native calls have finite bounds (CLI child test120s; tool300s/16MiB), no retries. Temporary fixture teardown is the existing test's own exact temporary directory. This audit did not change that teardown or claim new cleanup-fault coverage.

Read-only cached prerequisite check called actual qualityContext/verifiedTool/verifyPolicy: all four tools and policy verified. No prepare/download was run. Current runtime Node24.15.0 Windows ARM64 uses the implementation's Windows x64 tool selection. Command `node --test scripts/azure-quality.test.mjs`: exit0,13/13PASS,0failed/canceled/skipped,14.477s. Actual Terraform validation/native mock test, Azure TFLint and offline Trivy fixtures executed. No whole repository gate or real Terraform root scan/init was duplicated.

## T004 case mapping and historical RED limits

| Required negative | Current public/actual case | Actual assertion and remaining limit | Retained historical RED |
| --- | --- | --- | --- |
| Invalid format | public format check rejects bad layout; explicit formatter repairs it | Actual fmt-check nonzero, explicit format zero, then fmt-check zero | implementation-evidence.md records initial missing CLI entry, not a per-case actual-tool behavior RED |
| Invalid configuration | actual Terraform validation rejects invalid configuration without disclosing source | Actual backend-free init/validate child nonzero; fixed Terraform validation diagnostic; private source marker absent | Same initial missing-entry record; no separate preimplementation native behavior RED located |
| Azure lint | actual pinned Azure rules reject unsupported Azure VM size | Actual Azure rules plugin failure and TFLint diagnostic; invalid-size marker absent | Initial missing-entry record; earlier actual rule identity recorded in implementation-evidence.md |
| Azure security | actual offline immutable policies block insecure Azure storage | Actual pinned Trivy scan fails with Security findings; resource marker absent | Initial missing-entry record; toolchain-preflight.md separately records real insecure fixture exit7 during native policy probe |
| Missing scanner/tools | missing tools and policy cache fail closed with safe diagnostics | Separate missing-tools directory; nonzero/prerequisite message. Does not enumerate every missing binary independently | Initial missing-entry record only |
| Missing policy | same case, missing-policy directory | Real tool exists, missing policy causes nonzero/policy message | Initial missing-entry record only |
| Immutable policy selection/substitution | policy content substitution cannot change enabled checks | Supplied source directory has no valid policy metadata, so refusal is established; this does NOT independently exercise valid metadata plus altered content | No separate meaningful metadata-valid content-tamper RED located |
| Scanner error | security scanner parse errors block even without security findings | Actual malformed HCL fails and marker absent. Test does not assert precise scanner-error category, so source inspection supplements cause classification | implementation-evidence.md explicitly records actual Trivy exit0 parse-error regression failing before stderr-error rejection repair |
| Inline bypass | inline suppression cannot bypass required security findings | Actual public invocation nonzero/fixed suppression diagnostic | implementation-evidence.md explicitly records failing suppression regression before detection |
| Private error leakage | validation/lint/security/parse/native contract cases | Synthetic source markers absent from public stdout+stderr; selected paths only, not every arbitrary native failure | As above; no independent raw-error serialization RED for all branches located |

Additional current cases: three pure exact rule/root/resource exception-policy tests; real Terraform native-contract positive then invalid-HCL private failure; kind Windows/Linux pin/corrupt-file verification. These supplement rather than replace required actual Terraform/TFLint/Trivy cases. Initial missing-module/CLI-entry failures must not be relabeled as actual native behavior RED. No rollback or fabricated RED was attempted. Historical records are preserved, not amended by this audit.

## T005 implementation and local/CI equivalence

`package.json` maps infra:check to `node scripts/azure-quality.mjs check`, infra:format to explicit format, infra:tools to prepare and infra:test to native Terraform contracts. Default check iterates both exact roots foundation/environment and phases fmt-check,validate,lint,security. Terraform fmt uses -check/-recursive; validate uses init -backend=false/-input=false/-no-color and readonly lock when present, then validates JSON valid/error_count/warning_count. It does not plan/apply or configure backend state. Explicit format alone omits -check.

TFLint config enables recommended Terraform plugin and exact Azure rules0.33.0. Executable and plugin hashes are checked before execution; supplied config/plugin directory are fixed. Scanner exit/errors/invalid JSON block, findings pass only exact reviewed rule/root/resource exception filtering. No broad resource exception was added.

Trivy config enables terraform/plan-json/plan-snapshot, every severity UNKNOWN through CRITICAL,5m timeout. Scan uses exact immutable repository, skip-check-update, skip-version-check, disable-telemetry, fixed config/verified cache, empty ignorefile, private JSON and explicit stderr error/parse-error rejection. Policy metadata digest and recursively hashed content are verified before AND after scan. Inline trivy/tfsec/checkov suppressions and source symlinks are rejected. Enabled non-PASS findings block except explicit exact approved manifest entries; this is NOT a claim of no approved exceptions. Ambient TRIVY_/TF_/TFLINT_ environment is stripped, Terraform CLI config is controlled; no silent fallback if prerequisites/checksums/policy fail.

The source job in azure-infrastructure.yaml and infrastructure/full lanes in pull-request.yaml/validate.yaml invoke the SAME npm infra:tools/infra:check/infra:test commands with pinned Node24.15.0. Their actions are immutable SHA pins. This establishes source command/config equivalence, NOT observed Linux execution, identical OS semantics, hosted credentials or actual workflow success. The dedicated azure-infrastructure workflow's explicit operational test selection omits azure-quality.test.mjs; PR/main wildcard Node tests cover it, and package test:azure includes it. The source job still executes actual infra:check; adding explicit negative quality contracts there is a concrete CI coverage recommendation, not a source fix performed here.

Current pins: Terraform1.17.0; TFLint0.65.0; Azure rules0.33.0; Trivy0.76.1; Terraform providers AzureRM5.11.0/AzureAD3.10.0. Exact Windows/Linux archive+binary hashes remain in tools.lock.json. Policy repository mirror.gcr.io/aquasec/trivy-checks@sha256:b591e9190cff4aa4e385b1a25bccfd9ecf178d3c77fd194e1410b7ce7e1df058; content SHA256cf70b30a7e9b44e61c39e8d903e483bfb84595fe73fd12e689c3d6526c86a1cc. Local verified hashes matched this immutable selection; no internet/latest-version assertion is needed or claimed.

## Exact observed source snapshot

First and final observed hashes match for the first eight rows. Remaining context rows were captured at final inspection. Other WIP was not frozen by this author; these hashes bound this audit only.

| Path | SHA256 |
| --- | --- |
| scripts/azure-quality.mjs | 5F7862862FD5F4183F4C63B3D7F2B179D1A0AA126B30BFE270E4487F5B90AAA4 |
| scripts/azure-quality.test.mjs | 3C131F2569E1A4C31990C2954F255A4A02E9E5ABE28845A03FC33DDE25D455F7 |
| infra/azure/tools.lock.json | 03AFE39B3208694DE7AF6A35912F151B61D9C211968380BFCC1963341AE3DFA0 |
| infra/azure/.tflint.hcl | C6757C19BD842F059A70767D44C698A40E0605C238F569492FCDD026CB2573B4 |
| infra/azure/trivy.yaml | 48F531E85B1584EF31A04075258280BE0823A85A8E654C6456E955AD66BE0EBD |
| infra/azure/policy-exceptions.json | BB683CDC4E5FC63DCE38F25C9419F0EA35C7FE64E0D97218BA95DF896DD12702 |
| package.json | 59CAF0FD9EF62B480EF63E8195C71F26F077E31C6B48DBF23547F5A1A08669BF |
| .github/workflows/azure-infrastructure.yaml | 3CDBBFBD4A2BCF70B473570C1CA173B3AD9F6B0CC666CD89273029576BA4D850 |
| .github/workflows/pull-request.yaml | D8FC3770CA174397B3E193751D413FF632A4165CB7142E52C5191EE82DEFF8C6 |
| .github/workflows/validate.yaml | 9780714017BBA466B6C045D4E1E195737185B52BE9A5C9151519012144600B7A |
| scripts/process.mjs | 81937C04AE33585090BAE04997E79061B46FBA2F7677F62EB1E779A428455EB8 |

## Precise closure recommendation

Do not self-close T004/T005 from this audit. Request original quality/security assessment of the current13case native qualification, source equivalence and historical test-first evidence. T004's initial actual-tool-before-implementation chronology is incompletely evidenced; only the later parse-error/inline-bypass actual REDs are explicit. A reviewer/owner must assess that preserved chronology rather than inventing it. Add valid-metadata altered-content and independent digest-mismatch public regressions in a separately assigned source batch if required; inspect scanner-error diagnostics and specific corrupt/missing tool coverage without claiming existing tests cover them. T005 implementation shape is present and current negative fixtures pass, but current complete real-root check and actual Linux hosted gate evidence were not run here. Historical clean fixture/root records are not substituted for current revision-wide qualification. Full feature acceptance/provider/cloud work remains separate.

Evidence frozen at handoff. No source/test/checklist/shared metadata or reviewer report changes, no fullrepo checks and no external publication.
