# Data model: Spectral validation

No persistent entity or migration is introduced.

| Concept | Fields and constraints | Relationship |
| --- | --- | --- |
| Service document | Service identity: Inventory, Reservations or Notifications; raw runtime-generated OpenAPI 3.1 JSON; local fragment references only | One independent validator invocation |
| Finding | Rule code, numeric severity, message, JSON path and optional source range | Belongs to one service document |
| Validation outcome | Success only with no warning/error and successful tool execution; malformed input/tool failure is unsuccessful | Propagated through C# assertion and command exit |
| Rule baseline | Installed pinned recommended OpenAPI rules; no custom rules or selected overrides | Shared immutable configuration across invocations |

Input flows from a current HTTP response through stdin to Spectral. Findings return as process diagnostics; no input document is stored, exported or logged in full. Per-invocation state is disposed at exit; timeout/cancellation terminates the child process tree. No business-domain state transition changes.
