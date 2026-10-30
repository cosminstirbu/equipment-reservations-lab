**Confirmed defect: native HTTPS exchanges are not bounded through response completion.**

Reviewed `scripts/azure-observability.test.mjs`, SHA256 `13CB976BA0CBC21433F6553FFA9B03071CD040CBC34A55241DB89797294DF942`.

At lines 406–426, the shared request routine uses `timeout: 3000`, resumes the response and resolves only on `end`. It handles request errors but not response `aborted`, `error` or premature `close`. It serves all three telemetry fixtures’ health checks and missing/wrong/valid-auth requests.

The timeout measures socket inactivity, not total exchange duration. A server sending headers and periodic body bytes without ending can keep the promise pending indefinitely. The health loop’s 60-second check cannot run while awaiting it, delaying owned-resource cleanup. A truncated response can also produce an unhandled response error or leave the promise unsettled.

The diagnostic helper runs after failure settlement; it cannot correct this lifecycle defect. This is **not evidence that it caused the observed prerequisite failure**.

The smallest causal repair proposal is to retain the existing three-second budget and TLS verification, adding:

- An absolute timer covering connection through body completion.
- Response error/abort/premature-close handling.
- One idempotent settlement path that clears timers, destroys owned transport and emits fixed safe errors.
- Unchanged successful status results and authentication assertions.

Test first through a real local HTTPS endpoint with an explicitly trusted fixture CA:

1. Headers plus continuously dribbled, nonending body must hit the absolute deadline.
2. Truncated body must reject promptly without uncaught errors.
3. Complete responses retain expected status codes.
4. Failure still permits subsequent cleanup; serialized diagnostics contain no token, URL or body.

Use an independent bounded test watchdog so intended-red cases cannot hang the suite. No cluster, timeout inflation, retry, scheduling change or security exception is needed.

No files changed, tests executed or provider/cloud actions performed. Implementation authorization and independent revalidation remain separate.
