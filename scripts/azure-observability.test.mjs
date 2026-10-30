import {
  finishNativeFixture,
  nativeHttpsStatus,
} from './azure-native-fixture.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';
import parsers from '@stoplight/spectral-parsers';
import { removeAzureFixtureDirectory } from './azure-runtime-fixture.mjs';

const root = resolve(import.meta.dirname, '..');
const binary =
  process.env.KUBECTL ??
  (process.platform === 'win32'
    ? resolve(root, '.cache/promotion-tools/kubectl.exe')
    : 'kubectl');
function resources() {
  return execFileSync(
    binary,
    ['kustomize', resolve(root, 'deploy/platform/azure/telemetry')],
    { encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
  )
    .split(/^---\s*$/m)
    .filter((text) => text.trim())
    .map((text) => parsers.Yaml.parse(text).data);
}
function named(documents, kind, name) {
  const found = documents.find(
    (item) =>
      item.kind === kind &&
      (item.metadata.name === name ||
        (kind === 'ConfigMap' && item.metadata.name.startsWith(name + '-'))),
  );
  assert.ok(found, `${kind}/${name} missing`);
  return found;
}

test('historical telemetry stays private with bounded stores and immutable provider images', () => {
  const documents = resources();
  for (const name of ['prometheus', 'loki', 'tempo']) {
    const claim = named(documents, 'PersistentVolumeClaim', name + '-data');
    assert.equal(claim.spec.resources.requests.storage, '8Gi');
    assert.equal(claim.spec.storageClassName, 'equipment-azure-retain');
    assert.match(
      claim.metadata.annotations['argocd.argoproj.io/sync-options'],
      /Prune=false/,
    );
    const service = named(documents, 'Service', name);
    assert.equal(service.spec.type, 'ClusterIP');
    const deployment = named(documents, 'Deployment', name);
    assert.equal(deployment.spec.template.spec.containers.length, 2);
    assert.equal(
      deployment.spec.template.spec.containers[0].args.some(
        (arg) => arg.includes('127.0.0.1') || arg.includes('/configuration/'),
      ),
      true,
    );
  }
  for (const deployment of documents.filter(
    (item) => item.kind === 'Deployment',
  ))
    for (const container of deployment.spec.template.spec.containers) {
      assert.match(container.image, /@sha256:[a-f0-9]{64}$/);
      assert.ok(container.resources.limits.memory);
    }
  assert.equal(
    documents.some((item) => item.kind === 'Ingress'),
    false,
  );
});

test('collector authenticates encrypted ingestion and fans all three signals into bounded private history', () => {
  const documents = resources();
  const config = parsers.Yaml.parse(
    named(documents, 'ConfigMap', 'otel-collector').data['collector.yaml'],
  ).data;
  assert.equal(
    config.receivers.otlp.protocols.grpc.auth.authenticator,
    'bearertokenauth/clients',
  );
  assert.equal(
    config.receivers.otlp.protocols.grpc.tls.cert_file,
    '/tls/tls.crt',
  );
  assert.equal(config.extensions['bearertokenauth/clients'].tokens.length, 6);
  assert.ok(
    config.service.pipelines.traces.exporters.includes('otlp_http/tempo'),
  );
  assert.ok(config.service.pipelines.logs.exporters.includes('otlp_http/loki'));
  assert.ok(
    config.service.pipelines.metrics.exporters.includes('otlp_http/prometheus'),
  );
  assert.equal(
    config.exporters['otlp_grpc/dashboard'].tls.ca_file,
    '/tls/ca.crt',
  );
  assert.equal(config.exporters['otlp_grpc/dashboard'].tls.insecure, undefined);
  assert.equal(
    Object.keys(config.exporters).some((key) => key.startsWith('debug')),
    false,
  );
  assert.equal(config.exporters['otlp_http/tempo'].timeout, '5s');
  assert.equal(
    config.exporters['otlp_http/tempo'].retry_on_failure.max_elapsed_time,
    '30s',
  );
});

test('native historical retention and proxies enforce time capacity and authentication independently', () => {
  const documents = resources();
  const prometheus = named(documents, 'Deployment', 'prometheus').spec.template
    .spec.containers[0];
  assert.ok(prometheus.args.includes('--storage.tsdb.retention.time=72h'));
  assert.ok(prometheus.args.includes('--storage.tsdb.retention.size=6GB'));
  const loki = parsers.Yaml.parse(
    named(documents, 'ConfigMap', 'loki').data['loki.yaml'],
  ).data;
  assert.equal(loki.compactor.retention_enabled, true);
  assert.equal(loki.limits_config.retention_period, '72h');
  const tempo = parsers.Yaml.parse(
    named(documents, 'ConfigMap', 'tempo').data['tempo.yaml'],
  ).data;
  assert.equal(tempo.live_store.wal.path, '/data/live-store');
  assert.equal(tempo.live_store.shutdown_marker_dir, '/data/shutdown-marker');
  assert.equal(
    tempo.backend_scheduler.provider.compaction.compaction.block_retention,
    '72h',
  );
  for (const name of ['prometheus', 'loki', 'tempo']) {
    const proxy = named(documents, 'ConfigMap', name + '-proxy').data[
      'nginx.conf.template'
    ];
    assert.match(proxy, /ssl_certificate \/tls\/tls.crt/);
    assert.match(proxy, /if \(\$authenticated = 0\) \{ return 401; \}/);
    assert.match(proxy, /access_log off/);
    assert.match(proxy, /error_log \/dev\/null/);
  }
});

const providerContracts = process.env.AZURE_PROVIDER_CONTRACTS === '1';

test(
  'pinned vendor binaries accept production telemetry configuration',
  { skip: !providerContracts },
  async () => {
    const { executeProcess } = await import('./process.mjs');
    const configurations = [
      {
        name: 'Collector',
        image:
          'ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib@sha256:7f22d2a6748110ffb6a59bc0df448bccbf501cdb667d610ede4c61d3863d5849',
        file: 'collector.yaml',
        args: ['validate', '--config=/configuration/collector.yaml'],
        environment: [
          'INVENTORY_TOKEN',
          'RESERVATIONS_TOKEN',
          'NOTIFICATIONS_TOKEN',
          'DATABASE_BOOTSTRAP_TOKEN',
          'IDENTITY_BOOTSTRAP_TOKEN',
          'BROKER_BOOTSTRAP_TOKEN',
          'PROMETHEUS_TOKEN',
          'LOKI_TOKEN',
          'TEMPO_TOKEN',
          'DASHBOARD_OTLP',
        ],
      },
      {
        name: 'Prometheus',
        image:
          'quay.io/prometheus/prometheus@sha256:fa3302279710be2f21a8301ec17a8b4f2301fd829bd113839b3b6b02b6f191a2',
        file: 'prometheus.yaml',
        entrypoint: '/bin/promtool',
        args: ['check', 'config', '/configuration/prometheus.yaml'],
      },
      {
        name: 'Loki',
        image:
          'docker.io/grafana/loki@sha256:0db216b630ae1f348a1584c67f3cead8b4c1fc839169a39501db664744158e28',
        file: 'loki.yaml',
        args: ['-config.file=/configuration/loki.yaml', '-verify-config=true'],
      },
      {
        name: 'Tempo',
        image:
          'docker.io/grafana/tempo@sha256:64e2fbd56d9c2b3412a4b430a58ea59e91a670b1e75f920a0c702213ad145044',
        file: 'tempo.yaml',
        args: ['-config.file=/configuration/tempo.yaml', '-config.verify=true'],
      },
    ];
    for (const configuration of configurations) {
      const args = ['run', '--rm'];
      if (configuration.entrypoint)
        args.push('--entrypoint', configuration.entrypoint);
      args.push(
        '-v',
        `${resolve(root, 'deploy/platform/azure/telemetry', configuration.file)}:/configuration/${configuration.file}:ro`,
      );
      const env = { ...process.env };
      for (const key of configuration.environment ?? []) {
        args.push('-e', key);
        env[key] = 'fixture-only-token';
      }
      args.push(configuration.image, ...configuration.args);
      assert.doesNotThrow(() =>
        executeProcess('podman', args, {
          operation: `${configuration.name} native configuration contract`,
          tool: 'podman',
          output: 'private-capture',
          env,
          timeout: 120000,
          maxBuffer: 1024 * 1024,
        }),
      );
    }
  },
);

test('Grafana remains internal and provisions authenticated correlated three-signal exploration', () => {
  const documents = resources();
  const grafana = named(documents, 'Deployment', 'grafana');
  const environment = Object.fromEntries(
    grafana.spec.template.spec.containers[0].env.map((item) => [
      item.name,
      item.value,
    ]),
  );
  assert.equal(environment.GF_AUTH_ANONYMOUS_ENABLED, 'false');
  assert.equal(environment.GF_SERVER_PROTOCOL, 'https');
  const data = parsers.Yaml.parse(
    named(documents, 'ConfigMap', 'grafana-datasources').data[
      'datasources.yaml'
    ],
  ).data;
  assert.deepEqual(
    data.datasources.map((source) => source.uid),
    ['prometheus', 'loki', 'tempo'],
  );
  for (const source of data.datasources) {
    assert.equal(source.jsonData.tlsSkipVerify, false);
    assert.equal(source.jsonData.httpHeaderName1, 'Authorization');
  }
  assert.equal(
    data.datasources[2].jsonData.tracesToLogsV2.datasourceUid,
    'loki',
  );
});

test('platform traffic is denied by default and collector ingress requires application identity labels', () => {
  const documents = resources();
  const denied = named(documents, 'NetworkPolicy', 'platform-default-deny');
  assert.deepEqual(denied.spec.podSelector, {});
  assert.deepEqual(denied.spec.policyTypes, ['Ingress', 'Egress']);
  const collector = named(documents, 'NetworkPolicy', 'collector-ingestion');
  assert.deepEqual(collector.spec.ingress[0].ports, [
    { protocol: 'TCP', port: 4317 },
  ]);
  assert.equal(
    collector.spec.ingress[0].from[0].namespaceSelector.matchLabels[
      'kubernetes.io/metadata.name'
    ],
    'equipment',
  );
  assert.ok(
    collector.spec.ingress[0].from[0].podSelector.matchExpressions[0].values.includes(
      'database-bootstrap',
    ),
  );
});

for (const service of ['prometheus', 'loki', 'tempo'])
  test(
    `native ${service} query API rejects missing credentials through the production TLS proxy`,
    { skip: !providerContracts },
    async () => {
      const production = named(resources(), 'Deployment', service).spec.template
        .spec.containers;
      const queryPath = {
        prometheus: '/api/v1/status/buildinfo',
        loki: '/loki/api/v1/labels',
        tempo: '/api/search',
      }[service];
      const { executeProcess } = await import('./process.mjs');
      const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync } =
        await import('node:fs');
      const { tmpdir } = await import('node:os');
      const { randomUUID } = await import('node:crypto');
      const { setTimeout: wait } = await import('node:timers/promises');
      const directory = mkdtempSync(
        resolve(tmpdir(), 'equipment-azure-proxy-'),
      );
      const pod = 'equipment-azure-proxy-' + randomUUID();
      let created = false;
      let primary;
      let phase = 'tls-generate';
      const run = (args, env = process.env) =>
        executeProcess('podman', args, {
          operation: `Native fixture ${phase}`,
          tool: 'podman',
          output: 'private-capture',
          env,
          timeout: 120000,
          maxBuffer: 1024 * 1024,
        });
      try {
        const tls = resolve(directory, 'tls');
        mkdirSync(tls);
        const openssl =
          process.platform === 'win32'
            ? 'C:/Program Files/Git/usr/bin/openssl.exe'
            : 'openssl';
        executeProcess(
          openssl,
          [
            'req',
            '-x509',
            '-newkey',
            'rsa:2048',
            '-nodes',
            '-keyout',
            resolve(tls, 'tls.key'),
            '-out',
            resolve(tls, 'tls.crt'),
            '-days',
            '1',
            '-subj',
            '/CN=localhost',
            '-addext',
            'subjectAltName=DNS:localhost,IP:127.0.0.1',
          ],
          {
            operation: 'Ephemeral fixture TLS certificate',
            tool: 'openssl',
            output: 'private-capture',
            timeout: 30000,
            maxBuffer: 1024 * 1024,
          },
        );
        chmodSync(resolve(tls, 'tls.key'), 0o644);
        writeFileSync(
          resolve(directory, 'proxy.conf'),
          readFileSync(
            resolve(
              root,
              `deploy/platform/azure/telemetry/${service}-proxy.conf`,
            ),
          ),
        );
        phase = 'tls-start';
        created = true;
        run(['pod', 'create', '--name', pod, '--publish', '127.0.0.1::8443']);
        run([
          'run',
          '--detach',
          '--pod',
          pod,
          '--name',
          pod + '-' + service,
          '--read-only',
          '--user',
          '10001:10001',
          '--tmpfs',
          '/data:mode=1777,size=64m',
          '--tmpfs',
          '/tmp:mode=1777,size=16m',
          '-v',
          `${resolve(root, 'deploy/platform/azure/telemetry', service + '.yaml')}:/configuration/${service}.yaml:ro`,
          production[0].image,
          ...production[0].args,
        ]);
        run(
          [
            'run',
            '--detach',
            '--pod',
            pod,
            '--name',
            pod + '-proxy',
            '--read-only',
            '--user',
            '10001:10001',
            '--tmpfs',
            '/tmp:mode=1777,size=16m',
            '-v',
            `${resolve(directory, 'proxy.conf')}:/proxy/nginx.conf.template:ro`,
            '-v',
            `${tls}:/tls:ro`,
            '-e',
            'API_TOKEN',
            '--entrypoint',
            '/bin/sh',
            production[1].image,
            '-ec',
            "envsubst '$API_TOKEN' < /proxy/nginx.conf.template > /tmp/nginx.conf; exec nginx -c /tmp/nginx.conf -g 'daemon off;'",
          ],
          { ...process.env, API_TOKEN: 'fixture-only-native-token' },
        );
        const infra = run([
          'pod',
          'inspect',
          '--format',
          '{{.InfraContainerID}}',
          pod,
        ]).trim();
        assert.match(infra, /^[a-f0-9]{64}$/);
        const binding = run(['port', infra, '8443/tcp']).trim();
        assert.match(binding, /^127\.0\.0\.1:\d+$/);
        const request = (path, token) =>
          nativeHttpsStatus({
            url: `https://${binding}${path}`,
            ca: readFileSync(resolve(tls, 'tls.crt')),
            token,
          });
        phase = 'tls-health';
        const deadline = Date.now() + 60000;
        let ready = false;
        while (Date.now() < deadline) {
          try {
            ready = (await request('/healthz')) === 200;
          } catch {
            ready = false;
          }
          if (ready) break;
          await wait(250);
          if (
            run([
              'inspect',
              '--format',
              '{{.State.Status}}',
              pod + '-' + service,
            ]).trim() === 'exited'
          )
            break;
        }
        if (!ready) {
          const states = [service, 'proxy'].map((name) =>
            run([
              'inspect',
              '--format',
              '{{.State.Status}}',
              pod + '-' + name,
            ]).trim(),
          );
          const logs = [service, 'proxy'].map((name) => {
            const container = pod + '-' + name;
            if (!/^[a-z0-9-]+$/.test(container))
              throw new Error('Fixture container name rejected.');
            const command = process.platform === 'win32' ? 'cmd.exe' : 'sh';
            const args =
              process.platform === 'win32'
                ? ['/d', '/s', '/c', `podman logs ${container} 2>&1`]
                : ['-c', 'podman logs "$1" 2>&1', 'fixture', container];
            return executeProcess(command, args, {
              operation: 'Private fixture provider diagnosis',
              tool: 'podman',
              output: 'private-capture',
              timeout: 15000,
              maxBuffer: 1024 * 1024,
            });
          });
          const categories = logs.map((log) => {
            for (const [pattern, category] of [
              [/permission denied/i, 'permission-denied'],
              [/read-only file system/i, 'read-only-filesystem'],
              [/no such file/i, 'missing-file'],
              [/unknown|invalid/i, 'invalid-configuration'],
              [/error|failed/i, 'provider-error'],
            ]) {
              if (pattern.test(log)) return category;
            }
            return 'no-known-error';
          });
          assert.fail(
            `Native readiness failed; states=${states.join(',')}; categories=${categories.join(',')}.`,
          );
        }
        phase = 'tls-query-missing-auth';
        assert.equal(await request(queryPath), 401);
        phase = 'tls-query-wrong-auth';
        assert.equal(await request(queryPath, 'incorrect-fixture-token'), 401);
        phase = 'tls-query-valid-auth';
        assert.equal(
          await request(queryPath, 'fixture-only-native-token'),
          200,
        );
      } catch (error) {
        primary = error;
      } finally {
        await finishNativeFixture({
          primary,
          phase,
          cleanups: [
            {
              phase: 'pod-delete',
              tool: 'podman',
              run: () => {
                if (created) run(['pod', 'rm', '--force', '--ignore', pod]);
              },
            },
            {
              phase: 'private-directory-remove',
              tool: 'fixture',
              run: () =>
                removeAzureFixtureDirectory(
                  directory,
                  'equipment-azure-proxy-',
                ),
            },
          ],
        });
      }
    },
  );
