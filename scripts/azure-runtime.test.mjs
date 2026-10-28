import {
  createGeneratorInput,
  generatorInputHash,
  generatorInputSchemaVersion,
} from './azure-generator-input.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import parsers from '@stoplight/spectral-parsers';
import {
  renderRuntimeProjection,
  renderVerificationResources,
  workloadSecrets,
} from './azure-runtime.mjs';
import {
  azureRuntimeFixtureInput,
  stageAzureFixture,
  removeAzureFixtureDirectory,
} from './azure-runtime-fixture.mjs';

const id = '22222222-2222-4222-8222-222222222222';
const root = resolve(import.meta.dirname, '..');
const revision = 'a'.repeat(40);
const input = () => createGeneratorInput(azureRuntimeFixtureInput());

test('public runtime projection omits private ACME contact from both issuers and all fourteen generated files', () => {
  const fixture = azureRuntimeFixtureInput();
  fixture.config.acmeEmail = 'PRIVATE_CONTACT+fixture@example.invalid';
  const projection = renderRuntimeProjection(createGeneratorInput(fixture));
  const issuers = JSON.parse(
    projection.platformFiles['identities.json'],
  ).items.filter((item) => item.kind === 'ClusterIssuer');
  assert.equal(issuers.length, 2);
  for (const issuer of issuers)
    assert.equal(Object.hasOwn(issuer.spec.acme, 'email'), false);
  const serialized = JSON.stringify(projection);
  assert.equal(serialized.includes('PRIVATE_CONTACT'), false);
  assert.equal(serialized.includes('acmeEmail'), false);
});

test('renderer accepts only the shared public tuple and ignores unused private roots only through its explicit projector', () => {
  const roots = azureRuntimeFixtureInput();
  assert.throws(() => renderRuntimeProjection(roots), /generator input/i);
  const expected = renderRuntimeProjection(createGeneratorInput(roots));
  roots.config.acmeEmail = 'PRIVATE_CONTACT+changed@example.invalid';
  roots.config.region = 'unused-region';
  roots.foundation.acr_login_server = 'unused.azurecr.io';
  assert.deepEqual(
    renderRuntimeProjection(createGeneratorInput(roots)),
    expected,
  );
  const changed = createGeneratorInput(roots);
  changed.environment.ingress_public_ip = '203.0.113.9';
  assert.notEqual(
    renderRuntimeProjection(changed).outputHash,
    expected.outputHash,
  );
});

test('continuity bindings are an exact installer-only six-object projection with actor-specific principals', () => {
  const fixture = input();
  fixture.foundation.github_principal_ids.backup =
    '11111111-1111-4111-8111-111111111111';
  fixture.foundation.github_principal_ids.restore =
    '33333333-3333-4333-8333-333333333333';
  const projection = renderRuntimeProjection(fixture);
  const file = projection.platformFiles['recovery-continuity-bindings.json'];
  assert.ok(file, 'Missing protected activation-only bindings.');
  const bindings = JSON.parse(file).items;
  assert.equal(bindings.length, 6);
  for (const actor of ['backup', 'restore']) {
    for (const namespace of ['cert-manager', 'argocd']) {
      const binding = bindings.find(
        (item) =>
          item.metadata.name === `equipment-recovery-${actor}-continuity` &&
          item.metadata.namespace === namespace,
      );
      assert.equal(binding.kind, 'RoleBinding');
      assert.deepEqual(binding.roleRef, {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'Role',
        name: binding.metadata.name,
      });
      assert.deepEqual(binding.subjects, [
        {
          apiGroup: 'rbac.authorization.k8s.io',
          kind: 'User',
          name: fixture.foundation.github_principal_ids[actor],
        },
      ]);
    }
    const binding = bindings.find(
      (item) =>
        item.kind === 'ClusterRoleBinding' &&
        item.metadata.name === `equipment-recovery-${actor}-issuers`,
    );
    assert.equal(binding.metadata.namespace, undefined);
    assert.deepEqual(binding.roleRef, {
      apiGroup: 'rbac.authorization.k8s.io',
      kind: 'ClusterRole',
      name: binding.metadata.name,
    });
    assert.deepEqual(binding.subjects, [
      {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'User',
        name: fixture.foundation.github_principal_ids[actor],
      },
    ]);
  }
  for (const files of [
    projection.applicationFiles,
    projection.platformFiles,
    projection.recoveryFiles,
  ]) {
    assert.equal(
      files['kustomization.yaml'].includes('recovery-continuity-bindings.json'),
      false,
    );
  }
});

