import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createPrivateDirectory } from './local-platform.mjs';
import { removeAzureFixtureDirectory } from './azure-runtime-fixture.mjs';
import { qualityContext, verifiedTool } from './azure-quality.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { runPrivateProcess } from './azure-infrastructure.mjs';
import {
  finishNativeFixture,
  assertNativeProcessStarted,
  waitForNativeClusterIssuer,
  nativeHttpsStatus,
} from './azure-native-fixture.mjs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ProcessFailure, executeProcess } from './process.mjs';

for (const [primaryExit, cleanupExit] of [
  [11, 17],
  [11, 0],
  [0, 17],
])
  test(`native fixture retains primary=${primaryExit} and cleanup=${cleanupExit} process outcomes without private output`, async () => {
    const sentinel = 'PRIVATE_NATIVE_FIXTURE_SENTINEL';
    const run = (status) =>
      runPrivateProcess(
        process.execPath,
        [
          '-e',
          'process.stdout.write(process.env.NATIVE_FIXTURE_PRIVATE_SENTINEL);process.stderr.write(process.env.NATIVE_FIXTURE_PRIVATE_SENTINEL);process.exit(Number(process.env.NATIVE_FIXTURE_EXIT));',
        ],
        {
          operation: 'Private fixture regression',
          tool: 'node',
          timeout: 10000,
          env: {
            ...process.env,
            NATIVE_FIXTURE_PRIVATE_SENTINEL: sentinel,
            NATIVE_FIXTURE_EXIT: String(status),
          },
        },
      );
    let primary,
      additionalCleanup = false;
    try {
      await run(primaryExit);
    } catch (error) {
      primary = error;
    }
    const reports = [];
    await assert.rejects(
      finishNativeFixture({
        primary,
        phase: 'capture-inventory',
        report: (message) => reports.push(message),
        cleanups: [
          {
            phase: 'cluster-delete',
            tool: 'node',
            run: () => run(cleanupExit),
          },
          {
            phase: 'private-directory-remove',
            tool: 'node',
            run: async () => {
              additionalCleanup =
                (await runPrivateProcess(
                  process.execPath,
                  ['-e', 'process.stdout.write("completed")'],
                  {
                    operation: 'Additional cleanup regression',
                    tool: 'node',
                    timeout: 10000,
                  },
                )) === 'completed';
            },
          },
        ],
      }),
      (error) => {
        const safe = error.message + JSON.stringify(error) + reports.join('\n');
        assert.equal(safe.includes(sentinel), false);
        if (primaryExit) {
          assert.equal(error.details.status, 11);
          assert.match(error.message, /capture-inventory/);
        } else assert.match(error.message, /cleanup operation/);
        if (cleanupExit) {
          assert.equal(reports.length, 1);
          assert.match(reports[0], /cluster-delete/);
          assert.match(reports[0], /status=17/);
        } else assert.equal(reports.length, 0);
        return true;
      },
    );
    assert.equal(additionalCleanup, true);
  });

test('native fixture suppresses arbitrary primary and cleanup exception bodies', async () => {
  const reports = [];
  await assert.rejects(
    finishNativeFixture({
      phase: 'capture-inventory',
      primary: new Error('PRIVATE_PRIMARY'),
      report: (value) => reports.push(value),
      cleanups: [
        {
          phase: 'cluster-delete',
          tool: 'fixture',
          run: () => {
            throw new Error('PRIVATE_CLEANUP');
          },
        },
      ],
    }),
    (error) => {
      assert.equal(
        /PRIVATE_/.test(
          error.message + JSON.stringify(error) + reports.join('\n'),
        ),
        false,
      );
      assert.match(error.message, /capture-inventory/);
      assert.match(reports[0], /cluster-delete/);
      return true;
    },
  );
});

