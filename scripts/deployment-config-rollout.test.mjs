import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import parsers from '@stoplight/spectral-parsers';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function render(directory) {
  const text = execFileSync(
    process.env.EQUIPMENT_KUBECTL ?? 'kubectl',
    ['kustomize', join(directory, 'deploy/environments/local')],
    { encoding: 'utf8', timeout: 15000 },
  );
  return text
    .split(/^---\s*$/m)
    .filter((part) => part.trim())
    .map((part) => parsers.Yaml.parse(part).data);
}
function deployment(resources, name) {
  return resources.find(
    (entry) => entry.kind === 'Deployment' && entry.metadata.name === name,
  );
}
function change(path, before, after) {
  const original = readFileSync(path, 'utf8');
  assert.ok(original.includes(before));
  writeFileSync(path, original.replace(before, after));
}

test('public configuration updates change consuming pod templates while preserving service and durable volume identities', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'equipment-config-rollout-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  cpSync(join(root, 'deploy'), join(directory, 'deploy'), { recursive: true });
  const before = render(directory);
  change(
    join(directory, 'deploy/environments/local/configuration.yaml'),
    'https://identity.equipment.test/realms/equipment',
    'https://identity.example.test/realms/equipment',
  );
  const runtimeChanged = render(directory);
  for (const name of ['inventory', 'reservations', 'notifications']) {
    assert.notDeepEqual(
      deployment(before, name).spec.template,
      deployment(runtimeChanged, name).spec.template,
      `${name} must roll after runtime config update`,
    );
  }
  change(
    join(directory, 'deploy/environments/local/web-configuration.yaml'),
    'https://identity.equipment.test/realms/equipment',
    'https://identity.example.test/realms/equipment',
  );
  const webChanged = render(directory);
  assert.notDeepEqual(
    deployment(runtimeChanged, 'web').spec.template,
    deployment(webChanged, 'web').spec.template,
    'frontend must roll after public auth config update',
  );
  change(
    join(directory, 'deploy/environments/local/proxy-configuration.yaml'),
    'proxy_read_timeout 15s',
    'proxy_read_timeout 16s',
  );
  const proxyChanged = render(directory);
  assert.notDeepEqual(
    deployment(webChanged, 'web').spec.template,
    deployment(proxyChanged, 'web').spec.template,
    'frontend must roll after proxy config update',
  );
  for (const kind of ['Service', 'PersistentVolumeClaim']) {
    assert.deepEqual(
      before.filter((entry) => entry.kind === kind),
      proxyChanged.filter((entry) => entry.kind === kind),
    );
  }
});

test('broker definitions init receives authenticated production telemetry configuration', () => {
  const resources = render(root);
  const pod = deployment(resources, 'rabbitmq').spec.template.spec;
  const init = pod.initContainers.find((entry) => entry.name === 'definitions');
  const runtimeName = init.envFrom?.find((entry) => entry.configMapRef)
    ?.configMapRef.name;
  const configuration = resources.find(
    (entry) =>
      entry.kind === 'ConfigMap' && entry.metadata.name === runtimeName,
  );
  assert.equal(
    configuration?.data.OTEL_EXPORTER_OTLP_ENDPOINT,
    'http://dashboard:18889',
  );
  assert.equal(configuration.data.OTEL_EXPORTER_OTLP_PROTOCOL, 'grpc');
  assert.equal(
    init.env.find((entry) => entry.name === 'OTEL_EXPORTER_OTLP_HEADERS')
      ?.value,
    'x-otlp-api-key=$(OTLP_KEY)',
  );
  assert.deepEqual(
    init.env.find((entry) => entry.name === 'OTLP_KEY')?.valueFrom.secretKeyRef,
    { name: 'equipment-credentials', key: 'dashboardOtlp' },
  );
  assert.equal(
    init.env.find((entry) => entry.name === 'OTEL_SERVICE_NAME')?.value,
    'broker-bootstrap',
  );
  assert.ok(
    init.volumeMounts.some(
      (entry) =>
        entry.name === 'trust' &&
        entry.mountPath === '/trust' &&
        entry.readOnly,
    ),
  );
  assert.equal(
    pod.volumes.find((entry) => entry.name === 'trust')?.configMap.name,
    'equipment-ca',
  );
});