test('runtime projection produces stable reviewed components and per-workload secret authority', () => {
  const first = renderRuntimeProjection(input());
  assert.deepEqual(renderRuntimeProjection(input()), first);
  assert.match(first.outputHash, /^[a-f0-9]{64}$/);
  assert.equal(first.outputHash, generatorInputHash(input()));
  assert.equal(
    JSON.parse(first.applicationFiles['projection.json']).version,
    generatorInputSchemaVersion,
  );
  assert.equal(first.generation, 'test1234');
  const resources = JSON.parse(first.applicationFiles['identities.json']);
  const inventory = resources.items.find(
    (item) =>
      item.kind === 'SecretProviderClass' && item.metadata.name === 'inventory',
  );
  assert.deepEqual(
    inventory.spec.secretObjects[0].data.map((entry) => entry.key),
    ['inventoryDb', 'otlpToken'],
  );
  assert.equal(
    inventory.spec.parameters.objects.includes('identity-admin'),
    false,
  );
  assert.equal(
    resources.items.some((item) => item.kind === 'Secret'),
    false,
  );
  assert.equal(
    JSON.parse(first.applicationFiles['projection.json']).sourceRevision,
    revision,
  );
  assert.equal(
    JSON.parse(first.platformFiles['projection.json']).outputHash,
    first.outputHash,
  );
});

test('runtime projection rejects missing runtime identifiers and unsafe admission', () => {
  for (const mutate of [
    (value) => delete value.environment.workload_client_ids.inventory,
    (value) =>
      (value.environment.workload_client_ids.inventory = 'placeholder'),
    (value) => (value.config.operatorCidrs = ['0.0.0.0/0']),
    (value) => (value.config.acmeTermsAccepted = false),
  ]) {
    const value = input();
    mutate(value);
    assert.throws(() => renderRuntimeProjection(value), /generator input/i);
  }
});

test('reviewed runtime component renders immutable Azure application with retained storage', () => {
  const directory = mkdtempSync(join(tmpdir(), 'equipment-azure-render-'));
  try {
    stageAzureFixture(directory);
    const binary =
      process.env.KUBECTL ??
      (process.platform === 'win32'
        ? resolve(import.meta.dirname, '../.cache/promotion-tools/kubectl.exe')
        : 'kubectl');
    const platformRendered = execFileSync(
      binary,
      ['kustomize', join(directory, 'deploy/platform/azure')],
      { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 },
    );
    assert.ok(platformRendered.includes('kind: ClusterIssuer'));
    assert.ok(platformRendered.includes('kind: NetworkPolicy'));
    const rendered = execFileSync(
      binary,
      ['kustomize', join(directory, 'deploy/environments/azure')],
      { encoding: 'utf8', timeout: 30000 },
    );
    const documents = rendered
      .split(/^---\s*$/m)
      .filter((text) => text.trim())
      .map((text) => parsers.Yaml.parse(text).data);
    for (const name of ['postgres-data', 'rabbitmq-data', 'dashboard-data']) {
      const claim = documents.find(
        (item) =>
          item.kind === 'PersistentVolumeClaim' && item.metadata.name === name,
      );
      assert.equal(claim.spec.storageClassName, 'equipment-azure-retain');
      assert.equal(claim.spec.volumeName, undefined);
    }
    const dashboardRoute = documents.find(
      (item) =>
        item.kind === 'IngressRoute' && item.metadata.name === 'dashboard',
    );
    assert.ok(
      dashboardRoute.spec.routes[0].match.includes('!PathPrefix(`/api`)'),
    );
    assert.deepEqual(dashboardRoute.spec.routes[0].middlewares, [
      { name: 'operator-source' },
    ]);
    const dashboard = documents.find(
      (item) =>
        item.kind === 'Deployment' && item.metadata.name === 'dashboard',
    );
    const dashboardEnv = Object.fromEntries(
      dashboard.spec.template.spec.containers[0].env.map((item) => [
        item.name,
        item.value,
      ]),
    );
    assert.equal(
      dashboard.spec.template.spec.containers[0].startupProbe.tcpSocket.port,
      18888,
    );
    assert.equal(
      dashboardEnv.DOTNET_DASHBOARD_OTLP_ENDPOINT_URL,
      'https://+:18889',
    );
    assert.equal(
      dashboardEnv.Kestrel__Certificates__Default__Path,
      '/internal-tls/tls.crt',
    );
    for (const workload of documents.filter((item) =>
      ['Deployment', 'Job'].includes(item.kind),
    )) {
      const spec = workload.spec.template.spec;
      assert.equal(
        (spec.volumes ?? []).some(
          (volume) => volume.configMap?.name === 'equipment-ca',
        ),
        false,
      );
      for (const container of [
        ...(spec.initContainers ?? []),
        ...spec.containers,
      ]) {
        if (
          container.env?.some(
            (entry) => entry.name === 'OTEL_EXPORTER_OTLP_CERTIFICATE',
          )
        ) {
          assert.ok(
            container.volumeMounts.some(
              (mount) =>
                mount.name === 'otlp-trust' &&
                mount.mountPath === '/otlp-trust',
            ),
          );
          assert.equal(
            spec.volumes.find((volume) => volume.name === 'otlp-trust').secret
              .secretName,
            'collector-trust',
          );
        }
      }
    }
    for (const deployment of documents.filter(
      (item) => item.kind === 'Deployment',
    )) {
      assert.equal(
        deployment.spec.template.spec.containers.every((container) =>
          container.image.includes('@sha256:'),
        ),
        true,
      );
    }
  } finally {
    removeAzureFixtureDirectory(directory, 'equipment-azure-render-');
  }
});

