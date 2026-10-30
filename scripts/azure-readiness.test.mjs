import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout, clearTimeout } from 'node:timers';
import { createServer } from 'node:http';

test('private diagnostic forwards parse actual kubectl process output and close every child', async () => {
  const { withDiagnosticForwards } = await import('./azure-readiness.mjs');
  const directory = mkdtempSync(join(tmpdir(), 'azure-forward-'));
  const fixture = join(directory, 'kubectl.mjs');
  writeFileSync(
    fixture,
    `import net from 'node:net';
const ports=process.argv.filter(x=>/^0:\\d+$/.test(x)).map(x=>x.slice(2));
const servers=ports.map(remote=>{const server=net.createServer(s=>s.end());server.listen(0,'127.0.0.1',()=>console.log('Forwarding from 127.0.0.1:'+server.address().port+' -> '+remote));return server;});
process.on('SIGTERM',()=>{for(const server of servers)server.close();process.exit(0);});`,
  );
  let signal;
  try {
    const result = await withDiagnosticForwards(
      {
        kubeconfig: join(directory, 'private-config'),
        command: process.execPath,
        prefix: [fixture],
      },
      async (context) => {
        signal = context.signal;
        assert.match(context.dashboardOrigin, /^http:\/\/127\.0\.0\.1:\d+$/);
        assert.match(context.otlpOrigin, /^https:\/\/127\.0\.0\.1:\d+$/);
        assert.match(context.prometheusOrigin, /^https:\/\/127\.0\.0\.1:\d+$/);
        assert.equal(signal.aborted, false);
        return 'verified';
      },
    );
    assert.equal(result, 'verified');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('forward failures suppress private process output and never execute readiness', async () => {
  const { withDiagnosticForwards } = await import('./azure-readiness.mjs');
  let called = false;
  await assert.rejects(
    withDiagnosticForwards(
      {
        kubeconfig: 'private',
        command: process.execPath,
        prefix: [
          '-e',
          "console.error('PRIVATE-OUTPUT-MARKER');process.exit(17)",
          '--',
        ],
      },
      async () => {
        called = true;
      },
    ),
    (error) => {
      assert.doesNotMatch(error.message, /PRIVATE-OUTPUT-MARKER/);
      return true;
    },
  );
  assert.equal(called, false);
});

test('cancelling a pending forward terminates its process before the startup deadline', async () => {
  const { withDiagnosticForwards } = await import('./azure-readiness.mjs');
  const controller = new globalThis.AbortController();
  const started = performance.now();
  const timer = setTimeout(() => controller.abort(), 150);
  try {
    await assert.rejects(
      withDiagnosticForwards(
        {
          kubeconfig: 'private',
          command: process.execPath,
          prefix: ['-e', 'setInterval(()=>{},1000)', '--'],
          signal: controller.signal,
          startTimeoutMs: 2000,
        },
        async () => assert.fail('unexpected readiness'),
      ),
    );
    assert.ok(performance.now() - started < 1500);
  } finally {
    clearTimeout(timer);
  }
});

test('readiness fails before cluster calls when private credentials or persistence checkpoint are absent', async () => {
  const { verifyAzureReadiness } = await import('./azure-readiness.mjs');
  await assert.rejects(
    verifyAzureReadiness({
      stateDirectory: 'absent-private-state',
      kubeconfig: 'private',
      operation: 'start',
    }),
    /readiness/i,
  );
});

test('native history uses authenticated vendor APIs and correlates the actual lifecycle trace map', async () => {
  const { verifyNativeHistory } = await import('./azure-readiness.mjs');
  const traceId = '1234567890abcdef1234567890abcdef';
  let leak = false;
  const calls = [];
  const server = createServer((request, response) => {
    calls.push(request.url);
    assert.equal(
      request.headers.authorization,
      'Bearer private-api-credential',
    );
    assert.equal(request.headers.accept, 'application/json');
    response.setHeader('content-type', 'application/json');
    if (request.url.startsWith('/api/v1/query?'))
      response.end(
        JSON.stringify({
          status: 'success',
          data: {
            resultType: 'vector',
            result: [
              { metric: { service_name: 'reservations' }, value: [1, '1'] },
            ],
          },
        }),
      );
    else if (request.url.startsWith('/loki/api/v1/query_range?'))
      response.end(
        JSON.stringify({
          status: 'success',
          data: {
            resultType: 'streams',
            result: [
              {
                stream: { service_name: 'reservations' },
                values: [['1', leak ? 'private-api-credential' : traceId]],
              },
            ],
          },
        }),
      );
    else if (request.url === `/api/traces/${traceId}`)
      response.end(
        JSON.stringify({
          batches: [{ resource: { attributes: [] }, scopeSpans: [] }],
        }),
      );
    else {
      response.statusCode = 404;
      response.end('{}');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const options = {
    prometheusOrigin: origin,
    lokiOrigin: origin,
    tempoOrigin: origin,
    credentials: {
      prometheusApi: 'private-api-credential',
      lokiApi: 'private-api-credential',
      tempoApi: 'private-api-credential',
    },
  };
  try {
    await verifyNativeHistory(options, { book: traceId }, { timeoutMs: 1 });
    assert.equal(calls.length, 3);
    leak = true;
    await assert.rejects(
      verifyNativeHistory(options, { book: traceId }, { timeoutMs: 1 }),
      (error) => {
        assert.doesNotMatch(error.message, /private-api-credential/);
        return true;
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