// External process errors may already carry captured tails; the fixture boundary
// must project safe fields rather than forwarding that existing Error instance.
test('native fixture projects process metadata without forwarding captured tails or foreign labels', async () => {
  const primary = new ProcessFailure({
    operation: 'PRIVATE_OPERATION',
    tool: 'PRIVATE_TOOL',
    category: 'exit',
    status: 23,
    durationMs: 19,
    stdout: 'PRIVATE_STDOUT',
    stderr: 'PRIVATE_STDERR',
  });
  primary.providerCategory = 'PRIVATE_PROVIDER_CATEGORY';
  await assert.rejects(
    finishNativeFixture({ primary, phase: 'PRIVATE_PHASE', cleanups: [] }),
    (error) => {
      assert.equal(
        /PRIVATE_/.test(error.message + JSON.stringify(error)),
        false,
      );
      assert.equal(error.providerCategory, 'unclassified');
      assert.equal(error.details.status, 23);
      assert.equal(error.details.durationMs, 19);
      assert.equal(error.details.tool, 'fixture');
      assert.match(error.message, /Native fixture setup/);
      return true;
    },
  );
});

for (const scenario of ['spawn', 'timeout'])
  test(`admission ${scenario} boundary retains real process metadata through cleanup without private output`, async () => {
    const started = globalThis.performance.now();
    const result = spawnSync(
      scenario === 'spawn'
        ? resolve(tmpdir(), 'equipment-missing-' + randomUUID())
        : process.execPath,
      scenario === 'spawn'
        ? []
        : [
            '-e',
            'process.stderr.write(process.env.NATIVE_FIXTURE_PRIVATE_SENTINEL);setInterval(()=>{},1000)',
          ],
      {
        encoding: 'utf8',
        timeout: 200,
        windowsHide: true,
        env: {
          ...process.env,
          NATIVE_FIXTURE_PRIVATE_SENTINEL: 'PRIVATE_ADMISSION_TIMEOUT',
        },
      },
    );
    const durationMs = globalThis.performance.now() - started;
    assert.equal(Boolean(result.error), true);
    let primary;
    try {
      assertNativeProcessStarted({
        error: result.error,
        phase: 'native-admission',
        tool: 'kubectl',
        durationMs,
      });
    } catch (error) {
      primary = error;
    }
    const reports = [];
    await assert.rejects(
      finishNativeFixture({
        primary,
        phase: 'native-admission',
        report: (value) => reports.push(value),
        cleanups: [
          {
            phase: 'cluster-delete',
            tool: 'node',
            run: () =>
              runPrivateProcess(
                process.execPath,
                [
                  '-e',
                  'process.stderr.write(process.env.NATIVE_FIXTURE_PRIVATE_SENTINEL);process.exit(17)',
                ],
                {
                  operation: 'Private timeout cleanup regression',
                  tool: 'node',
                  timeout: 10000,
                  env: {
                    ...process.env,
                    NATIVE_FIXTURE_PRIVATE_SENTINEL:
                      'PRIVATE_ADMISSION_CLEANUP',
                  },
                },
              ),
          },
        ],
      }),
      (error) => {
        assert.equal(error.details.tool, 'kubectl');
        assert.equal(error.details.category, scenario);
        assert.equal(error.details.durationMs, Math.round(durationMs));
        assert.match(error.message, /native-admission/);
        assert.match(reports[0], /cluster-delete/);
        assert.match(reports[0], /status=17/);
        assert.equal(
          /PRIVATE_/.test(
            error.message + JSON.stringify(error) + reports.join('\n'),
          ),
          false,
        );
        return true;
      },
    );
  });

