**Recommendation: request one separate, exact-resource exception.** The reproduced warning is a legitimate consequence of the approved destructive rehearsal.

| Field | Proposed scope |
|---|---|
| Rule | `azurerm_resources_missing_prevent_destroy` |
| Severity | TFLint warning |
| Resource | `azurerm_key_vault.workload` |
| Location | `infra/azure/environment/main.tf:231` |
| Rationale | A permanent `prevent_destroy` would block intentional workload-vault deletion and generation-based recreation. |

Deletion removes active secret availability and can cause downtime or failed recovery if compatible credentials are unavailable. Retain these conditions:

- Explicit reviewed, confirmed workload destruction.
- Fresh verified compatible backup and usable retained recovery key.
- Purge protection and ninety-day soft deletion.
- Generation-based vault names and tested secret restoration.

This exception must **not** cover the retained recovery vault, permit purge, waive backup verification, or disable the rule globally. The existing ACR exception does not authorize it.

The earlier “not reproduced” assessment is superseded by the coordinator’s actual pinned-tool reproduction. I inspected the unchanged vault block; `main.tf` remains SHA-256 `005DEC7F8969D0A0C1208BBA22EB48C8A94268BBC2377FAE9858A0CD7E9A1F92`.

**No approval recorded.** The finding remains blocking pending the owner’s explicit decision. No source changes or additional probes.
