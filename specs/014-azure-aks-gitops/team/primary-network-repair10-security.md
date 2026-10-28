**PASS — SEC-CACHE001 closed on repair10’s frozen snapshot.**

Matched report SHA256 `52BB24BC3E732A56657B3F41F72F3044E0ECB486E2AFEE14A2D39C2EDD010C67` and all five source hashes:

| File | SHA256 |
|---|---|
| azure-infrastructure.mjs | `CA3848618B3D3EB486D4AC33E41C2DC334188A3C63C3DF10C0DA48DAE973A587` |
| azure-infrastructure.test.mjs | `E7FA0A0864B824DB0E25E99AF950C80F6844188246F24AD722F5F64BA890FA0A` |
| azure-guard-test-fixture.mjs | `A2C3FCB4E603125B3FA46D58BA61576BCAD428B814BB85299C955729B8EBF9C8` |
| azure-handoff.test.mjs | `ED3E0EAEC0F814F48E4BA7EB1C56CF613B80A99B1E03E1092EF193300FCFF267` |
| azure-guard-activation.test.mjs | `28096F9997812A39A96DC44DBA81E878CB898948D9A60B28C84BE4350FDCADD9` |

Both network descriptors now require exactly the ordered four-action array emitted by Terraform, including Resources tag actions. Their hashes are recomputed from the producer’s canonical `{actions,dataActions:[]}` semantics. Arbitrary KeyVault-prefixed actions and merely well-shaped hashes no longer pass.

Positive fixtures now use actual producer-shaped semantics. Negative cases cover extra/missing/delete/duplicate/reordered/malformed actions, extra fields and changed hashes, including recomputed hashes for altered semantics.

Independently ran the focused public guard-output schema test: **1 passed, zero failures/skips**, exit 0. Author reports 52 focused and six launcher tests passed; I did not rerun those complete groups.

Closure is limited to SEC-CACHE001. Inspection/cache context constraints remain intact, but G3, staging, same-lease positive composition, native failures and live acceptance remain pending. Q-GUARD014-001/SEC-GUARD001 is not closed here.

No files changed or provider/cloud actions performed. No full-feature approval.