test('optional recovery renders independently and initial platform contains no recovery credentials or SQL jobs', () => {
  const directory = mkdtempSync(
    join(tmpdir(), 'equipment-azure-recovery-render-'),
  );
  try {
    stageAzureFixture(directory);
    const render = (path) =>
      execFileSync(
        process.env.KUBECTL ??
          (process.platform === 'win32'
            ? resolve(root, '.cache/promotion-tools/kubectl.exe')
            : 'kubectl'),
        ['kustomize', join(directory, path)],
        { encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
      )
        .split(/^---\s*$/m)
        .filter((part) => part.trim())
        .map((part) => parsers.Yaml.parse(part).data);
    const initial = render('deploy/platform/azure');
    assert.equal(
      initial.some(
        (item) =>
          item.kind === 'SecretProviderClass' &&
          item.metadata.namespace === 'equipment-recovery',
      ),
      false,
    );
    assert.equal(
      initial.some(
        (item) =>
          item.kind === 'Job' &&
          item.metadata.name === 'recovery-database-bootstrap',
      ),
      false,
    );
    assert.equal(
      initial.some(
        (item) =>
          item.kind === 'RoleBinding' &&
          item.metadata.name === 'equipment-recovery-backup',
      ),
      false,
    );
    const optional = render('deploy/platform/azure/recovery');
    assert.equal(optional.filter((item) => item.kind === 'Pod').length, 3);
    assert.ok(
      optional.some(
        (item) =>
          item.kind === 'Job' &&
          item.metadata.name === 'recovery-database-bootstrap',
      ),
    );
    assert.equal(
      optional.filter((item) => item.kind === 'RoleBinding').length,
      4,
    );
    const restore = optional.find(
      (item) =>
        item.kind === 'Pod' &&
        item.metadata.name === 'equipment-restore-client',
    );
    assert.equal(
      restore.spec.containers[0].env.some((entry) =>
        entry.name.startsWith('VERIFY_'),
      ),
      false,
    );
  } finally {
    removeAzureFixtureDirectory(directory, 'equipment-azure-recovery-render-');
  }
});

test('runtime projection binds DNS issuance and operator access to actual tenant and exact source addresses', () => {
  const projection = renderRuntimeProjection(input());
  const platform = JSON.parse(
    projection.platformFiles['identities.json'],
  ).items;
  const platformComponent = JSON.parse(
    projection.platformFiles['kustomization.yaml'],
  );
  const certManager = JSON.parse(
    platformComponent.patches.find(
      (patch) => JSON.parse(patch.patch).kind === 'ServiceAccount',
    ).patch,
  );
  assert.equal(
    certManager.metadata.annotations['azure.workload.identity/client-id'],
    id,
  );
  const staging = platform.find(
    (item) =>
      item.kind === 'ClusterIssuer' &&
      item.metadata.name === 'letsencrypt-staging',
  );
  assert.equal(
    staging.spec.acme.solvers[0].dns01.azureDNS.managedIdentity.clientID,
    id,
  );
  assert.equal(Object.hasOwn(staging.spec.acme, 'email'), false);
  const app = JSON.parse(projection.applicationFiles['identities.json']).items;
  const source = app.find(
    (item) =>
      item.kind === 'Middleware' && item.metadata.name === 'operator-source',
  );
  assert.deepEqual(source.spec.ipAllowList.sourceRange, ['203.0.113.7/32']);
  const component = JSON.parse(
    projection.applicationFiles['kustomization.yaml'],
  );
  const dashboard = component.patches.find(
    (patch) => JSON.parse(patch.patch).metadata?.name === 'dashboard',
  );
  assert.ok(
    dashboard.patch.includes(`https://login.microsoftonline.com/${id}/v2.0`),
  );
});

test('Argo installer projection preserves upstream service account and requires Entra role authorization', () => {
  const projection = renderRuntimeProjection(input());
  const patches = JSON.parse(
    projection.platformFiles['argocd-bootstrap-patches.json'],
  );
  const secretProvider = JSON.parse(
    projection.platformFiles['argocd-bootstrap-resources.json'],
  ).items.find(
    (item) =>
      item.kind === 'SecretProviderClass' && item.metadata.name === 'argocd',
  );
  assert.equal(
    secretProvider.spec.secretObjects[0].labels['app.kubernetes.io/part-of'],
    'argocd',
  );
  assert.equal(
    JSON.parse(projection.platformFiles['identities.json']).items.some(
      (item) =>
        item.kind === 'SecretProviderClass' && item.metadata.name === 'argocd',
    ),
    false,
  );
  const account = patches.find((item) => item.kind === 'ServiceAccount');
  assert.equal(account.name, 'argocd-server');
  assert.ok(
    patches
      .find((item) => item.name === 'argocd-cm')
      .patch.data['oidc.config'].includes(
        '$argocd-credentials:oidcClientSecret',
      ),
  );
  assert.equal(
    patches.find((item) => item.name === 'argocd-cm').patch.data[
      'admin.enabled'
    ],
    'false',
  );
  assert.equal(
    patches.find((item) => item.name === 'argocd-rbac-cm').patch.data[
      'policy.default'
    ],
    '',
  );
  assert.equal(
    JSON.parse(
      projection.platformFiles['kustomization.yaml'],
    ).resources.includes('argocd-bootstrap-patches.json'),
    false,
  );
});

test('canonical workload secret authorization cannot be widened by a caller', () => {
  assert.throws(() => {
    workloadSecrets.inventory.identityAdmin = 'identity-admin';
  }, TypeError);
});

test('recovery identity projection separates live restore and isolated verification credentials', () => {
  const fixture = input();
  const result = renderRuntimeProjection(fixture);
  const documents = JSON.parse(result.recoveryFiles['identities.json']).items;
  const recovery = documents.filter(
    (item) =>
      item.kind === 'SecretProviderClass' &&
      item.metadata.namespace === 'equipment-recovery',
  );
  const qualification = JSON.parse(
    result.platformFiles['recovery-qualification-bindings.json'],
  );
  assert.equal(qualification.items.length, 2);
  assert.equal(
    JSON.parse(result.platformFiles['kustomization.yaml']).resources.includes(
      'recovery-qualification-bindings.json',
    ),
    false,
  );
  assert.ok(
    qualification.items.every((item) =>
      item.roleRef.name.startsWith('equipment-recovery-qualification-'),
    ),
  );
  assert.equal(recovery.length, 3);
  const keys = (name) =>
    recovery
      .find((item) => item.metadata.name === name)
      .spec.secretObjects[0].data.map((item) => item.objectName)
      .sort();
  assert.deepEqual(keys('equipment-backup-client'), [
    'backup-postgres-password',
    'verification-postgres-password',
  ]);
  assert.deepEqual(keys('equipment-restore-client'), [
    'restore-postgres-password',
  ]);
  assert.deepEqual(keys('equipment-verification-server'), [
    'verification-postgres-password',
  ]);
});

test('isolated verification resources bind one validated point to one bounded credential-isolated PostgreSQL server', () => {
  for (const unsafe of [
    '',
    'a'.repeat(15),
    'A'.repeat(16),
    '../../unsafe',
    'a'.repeat(17),
  ])
    assert.throws(() => renderVerificationResources(unsafe));
  const { job, service, host } =
    renderVerificationResources('0123456789abcdef');
  assert.equal(job.metadata.name, 'equipment-verify-0123456789abcdef');
  assert.equal(service.metadata.name, job.metadata.name);
  assert.equal(host, job.metadata.name + '.equipment-recovery.svc');
  assert.deepEqual(service.spec.selector, job.spec.template.metadata.labels);
  assert.equal(job.spec.activeDeadlineSeconds, 600);
  assert.equal(job.spec.backoffLimit, 0);
  assert.equal(job.spec.template.spec.containers.length, 1);
  assert.equal(
    job.spec.template.spec.serviceAccountName,
    'equipment-verification-server',
  );
  assert.match(
    job.spec.template.spec.containers[0].image,
    /@sha256:[a-f0-9]{64}$/,
  );
  assert.equal(
    JSON.stringify(job).includes('restore-postgres-password'),
    false,
  );
  assert.equal(service.spec.type, 'ClusterIP');
  assert.equal(
    job.spec.template.spec.volumes.some(
      (item) => item.persistentVolumeClaim || item.hostPath,
    ),
    false,
  );
});
