import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import parsers from '@stoplight/spectral-parsers';
import { cleanupAll, executeProcess } from './process.mjs';

const root = resolve(import.meta.dirname, '..');
const runtime = process.env.CONTAINER_RUNTIME ?? 'podman';
assert.ok(['podman', 'docker'].includes(runtime));
const image =
  'mcr.microsoft.com/dotnet/aspire-dashboard@sha256:03099004e132a7ca2feb66c5fa24715ffeaaf2fffab6f8b2cda23de3abd3ea45';
const service = 'equipment-dashboard-contract';
const traceId = '11'.repeat(16);
const parentId = '22'.repeat(8);
const childId = '33'.repeat(8);
const attribute = (key, stringValue) => ({ key, value: { stringValue } });

function command(args, timeout = 180_000) {
  let output = 'private-capture';
  if (args[0] === 'port') output = 'public-capture';
  if (args[0] === 'rm') output = 'stream';
  return executeProcess(runtime, args, {
    cwd: root,
    operation: 'Dashboard provider operation',
    tool: runtime,
    output,
    encoding: 'utf8',
    timeout,
    killSignal: 'SIGKILL',
  }).trim();
}

function records(payload, kind) {
  const spans = kind === 'spans';
  assert.ok(Number.isSafeInteger(payload.totalCount));
  assert.ok(Number.isSafeInteger(payload.returnedCount));
  const resources = payload.data[spans ? 'resourceSpans' : 'resourceLogs'];
  assert.ok(Array.isArray(resources));
  const result = resources.flatMap((resource) => {
    assert.ok(Array.isArray(resource.resource.attributes));
    assert.ok(
      resource.resource.attributes.some(
        (entry) =>
          entry.key === 'service.name' && entry.value.stringValue === service,
      ),
    );
    const scopes = resource[spans ? 'scopeSpans' : 'scopeLogs'];
    assert.ok(Array.isArray(scopes));
    return scopes.flatMap((scope) => {
      assert.equal(scope.scope.name, 'equipment.dashboard.contract');
      assert.ok(Array.isArray(scope[spans ? 'spans' : 'logRecords']));
      return scope[spans ? 'spans' : 'logRecords'];
    });
  });
  assert.equal(payload.returnedCount, result.length);
  assert.equal(
    payload.totalCount,
    result.length,
    'untruncated fixture export counts must equal actual records',
  );
  return result;
}

