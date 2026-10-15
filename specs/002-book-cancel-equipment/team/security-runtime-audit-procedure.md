T042 should run against the final frozen AppHost revision and record only sanitized results.

1. **Inspect actual exposure.**

   ```sh
   lsof -nP -iTCP -sTCP:LISTEN
   podman ps --format '{{.ID}} {{.Names}} {{.Ports}}'
   podman port <identified-postgres-container>
   podman port <identified-rabbitmq-container>
   ```

   Match application, dashboard, OTLP, resource-service and infrastructure ports to AppHost. Require loopback binds; investigate `*`, `0.0.0.0` or `::`. Avoid full `podman inspect`, environment dumps and process command lines because they can expose credentials.

2. **Verify the running service credentials.**

   Have the coordinator use an Npgsql audit harness that loads each actual API connection privately from the final resource snapshot. Print only service/database/role names and pass/fail results. Verify own-database access; query role flags and memberships; attempt connections to the other databases and `postgres`/`template1`, requiring SQLSTATE `42501`. Verify APIs have no administrator connection or standalone password settings. Do not place connection strings in command arguments or print failed connection exceptions.

   Existing provisioning tests support this evidence but do not replace checking the actual running configuration.

3. **Scan candidate tracked files safely.**

   Scan tracked and intended new source/configuration files for password assignments, connection strings, private-key markers and tokens. Report filenames/line numbers and reviewed dispositions only; never matching values. Compare live secret values privately against candidate file contents and report match counts. Exclude build outputs from candidate scope; inspect README examples for literal credentials.

4. **Audit dependencies.**

   ```sh
   dotnet list EquipmentReservation.slnx package --vulnerable --include-transitive
   npm audit
   npm --prefix src/Web audit
   ```

   Record exit status, advisory counts, dependency scope and revision. Restore the frozen lockfiles first if necessary; unavailable advisory feeds remain pending.

5. **Inspect exported telemetry privately.**

   The preflight ZIP contains `resourceLogs`, `resourceSpans`, console logs and **credential-bearing resource JSON**. Process it in memory; do not dump or commit the archive.

   Extract secret values privately from resource metadata, then search telemetry strings for exact secret matches, connection-string fragments, request-body fields, raw provider diagnostics and unapproved personal data. Report counts and sanitized attribute paths only. Verify booking/cancellation/conflict and controlled dependency failures have correlated logs/spans, including publication→consumption propagation.

   **The inspected ZIP has no metric export.** Obtain final runtime metric evidence separately. Inspect application metric dimensions against their bounded allowlists; reject user/equipment/reservation/event IDs, raw URLs and arbitrary exception/header values. Automated MeterListener tests supplement this check.

Prerequisites: final AppHost running, Podman access, package advisory access, private resource-snapshot access and metric capture. SEC-001 additionally requires actual browser/proxy evidence. No runtime audit or approval performed here.
