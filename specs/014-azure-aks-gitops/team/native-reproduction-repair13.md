# Repair13 execution and temporary observations

All source was frozen at native-prerequisites-checkpoint13.json. Formatting and lint
passed before provider execution; lint ran alone and built with zero warnings/errors.
Source hashes were verified unchanged at the repair14 handoff. No cloud actions occurred.

## Uninstrumented reproduction

The same four-file concurrent command from native-reproduction-repair12.md exited 1:
3 passed, 1 failed, 0 skipped/cancelled, 243.596s. ACME 147.553s, admission 242.608s and
Loki 29.149s passed. Bundle 126.586s failed at prereq-clusterissuer-established:
kubectl exit 1, 518ms, providerCategory=unclassified. The preceding CRD apply succeeded.
This is not a 60s wait timeout and does not prove a transport or authorization fault.

## Temporary, source-unchanged observations

The coordinator used a Node data-URL preload only in diagnostic runs. It observed real
child stderr at the exact pinned kubectl CRD-wait/owned kind-create boundary without
changing source, process arguments, provider profile or stdout/stderr handling of the
original child. Raw text stayed in bounded memory and was discarded. Only fixed
signature booleans and exit status were exposed; no private log artifacts were created.
The preload ended with its process and is absent from ordinary gate commands.

| Observation | Pass/fail/skip | Duration | Assessed outcome |
| --- | --- | --- | --- |
| Exact bundle condition-wait observer |4/0/0|248.455s|Wait succeeded; failing window not observed. Diagnostic pass only.|
| One bounded repeat with additional fixed wait flags |2/2/0|135.009s|ACME/admission kind-create exited1 at104.753s/104.920s; bundle wait and bundle passed.|
| Pinned-source kind flags plus bundle condition-wait signature |3/1/0|227.882s|All three kind-create commands succeeded. Bundle CRD wait failed in581ms and matched the fixed null-condition accessor signature.|

In the last observation, stderrOverflow=false, singleLine=true and
nullConditionAccessor=true for the bundle wait. The predicate checked the fixed
`.status.conditions accessor error` prefix and `<nil>`/expected-slice suffix; raw
provider text was never emitted. The match supplies actual pinned-provider evidence
for the condition-field race. It does not identify the cause of earlier kind exits.

Kind flags in that successful-create observation were all false. Their meaning and
pinned source references are in kind-create-observer-proposal.md; false flags on a
successful create cannot exclude an earlier intermittent failure mechanism.

## Read-only environment checks

Podman rootless=false; host architecture=arm64 and the cached pinned node image is
also arm64/Linux. Inotify instance/watch limits are both 524288. These observations
do not support a low 128-instance limit or node-image emulation mismatch. They do not
exclude other resource pressure. No VM/kernel setting was changed. Cleanup checks
between observations found one preexisting container and zero owned fixture candidates.
Final observation cleanup is checked separately before another provider run.

## Repair boundary

Repair 14 targets only the confirmed brittle CRD wait: absent/null/unpopulated condition
state must remain not ready until actual Established=True, within the original 60s total
budget including request time. No failed mutation retry, TLS weakening, timeout inflation
or blanket serialization is authorized by this evidence. Earlier kind-create failures,
the full combined gate and the separate body-read risk remain open execution/work items.
An instrumented passing run is not gate acceptance or a causal fix.
