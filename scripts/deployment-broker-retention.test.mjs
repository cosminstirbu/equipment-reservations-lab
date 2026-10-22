import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import parsers from '@stoplight/spectral-parsers';
import { cleanupAll, executeProcess } from './process.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = process.env.CONTAINER_RUNTIME ?? 'podman';
assert.ok(
  ['podman', 'docker'].includes(runtime),
  'CONTAINER_RUNTIME must be podman or docker',
);
function execute(args) {
  let output = 'stream';
  if (args[0] === 'port') output = 'public-capture';
  if (args[0] === 'run') output = 'private-capture';
  return executeProcess(runtime, args, {
    operation: 'broker retention provider operation',
    tool: runtime,
    output,
    encoding: 'utf8',
    timeout: 45000,
  });
}

test(
  'production broker node identity preserves a durable queued message across replacement with a different transient hostname',
  { timeout: 420000 },
  async (t) => {
    const workload = parsers.Yaml.parse(
      readFileSync(join(root, 'deploy/base/rabbitmq.yaml'), 'utf8'),
    ).data;
    const pod = workload.spec.template.spec;
    const broker = pod.containers.find((entry) => entry.name === 'rabbitmq');
    assert.equal(workload.spec.strategy.type, 'Recreate');
    assert.equal(
      broker.volumeMounts.find((entry) => entry.name === 'data').mountPath,
      '/var/lib/rabbitmq',
    );
    const id = randomBytes(8).toString('hex');
    const name = `equipment-retention-${id}`;
    const volume = `${name}-data`;
    const directory = mkdtempSync(
      join(tmpdir(), 'equipment-broker-retention-'),
    );
    t.after(() =>
      cleanupAll([
        {
          operation: 'remove broker container',
          run: () => execute(['rm', '--force', name]),
        },
        {
          operation: 'remove broker volume',
          run: () => execute(['volume', 'rm', volume]),
        },
        {
          operation: 'remove broker private fixture',
          run: () => rmSync(directory, { recursive: true, force: true }),
        },
      ]),
    );
    const password = randomBytes(32).toString('hex');
    const environment = (broker.env ?? [])
      .filter((entry) => typeof entry.value === 'string')
      .map((entry) => `${entry.name}=${entry.value}`);
    environment.push(
      'RABBITMQ_DEFAULT_USER=equipment-retention',
      `RABBITMQ_DEFAULT_PASS=${password}`,
    );
    const envfile = join(directory, 'provider.env');
    writeFileSync(envfile, environment.join('\n') + '\n', { mode: 0o600 });
    execute(['volume', 'create', volume]);
    execute([
      'run',
      '--rm',
      '--network',
      'none',
      '--user',
      '0',
      '--entrypoint',
      'chown',
      '--mount',
      `type=volume,source=${volume},destination=/var/lib/rabbitmq`,
      broker.image,
      '-R',
      `${pod.securityContext.runAsUser}:${pod.securityContext.runAsGroup}`,
      '/var/lib/rabbitmq',
    ]);
    const launch = async (hostname) => {
      execute([
        'run',
        '--detach',
        '--name',
        name,
        '--hostname',
        hostname,
        '--user',
        `${pod.securityContext.runAsUser}:${pod.securityContext.runAsGroup}`,
        '--memory',
        broker.resources.limits.memory.replace('Mi', 'm'),
        '--cpus',
        '1',
        '--env-file',
        envfile,
        '--mount',
        `type=volume,source=${volume},destination=/var/lib/rabbitmq`,
        '--publish',
        '127.0.0.1::15672',
        broker.image,
      ]);
      const address = execute(['port', name, '15672/tcp'])
        .trim()
        .split('\n')[0];
      const origin = `http://${address}`;
      const headers = {
        authorization: `Basic ${Buffer.from(`equipment-retention:${password}`).toString('base64')}`,
        'content-type': 'application/json',
      };
      const call = async (path, options = {}) =>
        globalThis.fetch(`${origin}${path}`, {
          ...options,
          headers,
          signal: globalThis.AbortSignal.timeout(3000),
        });
      const deadline = Date.now() + 180000;
      while (true) {
        try {
          if ((await call('/api/overview')).status === 200) break;
        } catch {
          // The real provider may not have bound its management listener yet.
        }
        if (Date.now() >= deadline)
          throw new Error('Broker retention readiness exceeded180seconds.');
        await delay(250);
      }
      return call;
    };
    const queue = `retention-${id}`;
    let call = await launch(`transient-first-${id}`);
    assert.equal(
      (
        await call(`/api/queues/%2F/${queue}`, {
          method: 'PUT',
          body: JSON.stringify({
            durable: true,
            auto_delete: false,
            arguments: {},
          }),
        })
      ).status,
      201,
    );
    const sentinel = `message-${id}`;
    const published = await call('/api/exchanges/%2F/amq.default/publish', {
      method: 'POST',
      body: JSON.stringify({
        routing_key: queue,
        payload: sentinel,
        payload_encoding: 'string',
        properties: { delivery_mode: 2 },
      }),
    });
    assert.equal(published.status, 200);
    assert.equal((await published.json()).routed, true);
    execute(['stop', '--time', '30', name]);
    execute(['rm', name]);
    call = await launch(`transient-second-${id}`);
    const response = await call(`/api/queues/%2F/${queue}/get`, {
      method: 'POST',
      body: JSON.stringify({
        count: 1,
        ackmode: 'ack_requeue_false',
        encoding: 'auto',
        truncate: 50000,
      }),
    });
    assert.equal(
      response.status,
      200,
      'durable queue must remain available after replacement',
    );
    const messages = await response.json();
    assert.equal(
      messages.length,
      1,
      'durable queued message must survive replacement',
    );
    assert.equal(messages[0].payload, sentinel);
    assert.equal(messages[0].properties.delivery_mode, 2);
  },
);