for (const providerCategory of ['connection-refused', 'unclassified'])
  test(`native prerequisite ${providerCategory} classification survives actual process and cleanup projection without private output`, async () => {
    const stderr =
      providerCategory === 'connection-refused'
        ? 'Unable to connect to the server: dial tcp 127.0.0.1:12345: connectex: No connection could be made because the target machine actively refused it.'
        : 'PRIVATE_UNCLASSIFIED_PROVIDER';
    const run = (message, status) =>
      runPrivateProcess(
        process.execPath,
        [
          '-e',
          'process.stdout.write(process.env.NATIVE_FIXTURE_PRIVATE_SENTINEL);process.stderr.write(process.env.NATIVE_FIXTURE_STDERR);process.exit(Number(process.env.NATIVE_FIXTURE_EXIT));',
        ],
        {
          operation: 'Native prerequisite policy regression',
          tool: 'kubectl',
          failurePolicy: 'kubectl-prerequisite',
          timeout: 10000,
          env: {
            ...process.env,
            NATIVE_FIXTURE_PRIVATE_SENTINEL: 'PRIVATE_PREREQUISITE_STDOUT',
            NATIVE_FIXTURE_STDERR: message,
            NATIVE_FIXTURE_EXIT: String(status),
          },
        },
      );
    let primary;
    try {
      await run(stderr, 23);
    } catch (error) {
      primary = error;
    }
    assert.equal(primary.providerCategory, providerCategory);
    const reports = [];
    await assert.rejects(
      finishNativeFixture({
        primary,
        phase: 'prereq-namespace-equipment',
        report: (message) => reports.push(message),
        cleanups: [
          {
            phase: 'cluster-delete',
            tool: 'kubectl',
            run: () => run('PRIVATE_CLEANUP_STDERR', 17),
          },
        ],
      }),
      (error) => {
        assert.equal(error.providerCategory, providerCategory);
        assert.equal(error.details.status, 23);
        assert.equal(error.details.tool, 'kubectl');
        assert.equal(error.details.durationMs > 0, true);
        assert.match(error.message, /prereq-namespace-equipment/);
        assert.equal(
          error.message.includes('providerCategory=' + providerCategory),
          true,
        );
        assert.match(reports[0], /providerCategory=unclassified/);
        assert.match(reports[0], /status=17/);
        assert.equal(
          /PRIVATE_|127\.0\.0\.1|connectex/.test(
            error.message + JSON.stringify(error) + reports.join('\n'),
          ),
          false,
        );
        return true;
      },
    );
  });

const crdApiPath = '/apis/apiextensions.k8s.io/v1/customresourcedefinitions';
const crdIdentity = () => ({
  apiVersion: 'apiextensions.k8s.io/v1',
  kind: 'CustomResourceDefinition',
  metadata: { name: 'clusterissuers.cert-manager.io', resourceVersion: '1' },
  spec: {
    group: 'cert-manager.io',
    scope: 'Cluster',
    names: { plural: 'clusterissuers', kind: 'ClusterIssuer' },
  },
});

