# Feature 0 validation evidence

Environment: macOS arm64; .NET SDK 10.0.301; Node 24.15.0/npm 11.12.1; Aspire CLI/packages 13.6.1; Podman 6.0.2; RabbitMQ 4.3.6. All checks executed by coordinator/coder, not reviewer self-approval. Native Edge control failed with a closed computer-use pipe; isolated headless Edge 155 was used for actual browser checks.

## Test-first evidence

- Empty API endpoints: Inventory/operational tests initially failed with 404; expanded backend tests reported 11 failed/one passed before behavior. Implemented slices then passed 12 tests.
- Angular rendered tests: five intended failures before behavior; subsequent timer/compilation fixes verified by final six passing tests.
- Real broker no-op topology: broker rejected publication with exchange `hello` NOT_FOUND. Implemented declaration then exposed RabbitMQ 4.3's non-durable/nonexclusive queue incompatibility (ENV-001), repaired through supported durable metadata and transient messages.
- Deadline/readiness regression: configured unreachable dependencies incorrectly returned healthy; stalled publisher waited 8 seconds rather than 3. Both failed first; fixes yielded all 16 backend tests passing.
- Actual browser regression: first keyboard send completed; disabling/re-enabling Send hello lost focus before the second send. Focus restoration was added without stealing focus from another control/window; all three browser tests then passed.

## Completed checks

| Command/check | Result |
| --- | --- |
| `dotnet build -m:1` | Exit 0, zero warnings/errors (before final test-only formatting). Final suite also compiles projects. |
| `npm --prefix src/Web test` | Exit 0, six passed after final focus fix. |
| `npm --prefix src/Web run build` | Exit 0, strict production build after final focus fix. |
| `dotnet test tests/Smoke.Tests` | Full real hello test passed; exact broker exception assertion subsequently repaired. |
| `dotnet test tests/Smoke.Tests --filter FullyQualifiedName~BrokerContractTests -m:1` | Exit 0, real mandatory confirms, unroutable rejection, 1,000 capacity/overflow, no-requeue rejection and 30-second TTL. |
| `API_WEB_URL=http://127.0.0.1:53407 BROWSER_EXECUTABLE='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' npm --prefix src/Web run test:browser` | Exit 0, three passed. Real Inventory/HTTP/broker/notification journey uses Tab, Enter and Space with two distinct IDs; intercepted HTTP is used only in separately labeled UI-state tests. Actual browser axe includes contrast, unlike jsdom. |
| `npm --prefix src/Web audit --json` / final browser dependency install | Exit 0, zero advisories. |
| `dotnet list EquipmentReservation.slnx package --vulnerable --include-transitive` | Exit 0, no known vulnerable packages in all eight projects. |
| Documented `dotnet run --project src/AppHost --no-build` | Started successfully after explicit loopback HTTP profile configuration; Web resource healthy. |

## Actual telemetry and failures

`aspire otel traces/logs --apphost src/AppHost` shows successful trace `64fdf132469c917196ed7b7a2926ec00`: Reservations POST → Inventory HTTP client/server → hello.publish producer → hello.consume consumer. Producer span `6389884b2376140c` is the parent of consumer `af440f44bccab17c`; notification log carries the same trace and correlation ID `29bcf361-766a-4d7d-9887-e1f32b562502`. No request body or credentials appeared in the inspected trace/log samples. Do not commit raw resource exports, since resource environment contains generated secrets.

With Inventory stopped through `aspire resource inventory stop`, actual POST returned safe Problem Details 503 in ~3.025 seconds; trace `cbb6cda6aec24843d6ba3b223aad12b9` contains errored POST and cancelled Inventory HTTP call (~3.001 seconds). Inventory was restarted afterward. Outcome metric dimensions are checked by backend MeterListener test; production instrumentation includes OTEL HTTP/runtime metrics and hello outcome/duration instruments.

## Local exposure

`podman ps` showed broker mapping `127.0.0.1:<ephemeral>->5672/tcp`; no management mapping or volumes. `lsof -nP -iTCP -sTCP:LISTEN` showed application API processes, node SPA, Aspire dashboard/resource/OTLP and DCP listeners all on 127.0.0.1. Unrelated preexisting workstation listeners are outside feature scope. Dashboard token protection remains enabled; local HTTP is explicit and documented.

## Pending final gates

Final `dotnet test EquipmentReservation.slnx -m:1` exited 0 on I1: 16 backend tests passed and two real broker/smoke tests passed, zero skips, project compilation with zero warnings/errors. Final Angular build, six rendered tests and three actual browser tests also passed on I1. Security review passed; quality found no blocking code defect but retains Q-001 for required manual review. Convergence appended T021 for this remaining validation gap; no application code gap was found.

I1 source/config/test/readme SHA-256: `a2d445727aecb5d9e6016dc3eb064bcd9150cc94a426f5c4a4bb1746a95d4895`. Generated outputs and feature team records are excluded from the hash.

Native manual keyboard review was unavailable: Edge computer-use pipe closed and the in-app browser surface was unavailable. Isolated browser keyboard tests plus reviewer code inspection are recorded distinctly, not substituted for mandatory manual review. Human feature acceptance remains pending under the constitution. Overall outcome: needs_intervention for Q-001 and explicit final acceptance.
