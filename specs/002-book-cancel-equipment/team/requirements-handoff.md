Specification ready for planning and independent review at `specs/002-book-cancel-equipment`.

Changed files:

- `spec.md`
- `checklists/requirements.md`
- `.specify/feature.json`

Recorded one human clarification: repeating cancellation of an already-Cancelled reservation succeeds after its original start without another event. No unresolved product questions remain.

Built-in checklist: **16/16 → 16/16**, no regressions. This is author validation, not independent approval.

Requirement mapping:

| Requirements | Acceptance evidence |
|---|---|
| FR-001–003 | US1.1–3; SC1–3, SC14, SC16 |
| FR-004 | US1.4; SC3 |
| FR-005–007 | US1.2,5–8; SC4–7 |
| FR-008–010 | US2.1–6; SC8–11 |
| FR-011–013 | US3.1–4; SC9, SC11–12 |
| FR-014 | US1.9, US3.2; SC13 |
| FR-015–016 | US1–3; SC14 |
| FR-017 | SC1, SC11 |
| FR-018 | SC15 |
| FR-019–020 | SC16–17 |
| FR-021 | SC18 |

Clarification coverage: functional scope, domain, interaction, security, edge cases, terminology and completion signals clear/resolved. Technical concurrency mechanism, retry settings and recovery deadlines deferred appropriately to planning.

Checks passed: exact-file formatting, prerequisite resolution, `npm run format-check`, `npm run lint` (zero warnings/errors). No application changes; application tests belong to coordinator baseline/implementation validation.

Frozen spec SHA-256: `e2822291af872664bc42c6a252e1c7e020216570b92b323b4bbe003b8b18cb96`.

Extension hooks absent. Prior skeleton manual accessibility finding Q-001 remains open; human feature acceptance remains required. Next: `$speckit-plan`.