async function nativeCrdApi(t, respond) {
  const directory = mkdtempSync(resolve(tmpdir(), 'equipment-native-crd-'));
  createPrivateDirectory(directory);
  const requests = [];
  const api = createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture');
    response.setHeader('content-type', 'application/json');
    if (url.pathname.startsWith(crdApiPath)) {
      requests.push({
        method: request.method,
        watch: url.searchParams.get('watch'),
      });
      const value = respond(requests.length);
      if (value === 'pending-body') {
        response.writeHead(200);
        response.write('{');
        return;
      }
      if (value === 'forbidden') {
        response.statusCode = 403;
        response.end(
          JSON.stringify({
            apiVersion: 'v1',
            kind: 'Status',
            status: 'Failure',
            reason: 'Forbidden',
            code: 403,
            message: 'PRIVATE_API_FORBIDDEN',
          }),
        );
        return;
      }
      if (value === 'malformed-json') {
        response.end('PRIVATE_MALFORMED_JSON');
        return;
      }
      response.end(
        JSON.stringify(
          url.pathname === crdApiPath
            ? {
                apiVersion: 'apiextensions.k8s.io/v1',
                kind: 'CustomResourceDefinitionList',
                metadata: { resourceVersion: '1' },
                items: [value],
              }
            : value,
        ),
      );
    } else if (url.pathname === '/api')
      response.end(
        JSON.stringify({
          apiVersion: 'v1',
          kind: 'APIVersions',
          versions: ['v1'],
        }),
      );
    else if (url.pathname === '/apis')
      response.end(
        JSON.stringify({
          apiVersion: 'v1',
          kind: 'APIGroupList',
          groups: [
            {
              name: 'apiextensions.k8s.io',
              versions: [
                { groupVersion: 'apiextensions.k8s.io/v1', version: 'v1' },
              ],
              preferredVersion: {
                groupVersion: 'apiextensions.k8s.io/v1',
                version: 'v1',
              },
            },
          ],
        }),
      );
    else if (url.pathname === '/apis/apiextensions.k8s.io/v1')
      response.end(
        JSON.stringify({
          apiVersion: 'v1',
          kind: 'APIResourceList',
          groupVersion: 'apiextensions.k8s.io/v1',
          resources: [
            {
              name: 'customresourcedefinitions',
              singularName: 'customresourcedefinition',
              namespaced: false,
              kind: 'CustomResourceDefinition',
              verbs: ['get', 'list', 'watch'],
              shortNames: ['crd'],
            },
          ],
        }),
      );
    else {
      response.statusCode = 404;
      response.end(
        JSON.stringify({ apiVersion: 'v1', kind: 'Status', code: 404 }),
      );
    }
  });
  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
  const kubeconfig = resolve(directory, 'config');
  writeFileSync(
    kubeconfig,
    JSON.stringify({
      apiVersion: 'v1',
      kind: 'Config',
      clusters: [
        {
          name: 'fixture',
          cluster: { server: `http://127.0.0.1:${api.address().port}` },
        },
      ],
      users: [{ name: 'fixture', user: {} }],
      contexts: [
        { name: 'fixture', context: { cluster: 'fixture', user: 'fixture' } },
      ],
      'current-context': 'fixture',
    }),
    { mode: 0o600 },
  );
  t.after(async () => {
    try {
      api.closeAllConnections();
      await new Promise((resolve) => api.close(resolve));
    } finally {
      removeAzureFixtureDirectory(directory, 'equipment-native-crd-');
    }
  });
  return {
    kubeconfig,
    context: 'fixture',
    requests,
    kubectl: verifiedTool(qualityContext(), 'kubectl'),
  };
}

test('actual pinned kubectl legacy condition wait reproduces the exact null-condition accessor failure', async (t) => {
  const fixture = await nativeCrdApi(t, () => ({
    ...crdIdentity(),
    status: { conditions: null },
  }));
  let failure;
  try {
    await promisify(execFile)(
      verifiedTool(qualityContext(), 'kubectl'),
      [
        '--kubeconfig',
        fixture.kubeconfig,
        '--context',
        fixture.context,
        'wait',
        '--for=condition=Established',
        'crd/clusterissuers.cert-manager.io',
        '--timeout=2s',
      ],
      {
        encoding: 'utf8',
        timeout: 3000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      },
    );
  } catch (error) {
    failure = error;
  }
  assert.equal(failure?.code, 1);
  assert.equal(
    /^error: \.status\.conditions accessor error:/m.test(
      failure?.stderr ?? '',
    ) && /expected \[\]interface\{\}/.test(failure?.stderr ?? ''),
    true,
  );
});