test(
  'pinned Dashboard public OTLP/API contract preserves correlation, untraced logs and metric resource flags',
  { timeout: 300_000 },
  async (t) => {
    const source = readFileSync(
      join(root, 'deploy/base/dashboard.yaml'),
      'utf8',
    );
    const deployment = parsers.Yaml.parse(source).data;
    const pod = deployment.spec.template.spec;
    const dashboard = pod.containers[0];
    assert.equal(
      dashboard.image,
      image,
      'provider contract is bound to researched Dashboard 13.6.1',
    );
    const credentials = {
      dashboardBrowser: randomBytes(32).toString('base64url'),
      dashboardOtlp: randomBytes(32).toString('base64url'),
      dashboardApi: randomBytes(32).toString('base64url'),
    };
    const environment = dashboard.env
      .map((entry) => {
        const value =
          entry.value ?? credentials[entry.valueFrom.secretKeyRef.key];
        assert.equal(typeof value, 'string');
        return `${entry.name}=${value}`;
      })
      .join('\n');
    const directory = mkdtempSync(
      join(tmpdir(), 'equipment-dashboard-contract-'),
    );
    const envfile = join(directory, 'private.env');
    writeFileSync(envfile, environment, { mode: 0o600 });
    const name = `equipment-dashboard-contract-${process.pid}`;
    let owned = false;
    t.after(() =>
      cleanupAll([
        ...(owned
          ? [
              {
                operation: 'remove Dashboard container',
                run: () => command(['rm', '-f', name], 30_000),
              },
            ]
          : []),
        {
          operation: 'remove Dashboard private fixture',
          run: () => rmSync(directory, { recursive: true, force: true }),
        },
      ]),
    );
    const size = (name) =>
      pod.volumes
        .find((entry) => entry.name === name)
        .emptyDir.sizeLimit.replace('Mi', 'm');
    const memory = dashboard.resources.limits.memory.replace('Mi', 'm');
    command([
      'run',
      '-d',
      '--name',
      name,
      '--log-driver=none',
      '--user',
      `${pod.securityContext.runAsUser}:${pod.securityContext.runAsGroup}`,
      '--memory',
      memory,
      '--memory-swap',
      memory,
      '--cpus',
      String(Number(dashboard.resources.limits.cpu.replace('m', '')) / 1000),
      '--cap-drop',
      'all',
      '--security-opt',
      'no-new-privileges',
      '--tmpfs',
      `/data:rw,noexec,nosuid,size=${size('data')}`,
      '--tmpfs',
      `/tmp:rw,noexec,nosuid,size=${size('tmp')}`,
      '--env-file',
      envfile,
      '-p',
      '127.0.0.1::18888',
      '-p',
      '127.0.0.1::18890',
      image,
    ]);
    owned = true;
    const port = (value) =>
      command(['port', name, `${value}/tcp`])
        .split(':')
        .at(-1);
    const api = `http://127.0.0.1:${port(18888)}`;
    const otlp = `http://127.0.0.1:${port(18890)}`;
    const get = async (path, key = credentials.dashboardApi) => {
      const response = await globalThis.fetch(new URL(path, api), {
        headers: { 'x-api-key': key },
        redirect: 'manual',
        signal: globalThis.AbortSignal.timeout(5000),
      });
      return {
        status: response.status,
        body: response.status === 200 ? await response.json() : null,
      };
    };
    const readinessDeadline = Date.now() + 45_000;
    while (true) {
      try {
        if ((await get('/api/telemetry/resources')).status === 200) break;
      } catch {
        /* Container initialization has a finite readiness budget. */
      }
      assert.ok(
        Date.now() < readinessDeadline,
        'Dashboard public API starts within 45 seconds',
      );
      await delay(100);
    }
    assert.equal(
      (await get('/api/telemetry/resources', 'wrong-contract-key')).status,
      401,
    );
    const now = BigInt(Date.now()) * 1_000_000n;
    const resource = { attributes: [attribute('service.name', service)] };
    const scope = { name: 'equipment.dashboard.contract' };
    const span = {
      traceId,
      name: 'fixture parent',
      spanId: parentId,
      kind: 1,
      startTimeUnixNano: String(now - 2_000_000n),
      endTimeUnixNano: String(now),
      status: { code: 0 },
    };
    const payloads = {
      traces: {
        resourceSpans: [
          {
            resource,
            scopeSpans: [
              {
                scope,
                spans: [
                  span,
                  {
                    ...span,
                    name: 'fixture failure',
                    spanId: childId,
                    parentSpanId: parentId,
                    status: { code: 2, message: 'fixture_failure' },
                    attributes: [attribute('fixture.outcome', 'failure')],
                  },
                ],
              },
            ],
          },
        ],
      },
      logs: {
        resourceLogs: [
          {
            resource,
            scopeLogs: [
              {
                scope,
                logRecords: [
                  {
                    timeUnixNano: String(now),
                    severityNumber: 17,
                    severityText: 'ERROR',
                    body: { stringValue: 'fixture_failure' },
                    traceId,
                    spanId: childId,
                  },
                  {
                    timeUnixNano: String(now),
                    severityNumber: 9,
                    severityText: 'INFO',
                    body: { stringValue: 'fixture lifecycle' },
                  },
                ],
              },
            ],
          },
        ],
      },
      metrics: {
        resourceMetrics: [
          {
            resource,
            scopeMetrics: [
              {
                scope,
                metrics: [
                  {
                    name: 'equipment.dashboard.contract.count',
                    unit: '{event}',
                    sum: {
                      aggregationTemporality: 2,
                      isMonotonic: true,
                      dataPoints: [
                        {
                          startTimeUnixNano: String(now - 2_000_000n),
                          timeUnixNano: String(now),
                          asInt: '1',
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    for (const [kind, body] of Object.entries(payloads)) {
      const response = await globalThis.fetch(`${otlp}/v1/${kind}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-otlp-api-key': credentials.dashboardOtlp,
        },
        body: JSON.stringify(body),
        signal: globalThis.AbortSignal.timeout(5000),
      });
      assert.equal(
        response.status,
        200,
        `public synthetic ${kind} transport is accepted`,
      );
      await response.arrayBuffer();
    }
    const observationDeadline = Date.now() + 30_000;
    let resources;
    while (true) {
      resources = (await get('/api/telemetry/resources')).body;
      assert.ok(
        Array.isArray(resources),
        'resources endpoint returns an array rather than a telemetry data wrapper',
      );
      const entry = resources.find((entry) => entry.name === service);
      if (entry?.hasTraces && entry.hasLogs && entry.hasMetrics) break;
      assert.ok(
        Date.now() < observationDeadline,
        'synthetic trace/log/metric resource flags become visible',
      );
      await delay(100);
    }
    const entry = resources.find((entry) => entry.name === service);
    assert.equal(typeof entry.displayName, 'string');
    assert.equal(entry.hasTraces, true);
    assert.equal(entry.hasLogs, true);
    assert.equal(entry.hasMetrics, true);
    const query = `traceId=${traceId}&limit=500`;
    const spans = records(
      (await get(`/api/telemetry/spans?${query}`)).body,
      'spans',
    );
    assert.equal(spans.length, 2);
    for (const value of spans) {
      assert.equal(value.traceId, traceId);
      assert.match(value.spanId, /^[a-f0-9]{16}$/);
    }
    const parent = spans.find((entry) => entry.spanId === parentId);
    const child = spans.find((entry) => entry.spanId === childId);
    assert.equal(
      parent.status?.code ?? 0,
      0,
      'ordinary successful spans may remain Unset',
    );
    assert.equal(child.parentSpanId, parentId);
    assert.equal(child.status.code, 2);
    assert.equal(child.status.message, 'fixture_failure');
    assert.ok(
      child.attributes.some(
        (entry) =>
          entry.key === 'fixture.outcome' &&
          entry.value.stringValue === 'failure',
      ),
    );
    const logs = records(
      (await get(`/api/telemetry/logs?${query}`)).body,
      'logs',
    );
    assert.equal(logs.length, 1);
    assert.equal(logs[0].traceId, traceId);
    assert.equal(logs[0].spanId, childId);
    assert.equal(logs[0].body.stringValue, 'fixture_failure');
    const filtered = `resource=${encodeURIComponent(service)}&limit=500`;
    assert.equal(
      records((await get(`/api/telemetry/spans?${filtered}`)).body, 'spans')
        .length,
      2,
    );
    const resourceLogs = records(
      (await get(`/api/telemetry/logs?${filtered}`)).body,
      'logs',
    );
    assert.equal(resourceLogs.length, 2);
    const ordinary = resourceLogs.find(
      (entry) => entry.body.stringValue === 'fixture lifecycle',
    );
    assert.ok([null, undefined].includes(ordinary.traceId));
    assert.ok([null, undefined].includes(ordinary.spanId));
  },
);
