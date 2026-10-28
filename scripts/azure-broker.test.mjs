import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  chmodSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { request } from 'node:http';
import { request as secureRequest } from 'node:https';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import test from 'node:test';
import { executeProcess } from './process.mjs';
import { removeAzureFixtureDirectory } from './azure-runtime-fixture.mjs';

const root = resolve(import.meta.dirname, '..');
const directory = resolve(root, 'deploy/platform/azure/recovery/monitor');

// Design: configuration rendering plus the actual pinned RabbitMQ and Nginx
// providers establish the backup monitor boundary. No fabricated queue counters
// or HTTP double can establish message permissions, TLS, or unacked delivery.
test('broker monitor accepts only the exact raw GET queue route and verifies upstream TLS without credentials or logs', () => {
  const configuration = readFileSync(resolve(directory, 'nginx.conf'), 'utf8');
  assert.match(configuration, /proxy_ssl_verify on;/);
  assert.match(
    configuration,
    /proxy_ssl_name rabbitmq\.equipment\.svc\.cluster\.local;/,
  );
  assert.match(
    configuration,
    /\$request_uri != "\/api\/queues\/equipment\/reservation-notifications"/,
  );
  assert.match(configuration, /\$request_method != GET/);
  assert.match(configuration, /access_log off;/);
  assert.match(configuration, /error_log \/dev\/null/);
  assert.ok(
    configuration.includes(
      'proxy_pass https://rabbitmq.equipment.svc.cluster.local:15671/api/queues/equipment/reservation-notifications?disable_stats=true&enable_queue_totals=true;',
    ),
  );
  assert.equal(configuration.includes('envsubst'), false);
  const pod = JSON.parse(readFileSync(resolve(directory, 'pod.json'), 'utf8'));
  assert.equal(pod.metadata.name, 'equipment-broker-monitor');
  assert.equal(pod.spec.automountServiceAccountToken, false);
  assert.equal(pod.spec.containers[0].env, undefined);
  assert.equal(
    pod.spec.volumes.some((volume) => volume.csi),
    false,
  );
  assert.equal(pod.spec.containers[0].resources.limits.memory, '64Mi');
  assert.deepEqual(
    pod.spec.volumes.find((volume) => volume.name === 'trust').secret.items,
    [{ key: 'ca.crt', path: 'ca.crt' }],
  );
});