test('pinned CLI CRD readiness tolerates missing null empty and non-established conditions until exact Established True', async (t) => {
  const statuses = [
    undefined,
    null,
    {},
    { conditions: null },
    { conditions: [] },
    { conditions: [{ type: 'NamesAccepted', status: 'True' }] },
    { conditions: [{ type: 'Established', status: 'False' }] },
    { conditions: [{ type: 'Established', status: 'True' }] },
  ];
  const fixture = await nativeCrdApi(t, (n) => ({
    ...crdIdentity(),
    ...(statuses[Math.min(n - 1, statuses.length - 1)] === undefined
      ? {}
      : { status: statuses[Math.min(n - 1, statuses.length - 1)] }),
  }));
  await waitForNativeClusterIssuer({ ...fixture, timeoutMs: 5000 });
  assert.equal(fixture.requests.length, statuses.length);
  assert.equal(
    fixture.requests.every(
      (value) => value.method === 'GET' && value.watch === null,
    ),
    true,
  );
});

for (const fault of [
  'forbidden',
  'malformed-json',
  'wrong-identity',
  'malformed-conditions',
])
  test(`pinned CLI CRD readiness rejects ${fault} without retry or private output`, async (t) => {
    const fixture = await nativeCrdApi(t, () =>
      fault === 'wrong-identity'
        ? { ...crdIdentity(), metadata: { name: 'PRIVATE_WRONG_IDENTITY' } }
        : fault === 'malformed-conditions'
          ? {
              ...crdIdentity(),
              status: { conditions: 'PRIVATE_INVALID_CONDITIONS' },
            }
          : fault,
    );
    await assert.rejects(
      waitForNativeClusterIssuer({ ...fixture, timeoutMs: 2000 }),
      (error) => {
        assert.equal(
          /PRIVATE_/.test(error.message + JSON.stringify(error)),
          false,
        );
        return true;
      },
    );
    assert.equal(fixture.requests.length, 1);
  });

for (const scenario of ['not-ready', 'pending-body'])
  test(`pinned CLI CRD ${scenario} respects the overall deadline including active request teardown`, async (t) => {
    const fixture = await nativeCrdApi(t, () =>
      scenario === 'pending-body'
        ? scenario
        : { ...crdIdentity(), status: { conditions: null } },
    );
    const started = globalThis.performance.now();
    await assert.rejects(
      waitForNativeClusterIssuer({ ...fixture, timeoutMs: 500 }),
      (error) => {
        assert.equal(error.details.category, 'timeout');
        assert.equal(
          /PRIVATE_/.test(error.message + JSON.stringify(error)),
          false,
        );
        return true;
      },
    );
    assert.equal(globalThis.performance.now() - started < 1500, true);
    assert.equal(fixture.requests.length > 0, true);
  });

test('pinned CLI CRD readiness propagates cancellation into the actual pending request and cleans up privately', async (t) => {
  const controller = new globalThis.AbortController();
  const fixture = await nativeCrdApi(t, () => {
    globalThis.setTimeout(() => controller.abort(), 25);
    return 'pending-body';
  });
  const started = globalThis.performance.now();
  await assert.rejects(
    waitForNativeClusterIssuer({
      ...fixture,
      timeoutMs: 3000,
      signal: controller.signal,
    }),
    (error) => {
      assert.equal(
        /PRIVATE_/.test(error.message + JSON.stringify(error)),
        false,
      );
      assert.equal(controller.signal.aborted, true);
      return true;
    },
  );
  assert.equal(globalThis.performance.now() - started < 1500, true);
  assert.equal(fixture.requests.length, 1);
});

