# Vault guard global qualification

2026-10-26 author check: the elevated full lint gate for the workflow batch reported two no-undef diagnostics at the existing structuredClone calls in scripts/azure-vault-guard.mjs. The source was separately fingerprinted before the correction: BC037CA990F3D9E56A9D04D3F4B72D7FD542986E329E0FE2512A5C8717BB12BE.

Both calls now use globalThis.structuredClone. This preserves runtime behavior and makes the existing global explicit under the repository ESLint configuration. No behavior change or new test is required for this mechanical qualification. Exact-file formatting and readability inspection passed. Existing node --test scripts/azure-vault-guard.test.mjs passed 15/15, with no failures, skips or cancellations. These tests exercise local ARM boundary fixtures; they establish no live Azure guard enforcement.

Corrected source SHA256: 4AA49442E297C6B88CDB9327FB637D0B901B3BFDCFE37AD60077934E66A964C8. The full lint rerun and independent source reviews are recorded separately. No policy, permission or provider call was changed by this correction.
