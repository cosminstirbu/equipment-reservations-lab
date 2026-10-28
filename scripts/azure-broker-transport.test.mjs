// Design: actual child/socket/HTTP fixtures exercise the fixed production adapter.
// Native kubectl local failure is checked; live AKS/SPDY and RBAC remain acceptance work.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createPrivateDirectory } from './local-platform.mjs';
const password = 'PRIVATE_MONITOR_PASSWORD_AT_LEAST_32_BYTES';
async function fixture(mode, action) {
  const directory = mkdtempSync(resolve('.cache', 'broker-transport-'));
  assert.ok(
    directory.startsWith(resolve('.cache') + '/') ||
      directory.startsWith(resolve('.cache') + '\\'),
  );
  createPrivateDirectory(directory);
  const kubeconfig = join(directory, 'kubeconfig');
  writeFileSync(kubeconfig, 'private-fixture', { mode: 0o600 });
  const script = join(directory, 'kubectl.mjs');
  const record = join(directory, 'record.json');
  writeFileSync(
    script,
    `import http from 'node:http';import fs from 'node:fs';let requests=0;const mode=${JSON.stringify(mode)};const record=${JSON.stringify(record)};const expected='Basic '+Buffer.from('equipment_backup_monitor:${password}').toString('base64');const server=http.createServer((req,res)=>{requests++;fs.writeFileSync(record,JSON.stringify({...JSON.parse(fs.readFileSync(record,'utf8')),requests}));if(req.method!=='GET'||req.url!=='/api/queues/equipment/reservation-notifications'||req.headers.authorization!==expected){res.writeHead(401).end('PRIVATE_AUTH_RESPONSE');return;}if(mode==='hang')return;if(mode==='flood'){process.stdout.write('PRIVATE_OUTPUT_LIMIT_MARKER'.repeat(4096));return;}if(mode==='redirect'){res.writeHead(302,{Location:'/PRIVATE_REDIRECT_MARKER'}).end();return;}if(mode==='denied'){res.writeHead(401).end('PRIVATE_RESPONSE_MARKER');return;}res.setHeader('Date',new Date(Date.now()-(mode==='stale'?60000:0)).toUTCString());res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name:'reservation-notifications',vhost:'equipment',state:'running',type:mode==='quorum'?'quorum':'classic',messages:mode==='pending'?1:0,messages_ready:mode==='invalid'?undefined:mode==='pending'?1:0,messages_unacknowledged:0}));});server.listen(0,'127.0.0.1',()=>{fs.writeFileSync(record,JSON.stringify({args:process.argv.slice(2),port:server.address().port,pid:process.pid}));console.error('PRIVATE_CHILD_MARKER');if(mode!=='quiet')console.log('Forwarding from 127.0.0.1:'+server.address().port+' -> 8080');});process.on('SIGTERM',()=>server.close(()=>process.exit(0)));`,
  );
  const dependencies = {
    spawnProcess: (command, args, options) =>
      spawn(process.execPath, [script, ...args], options),
  };
  try {
    return await action({ kubeconfig, dependencies, record });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('drain uses fixed real child and authenticated HTTP then closes its owned listener', async () => {
  const { drainRecoveryMessaging } = await import('./azure-broker.mjs');
  await fixture('zero', async ({ kubeconfig, dependencies, record }) => {
    const result = await drainRecoveryMessaging(
      {
        kubeconfig,
        brokerMonitorPassword: password,
        database: {
          outboxCount: async () => ({
            count: 0,
            observedAt: new Date().toISOString(),
          }),
        },
        timeoutMs: 5000,
      },
      dependencies,
    );
    assert.equal(result.outcome, 'drained');
    const actual = JSON.parse(readFileSync(record, 'utf8'));
    assert.deepEqual(actual.args, [
      '--kubeconfig',
      kubeconfig,
      '--namespace',
      'equipment-recovery',
      'port-forward',
      'pod/equipment-broker-monitor',
      '--address',
      '127.0.0.1',
      '0:8080',
    ]);
    assert.doesNotMatch(JSON.stringify(actual.args), /PRIVATE_MONITOR/);
    await assert.rejects(() =>
      globalThis.fetch(`http://127.0.0.1:${actual.port}`, {
        signal: globalThis.AbortSignal.timeout(500),
      }),
    );
  });
});

test('queue observation follows the fresh outbox zero and cannot pair pre-publication cached zero', async () => {
  const { drainRecoveryMessaging } = await import('./azure-broker.mjs');
  await fixture('pending', async ({ kubeconfig, dependencies, record }) => {
    let queried = false;
    await assert.rejects(
      () =>
        drainRecoveryMessaging(
          {
            kubeconfig,
            brokerMonitorPassword: password,
            timeoutMs: 3000,
            database: {
              outboxCount: async () => {
                await new Promise((resolve) =>
                  globalThis.setTimeout(resolve, 100),
                );
                if (!queried)
                  assert.equal(
                    JSON.parse(readFileSync(record, 'utf8')).requests ?? 0,
                    0,
                    'queue must not be sampled before the outbox-zero read completes',
                  );
                queried = true;
                return { count: 0, observedAt: new Date().toISOString() };
              },
            },
          },
          dependencies,
        ),
      (error) => error.details?.category === 'timeout',
    );
    assert.equal(queried, true);
  });
});

test('missing, denied and stale broker observations fail privately and clean up the actual child', async () => {
  const { drainRecoveryMessaging } = await import('./azure-broker.mjs');
  for (const mode of ['invalid', 'denied', 'stale', 'redirect', 'quorum'])
    await fixture(mode, async ({ kubeconfig, dependencies, record }) => {
      await assert.rejects(
        () =>
          drainRecoveryMessaging(
            {
              kubeconfig,
              brokerMonitorPassword: password,
              database: {
                outboxCount: async () => ({
                  count: 0,
                  observedAt: new Date().toISOString(),
                }),
              },
              timeoutMs: 5000,
            },
            dependencies,
          ),
        (error) =>
          !/PRIVATE_|Basic/.test(error.message + JSON.stringify(error)) &&
          error.details?.operation === 'Messaging drain queue observation' &&
          error.details?.tool === 'http' &&
          Number.isInteger(error.details?.durationMs) &&
          (mode !== 'denied' || error.details?.status === 401),
      );
      const actual = JSON.parse(readFileSync(record, 'utf8'));
      if (mode === 'redirect') assert.equal(actual.requests, 1);
      await assert.rejects(() =>
        globalThis.fetch(`http://127.0.0.1:${actual.port}`, {
          signal: globalThis.AbortSignal.timeout(500),
        }),
      );
    });
});

test('nonzero or stale outbox and external cancellation cannot report a drained point', async () => {
  const { drainRecoveryMessaging } = await import('./azure-broker.mjs');
  await fixture('pending', async ({ kubeconfig, dependencies }) => {
    let observed = 0;
    await assert.rejects(
      () =>
        drainRecoveryMessaging(
          {
            kubeconfig,
            brokerMonitorPassword: password,
            database: {
              outboxCount: async () => {
                observed++;
                return { count: 0, observedAt: new Date().toISOString() };
              },
            },
            timeoutMs: 2500,
          },
          dependencies,
        ),
      /drain|time/i,
    );
    assert.ok(observed > 0);
  });
  await fixture('zero', async ({ kubeconfig, dependencies }) => {
    await assert.rejects(
      () =>
        drainRecoveryMessaging(
          {
            kubeconfig,
            brokerMonitorPassword: password,
            database: {
              outboxCount: async () => ({
                count: 0,
                observedAt: new Date(Date.now() - 60000).toISOString(),
              }),
            },
            timeoutMs: 5000,
          },
          dependencies,
        ),
      /drain|fresh|observation/i,
    );
  });
  await fixture('zero', async ({ kubeconfig, dependencies }) => {
    let observed = 0;
    await assert.rejects(
      () =>
        drainRecoveryMessaging(
          {
            kubeconfig,
            brokerMonitorPassword: password,
            database: {
              outboxCount: async () => {
                observed++;
                return { count: 1, observedAt: new Date().toISOString() };
              },
            },
            timeoutMs: 2500,
          },
          dependencies,
        ),
      /drain|time/i,
    );
    assert.ok(observed > 0);
  });
  const controller = new globalThis.AbortController();
  controller.abort();
  await assert.rejects(
    () =>
      drainRecoveryMessaging({
        kubeconfig: 'private',
        brokerMonitorPassword: password,
        database: {
          outboxCount: async () => ({
            count: 0,
            observedAt: new Date().toISOString(),
          }),
        },
        signal: controller.signal,
      }),
    /drain|cancel/i,
  );
});

test('cancellation after the actual forward is ready closes it and preserves private failure classification', async () => {
  const { drainRecoveryMessaging } = await import('./azure-broker.mjs');
  await fixture('zero', async ({ kubeconfig, dependencies, record }) => {
    const controller = new globalThis.AbortController();
    await assert.rejects(
      () =>
        drainRecoveryMessaging(
          {
            kubeconfig,
            brokerMonitorPassword: password,
            database: {
              outboxCount: async () => {
                controller.abort();
                return { count: 0, observedAt: new Date().toISOString() };
              },
            },
            signal: controller.signal,
            timeoutMs: 5000,
          },
          dependencies,
        ),
      (error) => !/PRIVATE_|Basic/.test(error.message),
    );
    const { port } = JSON.parse(readFileSync(record, 'utf8'));
    await assert.rejects(() =>
      globalThis.fetch(`http://127.0.0.1:${port}`, {
        signal: globalThis.AbortSignal.timeout(500),
      }),
    );
  });
});

test('primary and forward-cleanup failures retain both safe categories without raw child details', async () => {
  const { drainRecoveryMessaging } = await import('./azure-broker.mjs');
  await fixture('denied', async ({ kubeconfig, dependencies }) => {
    let child, kill;
    const reports = [];
    const wrapped = {
      report: (message) => reports.push(message),
      spawnProcess: (...args) => {
        child = dependencies.spawnProcess(...args);
        kill = child.kill;
        child.kill = () => {
          throw Error('PRIVATE_CLEANUP_MARKER');
        };
        return child;
      },
    };
    try {
      await assert.rejects(
        () =>
          drainRecoveryMessaging(
            {
              kubeconfig,
              brokerMonitorPassword: password,
              database: {
                outboxCount: async () => ({
                  count: 0,
                  observedAt: new Date().toISOString(),
                }),
              },
              timeoutMs: 5000,
            },
            wrapped,
          ),
        (error) =>
          /Messaging drain .*failed/.test(error.message) &&
          reports.length === 1 &&
          /Cleanup failure:/.test(reports[0]) &&
          !/PRIVATE_|Basic/.test(
            error.message + JSON.stringify(error) + reports.join(''),
          ),
      );
    } finally {
      if (child && child.exitCode === null) {
        const done = new Promise((resolve) => child.once('close', resolve));
        kill.call(child, 'SIGKILL');
        await done;
      }
    }
  });
});

test('default pinned kubectl rejects a local invalid kubeconfig privately before any database observation', async () => {
  const { drainRecoveryMessaging } = await import('./azure-broker.mjs');
  await fixture('zero', async ({ kubeconfig }) => {
    writeFileSync(kubeconfig, '{PRIVATE_LOCAL_KUBECONFIG_MARKER:', {
      mode: 0o600,
    });
    let queried = false;
    await assert.rejects(
      () =>
        drainRecoveryMessaging({
          kubeconfig,
          brokerMonitorPassword: password,
          database: {
            outboxCount: async () => {
              queried = true;
              return { count: 0, observedAt: new Date().toISOString() };
            },
          },
          timeoutMs: 5000,
        }),
      (error) =>
        !/PRIVATE_|Basic/.test(error.message + JSON.stringify(error)) &&
        error.details?.tool === 'kubectl' &&
        error.details?.category === 'exit' &&
        Number.isInteger(error.details?.status) &&
        error.details.durationMs > 0,
    );
    assert.equal(queried, false);
  });
});

test('local forward readiness timeout preserves kubectl phase and actual elapsed time', async () => {
  const { drainRecoveryMessaging } = await import('./azure-broker.mjs');
  await fixture('quiet', async ({ kubeconfig, dependencies, record }) => {
    await assert.rejects(
      () =>
        drainRecoveryMessaging(
          {
            kubeconfig,
            brokerMonitorPassword: password,
            database: {
              outboxCount: async () => ({
                count: 0,
                observedAt: new Date().toISOString(),
              }),
            },
            timeoutMs: 35000,
          },
          dependencies,
        ),
      (error) =>
        error.details?.tool === 'kubectl' &&
        error.details.operation === 'Messaging drain forward' &&
        error.details.category === 'timeout' &&
        error.details.durationMs >= 30000 &&
        !/PRIVATE_/.test(error.message + JSON.stringify(error)),
    );
    const { port } = JSON.parse(readFileSync(record, 'utf8'));
    await assert.rejects(() =>
      globalThis.fetch(`http://127.0.0.1:${port}`, {
        signal: globalThis.AbortSignal.timeout(500),
      }),
    );
  });
});

test('local HTTP timeout preserves http phase, timeout classification and elapsed time', async () => {
  const { drainRecoveryMessaging } = await import('./azure-broker.mjs');
  await fixture('hang', async ({ kubeconfig, dependencies, record }) => {
    await assert.rejects(
      () =>
        drainRecoveryMessaging(
          {
            kubeconfig,
            brokerMonitorPassword: password,
            database: {
              outboxCount: async () => ({
                count: 0,
                observedAt: new Date().toISOString(),
              }),
            },
            timeoutMs: 20000,
          },
          dependencies,
        ),
      (error) =>
        error.details?.tool === 'http' &&
        error.details.operation === 'Messaging drain queue observation' &&
        error.details.category === 'timeout' &&
        error.details.durationMs >= 10000 &&
        !/PRIVATE_/.test(error.message + JSON.stringify(error)),
    );
    const { port } = JSON.parse(readFileSync(record, 'utf8'));
    await assert.rejects(() =>
      globalThis.fetch(`http://127.0.0.1:${port}`, {
        signal: globalThis.AbortSignal.timeout(500),
      }),
    );
  });
});

test('output exhaustion after readiness preserves kubectl output-limit rather than cancellation', async () => {
  const { drainRecoveryMessaging } = await import('./azure-broker.mjs');
  await fixture('flood', async ({ kubeconfig, dependencies, record }) => {
    await assert.rejects(
      () =>
        drainRecoveryMessaging(
          {
            kubeconfig,
            brokerMonitorPassword: password,
            database: {
              outboxCount: async () => ({
                count: 0,
                observedAt: new Date().toISOString(),
              }),
            },
            timeoutMs: 5000,
          },
          dependencies,
        ),
      (error) =>
        error.details?.tool === 'kubectl' &&
        error.details.operation === 'Messaging drain forward' &&
        error.details.category === 'output-limit' &&
        error.details.durationMs > 0 &&
        !/PRIVATE_/.test(error.message + JSON.stringify(error)),
    );
    const { port } = JSON.parse(readFileSync(record, 'utf8'));
    await assert.rejects(() =>
      globalThis.fetch(`http://127.0.0.1:${port}`, {
        signal: globalThis.AbortSignal.timeout(500),
      }),
    );
  });
});