test(
  'real HTTPS status lifecycle preserves trust and auth statuses and bounds private body failures',
  { timeout: 15000 },
  async (t) => {
    const directory = mkdtempSync(resolve(tmpdir(), 'equipment-native-https-'));
    createPrivateDirectory(directory);
    const keyPath = resolve(directory, 'key.pem'),
      certPath = resolve(directory, 'cert.pem');
    executeProcess(
      process.platform === 'win32'
        ? 'C:/Program Files/Git/usr/bin/openssl.exe'
        : 'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost,IP:127.0.0.1',
      ],
      {
        operation: 'Private HTTPS lifecycle fixture certificate',
        tool: 'openssl',
        output: 'private-capture',
        timeout: 30000,
        maxBuffer: 65536,
      },
    );
    const sockets = new Set();
    const api = createHttpsServer(
      { key: readFileSync(keyPath), cert: readFileSync(certPath) },
      (request, response) => {
        const path = new URL(request.url, 'https://fixture').pathname;
        if (path === '/dribble') {
          response.writeHead(200);
          response.write('PRIVATE_BODY');
          const timer = globalThis.setInterval(
            () => response.write('PRIVATE_BODY'),
            50,
          );
          response.on('close', () => globalThis.clearInterval(timer));
        } else if (path === '/truncated') {
          response.writeHead(200, { 'content-length': '1000' });
          response.write('PRIVATE_BODY');
          globalThis.setTimeout(() => response.destroy(), 25);
        } else {
          response.writeHead(
            request.headers.authorization === 'Bearer PRIVATE_VALID_TOKEN'
              ? 200
              : 401,
          );
          response.end('PRIVATE_COMPLETE_BODY');
        }
      },
    );
    api.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
      try {
        api.closeAllConnections();
        await new Promise((resolve) => api.close(resolve));
      } finally {
        removeAzureFixtureDirectory(directory, 'equipment-native-https-');
      }
    });
    const base = `https://127.0.0.1:${api.address().port}`;
    const settings = { ca: readFileSync(certPath) };
    await t.test(
      'complete missing wrong and valid auth responses retain statuses',
      async () => {
        for (const [token, status] of [
          [undefined, 401],
          ['PRIVATE_WRONG_TOKEN', 401],
          ['PRIVATE_VALID_TOKEN', 200],
        ])
          assert.equal(
            await nativeHttpsStatus({
              ...settings,
              url: base + '/status',
              token,
            }),
            status,
          );
      },
    );
    for (const path of ['/dribble', '/truncated'])
      await t.test(
        `body ${path} settles before independent watchdog and releases transport privately`,
        async () => {
          const controller = new globalThis.AbortController();
          let watchdogFired = false,
            timer;
          const started = globalThis.performance.now();
          const watchdog = new Promise((_, reject) => {
            timer = globalThis.setTimeout(
              () => {
                watchdogFired = true;
                controller.abort();
                reject(new Error('Independent HTTPS watchdog fired.'));
              },
              path === '/dribble' ? 4500 : 1200,
            );
          });
          try {
            await assert.rejects(
              Promise.race([
                nativeHttpsStatus({
                  ...settings,
                  url: base + path,
                  token: 'PRIVATE_VALID_TOKEN',
                  signal: controller.signal,
                }),
                watchdog,
              ]),
              (error) => {
                assert.equal(
                  /PRIVATE_|127\.0\.0\.1|Bearer/.test(
                    error.message + JSON.stringify(error),
                  ),
                  false,
                );
                return true;
              },
            );
          } finally {
            globalThis.clearTimeout(timer);
            controller.abort();
          }
          assert.equal(watchdogFired, false);
          const elapsed = globalThis.performance.now() - started;
          assert.equal(elapsed < (path === '/dribble' ? 4000 : 1000), true);
          if (path === '/dribble') assert.equal(elapsed >= 2800, true);
          const deadline = Date.now() + 500;
          while (sockets.size && Date.now() < deadline)
            await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
          assert.equal(sockets.size, 0);
          assert.equal(
            await nativeHttpsStatus({ ...settings, url: base + '/status' }),
            401,
          );
        },
      );
    await t.test(
      'untrusted certificate still fails with fixed private diagnostics',
      async () => {
        await assert.rejects(
          nativeHttpsStatus({
            url: base + '/status',
            token: 'PRIVATE_VALID_TOKEN',
          }),
          (error) => {
            assert.equal(
              /PRIVATE_|127\.0\.0\.1|Bearer/.test(
                error.message + JSON.stringify(error),
              ),
              false,
            );
            return true;
          },
        );
      },
    );
  },
);
