# Data Model: Database Operation Tracing

No persistence schema or HTTP/message contract changes.

## Source policy

Fields: fixed logical database/source name; purpose (runtime, administrative provisioning, service migration); capture-SQL setting; immutable reviewed descriptor catalog. Logical databases use the current finite set or a fixed unknown fallback, never arbitrary connection-derived values.

Administrative purpose overrides every SQL admission rule. Unknown statements keep operation spans but omit text. Embedded migrations require exact reviewed resource/content admission, not automatic reflection-based trust.

## Operation descriptor

Fields: bounded static operation identity/name; optional exact reviewed statement template; internal source/descriptor state in non-exported Activity custom properties. Prefer shared SQL constants. A safe label does not authorize unrelated command text. No parameters/results are stored in the descriptor.

## Exported span

Fields: native `Npgsql` Client activity, trace/span/parent IDs, actual duration/status, fixed database/operation metadata, optional reviewed `db.query.text`, validated SQLSTATE or bounded client error category, sanitized exception event. Connection failure describes connection work rather than claiming SQL executed.

Lifecycle: native activity starts → metadata callback → exception recorder sanitizes before event creation if needed → activity ends → privacy processor normalizes → exporter snapshots. Host shutdown flushes pending export.

## Evidence

Record path, test/scenario, candidate revision, expected operations/parents, outcome, representative runtime trace identifier and privacy result. Never record secrets. Reviewers/coordinator retain ownership of verdicts and acceptance state.