test(
  'native broker monitoring bypasses frozen sampled statistics for current ready and unacked totals while denying resource authority and alternate routes',
  {
    skip: process.env.AZURE_PROVIDER_CONTRACTS !== '1',
    timeout: 240000,
  },
  async () => {
    const temporary = mkdtempSync(resolve(tmpdir(), 'equipment-azure-broker-'));
    const pod = 'equipment-azure-broker-' + randomUUID();
    const administratorPassword = randomUUID();
    const monitorPassword = randomUUID();
    const image =
      'docker.io/library/rabbitmq@sha256:54cb013d76cd1fd6c0a0708f34062ad61c452bb6f016b434c6c33f1a765d2b58';
    const proxy = JSON.parse(
      readFileSync(resolve(directory, 'pod.json'), 'utf8'),
    ).spec.containers[0];
    const run = (args) =>
      executeProcess('podman', args, {
        operation: 'Pinned broker monitor provider contract',
        tool: 'podman',
        output: 'private-capture',
        timeout: 120000,
        maxBuffer: 1024 * 1024,
      });
    const project = resolve(
      root,
      'scripts/fixtures/azure-broker/AzureBrokerFixture.csproj',
    );
    const assembly = resolve(
      root,
      'scripts/fixtures/azure-broker/bin/Debug/net10.0/AzureBrokerFixture.dll',
    );
    const dotnet = (args, env = process.env) =>
      executeProcess('dotnet', args, {
        operation: 'Pinned native AMQP fixture',
        tool: 'dotnet',
        output: 'private-capture',
        env,
        timeout: 120000,
        maxBuffer: 1024 * 1024,
      });
    const http = (
      port,
      path,
      method = 'GET',
      password = monitorPassword,
      tls,
      payload,
    ) =>
      new Promise((accept, reject) => {
        const operation = (tls ? secureRequest : request)(
          {
            hostname: '127.0.0.1',
            port,
            path,
            method,
            ...(tls ? { ca: tls } : {}),
            headers: {
              ...(payload
                ? {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(
                      JSON.stringify(payload),
                    ),
                  }
                : {}),
              Authorization:
                'Basic ' +
                Buffer.from(`equipment_backup_monitor:${password}`).toString(
                  'base64',
                ),
            },
          },
          (response) => {
            let body = Buffer.alloc(0);
            response.on('data', (data) => {
              body = Buffer.concat([body, data]);
              if (body.length > 65536)
                operation.destroy(
                  new Error('Broker fixture response exceeded its bound.'),
                );
            });
            response.on('end', () =>
              accept({
                status: response.statusCode,
                body: body.toString('utf8'),
              }),
            );
            response.on('error', () =>
              reject(new Error('Broker fixture response failed.')),
            );
          },
        );
        operation.setTimeout(10000, () =>
          operation.destroy(new Error('Broker fixture request timed out.')),
        );
        operation.on('error', () =>
          reject(new Error('Broker fixture transport failed.')),
        );
        operation.end(payload ? JSON.stringify(payload) : undefined);
      });
    const port = (name) =>
      Number(
        run(['port', pod + '-rabbit', `${name}/tcp`])
          .trim()
          .match(/127\.0\.0\.1:(\d+)/)?.[1],
      );
    let created = false;
    let holder;
    let holderOutput = '';
    let holderError = '';
    let holderFailed = false;
    const marker = async (value) => {
      for (let attempt = 0; attempt < 200; attempt++) {
        if (holderOutput.split(/\r?\n/).includes(value)) return;
        if (holderFailed || holder.exitCode !== null)
          throw new Error(
            'Native AMQP fixture ended before the expected protocol state.',
          );
        await wait(100);
      }
      throw new Error('Native AMQP fixture protocol exceeded its bound.');
    };
    try {
      const tls = resolve(temporary, 'tls');
      const definitions = resolve(temporary, 'definitions');
      mkdirSync(tls);
      mkdirSync(definitions);
      const openssl =
        process.platform === 'win32'
          ? 'C:/Program Files/Git/usr/bin/openssl.exe'
          : 'openssl';
      for (const name of ['server', 'untrusted']) {
        executeProcess(
          openssl,
          [
            'req',
            '-x509',
            '-newkey',
            'rsa:2048',
            '-nodes',
            '-keyout',
            resolve(tls, name + '.key'),
            '-out',
            resolve(tls, name + '.crt'),
            '-days',
            '1',
            '-subj',
            '/CN=rabbitmq.equipment.svc.cluster.local',
            '-addext',
            'subjectAltName=DNS:rabbitmq.equipment.svc.cluster.local,IP:127.0.0.1',
          ],
          {
            operation: 'Ephemeral broker TLS fixture',
            tool: 'openssl',
            output: 'private-capture',
            timeout: 30000,
          },
        );
        chmodSync(resolve(tls, name + '.key'), 0o644);
      }
      writeFileSync(
        resolve(tls, 'tls.crt'),
        readFileSync(resolve(tls, 'server.crt')),
      );
      writeFileSync(
        resolve(tls, 'tls.key'),
        readFileSync(resolve(tls, 'server.key')),
      );
      writeFileSync(
        resolve(tls, 'ca.crt'),
        readFileSync(resolve(tls, 'server.crt')),
      );
      const user = (name, password, tags) => {
        const salt = randomBytes(4);
        return {
          name,
          password_hash: Buffer.concat([
            salt,
            createHash('sha256').update(salt).update(password).digest(),
          ]).toString('base64'),
          hashing_algorithm: 'rabbit_password_hashing_sha256',
          tags,
        };
      };
      writeFileSync(
        resolve(definitions, 'application.json'),
        JSON.stringify({
          users: [
            user('fixture-admin', administratorPassword, ['administrator']),
          ],
          vhosts: [{ name: 'equipment' }],
          permissions: [
            {
              user: 'fixture-admin',
              vhost: 'equipment',
              configure: '.*',
              write: '.*',
              read: '.*',
            },
          ],
          exchanges: [
            {
              name: 'reservations',
              vhost: 'equipment',
              type: 'direct',
              durable: true,
              auto_delete: false,
              arguments: {},
            },
          ],
          queues: [
            {
              name: 'reservation-notifications',
              vhost: 'equipment',
              durable: true,
              auto_delete: false,
              arguments: {},
            },
          ],
          bindings: [
            {
              source: 'reservations',
              vhost: 'equipment',
              destination: 'reservation-notifications',
              destination_type: 'queue',
              routing_key: 'reservation.confirmed',
              arguments: {},
            },
          ],
        }),
      );
      writeFileSync(
        resolve(definitions, 'monitor.json'),
        JSON.stringify({
          users: [
            user('equipment_backup_monitor', monitorPassword, ['monitoring']),
          ],
          permissions: [
            {
              user: 'equipment_backup_monitor',
              vhost: 'equipment',
              configure: '^$',
              write: '^$',
              read: '^$',
            },
          ],
        }),
      );
      writeFileSync(
        resolve(temporary, 'nginx.conf'),
        readFileSync(resolve(directory, 'nginx.conf')),
      );
      writeFileSync(
        resolve(temporary, 'untrusted.conf'),
        readFileSync(resolve(directory, 'nginx.conf'), 'utf8')
          .replace('listen 8080;', 'listen 8081;')
          .replace('/trust/ca.crt', '/trust/untrusted.crt'),
      );
      created = true;
      run([
        'pod',
        'create',
        '--name',
        pod,
        '--add-host',
        'rabbitmq.equipment.svc.cluster.local:127.0.0.1',
        '--publish',
        '127.0.0.1::8080',
        '--publish',
        '127.0.0.1::8081',
        '--publish',
        '127.0.0.1::15671',
        '--publish',
        '127.0.0.1::5672',
      ]);
      run([
        'run',
        '--detach',
        '--name',
        pod + '-rabbit',
        '--pod',
        pod,
        '--user',
        '999:999',
        '--cap-drop',
        'ALL',
        '-e',
        'RABBITMQ_CONFIG_FILES=/configuration',
        '--tmpfs',
        '/var/lib/rabbitmq:mode=1777,size=128m',
        '-v',
        `${tls}:/management-tls:ro`,
        '-v',
        `${definitions}:/etc/rabbitmq/equipment-definitions.d:ro`,
        '-v',
        `${resolve(root, 'deploy/environments/azure/broker/rabbitmq.conf')}:/configuration/20-equipment.conf:ro`,
        image,
      ]);
      for (const [suffix, file] of [
        ['proxy', 'nginx.conf'],
        ['untrusted', 'untrusted.conf'],
      ])
        run([
          'run',
          '--detach',
          '--name',
          pod + '-' + suffix,
          '--pod',
          pod,
          '--read-only',
          '--user',
          '101:101',
          '--cap-drop',
          'ALL',
          '--tmpfs',
          '/tmp:mode=1777,size=16m',
          '-v',
          `${tls}:/trust:ro`,
          '-v',
          `${resolve(temporary, file)}:/configuration/nginx.conf:ro`,
          '--entrypoint',
          'nginx',
          proxy.image,
          '-c',
          '/configuration/nginx.conf',
          '-g',
          'daemon off;',
        ]);
      const httpPort = port(8080);
      const managementPort = port(15671);
      const queuePath = '/api/queues/equipment/reservation-notifications';
      const counters = async (ready, unacked) => {
        let observed = 'transport';
        for (let attempt = 0; attempt < 120; attempt++) {
          try {
            const response = await http(httpPort, queuePath);
            observed = `HTTP${response.status}`;
            if (response.status === 200) {
              const value = JSON.parse(response.body);
              observed = `HTTP200/state:${value.state === 'running' ? 'running' : 'other'}/ready:${Number.isSafeInteger(value.messages_ready) ? value.messages_ready : 'missing'}/unacked:${Number.isSafeInteger(value.messages_unacknowledged) ? value.messages_unacknowledged : 'missing'}`;
              if (
                value.name === 'reservation-notifications' &&
                value.vhost === 'equipment' &&
                value.state === 'running' &&
                value.messages_ready === ready &&
                value.messages_unacknowledged === unacked &&
                value.messages === ready + unacked
              )
                return;
            }
          } catch {
            // The bounded readiness loop tolerates connection refusal while the provider starts.
          }
          if (
            attempt % 10 === 9 &&
            JSON.parse(run(['inspect', pod + '-rabbit']))[0].State.Status ===
              'exited'
          )
            break;
          await wait(500);
        }
        const states = ['rabbit', 'proxy', 'untrusted']
          .map((name) => {
            const value = JSON.parse(run(['inspect', pod + '-' + name]))[0]
              .State;
            return `${name}:${value.Status}/${value.ExitCode}`;
          })
          .join(',');
        const logs = run(['logs', pod + '-rabbit']);
        const categories = [
          'BOOT FAILED',
          'failed_to_read',
          'unknown variable',
          'Permission denied',
          'bad configuration',
          'failed_to_prepare_configuration',
          'invalid',
          'TLS',
          'definitions',
        ].filter((value) => logs.includes(value));
        throw new Error(
          `Actual broker counters did not reach the bounded state: ${observed}; ${states}; provider categories:${categories.join(',')}.`,
        );
      };
      await counters(0, 0);
      assert.equal(
        (await http(httpPort, queuePath, 'GET', 'wrong-fixture-password'))
          .status,
        401,
      );
      for (const [path, method] of [
        [queuePath, 'POST'],
        [queuePath + '/get', 'POST'],
        ['/api/users', 'GET'],
        ['/api/policies/equipment/probe', 'PUT'],
        ['/api/queues/%65quipment/reservation-notifications', 'GET'],
        [queuePath + '?columns=messages', 'GET'],
        [queuePath + '?disable_stats=true&enable_queue_totals=true', 'GET'],
        [queuePath + '/', 'GET'],
      ])
        assert.ok(
          [404, 405].includes((await http(httpPort, path, method)).status),
        );
      const ca = readFileSync(resolve(tls, 'ca.crt'));
      assert.equal(
        (await http(managementPort, queuePath, 'GET', monitorPassword, ca))
          .status,
        200,
      );
      for (const [path, method, payload] of [
        [
          queuePath + '/get',
          'POST',
          {
            count: 1,
            ackmode: 'ack_requeue_true',
            encoding: 'auto',
            truncate: 100,
          },
        ],
        [queuePath, 'DELETE'],
        [
          queuePath,
          'PUT',
          { durable: true, auto_delete: false, arguments: {} },
        ],
        [
          '/api/users/probe',
          'PUT',
          { password: 'fixture-rejected', tags: 'administrator' },
        ],
        [
          '/api/policies/equipment/probe',
          'PUT',
          {
            pattern: '.*',
            definition: { 'max-length': 1 },
            'apply-to': 'queues',
          },
        ],
      ])
        assert.ok(
          [401, 403].includes(
            (
              await http(
                managementPort,
                path,
                method,
                monitorPassword,
                ca,
                payload,
              )
            ).status,
          ),
          `The authenticated monitor unexpectedly gained ${method} authority on the fixed test route.`,
        );
      const rejectedTLS = await http(port(8081), queuePath);
      assert.equal(rejectedTLS.status, 502);
      assert.equal(
        rejectedTLS.body,
        '{"error":"broker monitoring unavailable"}',
      );
      dotnet([
        'restore',
        project,
        '--locked-mode',
        '--packages',
        resolve(root, '.cache/azure-broker-nuget'),
      ]);
      dotnet(['build', project, '--no-restore', '-warnaserror']);
      const env = {
        ...process.env,
        BROKER_HOST: '127.0.0.1',
        BROKER_PORT: String(port(5672)),
        BROKER_USER: 'equipment_backup_monitor',
        BROKER_PASSWORD: monitorPassword,
        BROKER_MODE: 'denied',
      };
      assert.equal(dotnet([assembly], env).trim(), 'denied');
      // Freeze only the test broker's asynchronous management collector. The
      // queue process remains live and confirmed AMQP publication is independent.
      run([
        'exec',
        pod + '-rabbit',
        'rabbitmqctl',
        '-q',
        'eval',
        'sys:suspend(rabbit_mgmt_metrics_collector:name(queue_coarse_metrics)).',
      ]);
      holder = spawn('dotnet', [assembly], {
        cwd: root,
        env: {
          ...env,
          BROKER_USER: 'fixture-admin',
          BROKER_PASSWORD: administratorPassword,
          BROKER_MODE: 'hold',
        },
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120000,
      });
      holder.on('error', () => {
        holderFailed = true;
      });
      holder.stdin.on('error', () => {
        holderFailed = true;
      });
      holder.stdout.on('data', (data) => {
        holderOutput += data;
        if (holderOutput.length > 8192) {
          holderFailed = true;
          holder.kill();
        }
      });
      holder.stderr.on('data', (data) => {
        holderError += data;
        if (holderError.length > 8192) {
          holderFailed = true;
          holder.kill();
        }
      });
      await marker('published');
      const cached = await http(
        managementPort,
        queuePath,
        'GET',
        monitorPassword,
        ca,
      );
      assert.equal(cached.status, 200);
      assert.equal(
        JSON.parse(cached.body).messages_ready,
        0,
        'Collector-suspended control did not preserve pre-publication zero.',
      );
      const current = await http(
        managementPort,
        queuePath + '?disable_stats=true&enable_queue_totals=true',
        'GET',
        monitorPassword,
        ca,
      );
      assert.equal(current.status, 200);
      assert.equal(JSON.parse(current.body).type, 'classic');
      assert.equal(
        JSON.parse(current.body).messages_ready,
        1,
        'Direct queue-process totals did not observe confirmed publication.',
      );
      const monitored = await http(httpPort, queuePath);
      assert.equal(monitored.status, 200);
      assert.equal(
        JSON.parse(monitored.body).messages_ready,
        1,
        'Monitor accepted cached zero after confirmed publication.',
      );
      await counters(1, 0);
      holder.stdin.write('get\n');
      await marker('unacked');
      await counters(0, 1);
      holder.stdin.write('ack\n');
      await marker('acked');
      await counters(0, 0);
      const logs =
        run(['logs', pod + '-rabbit']) +
        run(['logs', pod + '-proxy']) +
        run(['logs', pod + '-untrusted']) +
        holderError;
      for (const password of [administratorPassword, monitorPassword])
        assert.equal(logs.includes(password), false);
    } finally {
      const failures = [];
      if (holder) {
        try {
          holder.stdin.end('exit\n');
          if (holder.exitCode === null) {
            holder.kill();
            await new Promise((accept) => holder.once('close', accept));
          }
        } catch {
          failures.push('fixture process');
        }
      }
      if (created) {
        try {
          run(['pod', 'rm', '--force', '--ignore', pod]);
        } catch {
          failures.push('fixture pod');
        }
      }
      try {
        removeAzureFixtureDirectory(temporary, 'equipment-azure-broker-');
      } catch {
        failures.push('fixture files');
      }
      assert.deepEqual(failures, [], 'Owned broker provider cleanup failed.');
    }
  },
);
