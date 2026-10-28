import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import parsers from '@stoplight/spectral-parsers';

const root = resolve(import.meta.dirname, '..');
const kubectl =
  process.env.KUBECTL ??
  (process.platform === 'win32'
    ? resolve(root, '.cache/promotion-tools/kubectl.exe')
    : 'kubectl');

test('initial recovery qualification is credential-free and grants only named harmless probes', () => {
  const documents = render('deploy/platform/azure/recovery-controls');
  for (const actor of ['backup', 'restore']) {
    const pod = documents.find(
      (item) =>
        item.kind === 'Pod' &&
        item.metadata.name === `equipment-${actor}-client`,
    );
    assert.ok(pod);
    assert.equal(
      pod.spec.volumes.some((volume) => volume.csi || volume.secret),
      false,
    );
    assert.equal(pod.spec.containers[0].env, undefined);
    const role = documents.find(
      (item) =>
        item.kind === 'Role' &&
        item.metadata.name === `equipment-recovery-qualification-${actor}`,
    );
    assert.ok(role);
    assert.ok(role.rules.every((rule) => rule.resourceNames?.length === 1));
    assert.ok(role.rules.every((rule) => !rule.resources.includes('secrets')));
  }
  for (const policy of documents.filter(
    (item) => item.kind === 'ValidatingAdmissionPolicy',
  ))
    assert.equal(policy.spec.failurePolicy, 'Fail');
  for (const binding of documents.filter(
    (item) => item.kind === 'ValidatingAdmissionPolicyBinding',
  ))
    assert.deepEqual(binding.spec.validationActions, ['Deny']);
});

test('backup alone can forward only the fixed broker monitor and restore reads only the exact five writer scales', () => {
  const documents = render('deploy/platform/azure/recovery-controls');
  const backup = documents.find(
    (item) =>
      item.kind === 'Role' &&
      item.metadata.name === 'equipment-recovery-backup',
  );
  assert.deepEqual(
    backup.rules.find((rule) => rule.resources.includes('pods/portforward')),
    {
      apiGroups: [''],
      resources: ['pods/portforward'],
      resourceNames: ['equipment-broker-monitor'],
      verbs: ['get', 'create'],
    },
  );
  const restore = documents.find(
    (item) =>
      item.kind === 'Role' &&
      item.metadata.name === 'equipment-recovery-restore-scale',
  );
  assert.ok(restore);
  assert.deepEqual(
    restore.rules.find((rule) => rule.resources.includes('deployments')),
    {
      apiGroups: ['apps'],
      resources: ['deployments'],
      resourceNames: [
        'web',
        'inventory',
        'reservations',
        'notifications',
        'keycloak',
      ],
      verbs: ['get'],
    },
  );
  assert.deepEqual(
    restore.rules.find((rule) => rule.resources.includes('deployments/scale')),
    {
      apiGroups: ['apps'],
      resources: ['deployments/scale'],
      resourceNames: [
        'web',
        'inventory',
        'reservations',
        'notifications',
        'keycloak',
      ],
      verbs: ['get'],
    },
  );
  assert.equal(
    documents
      .filter(
        (item) =>
          item.kind === 'Role' &&
          item.metadata.name.startsWith('equipment-recovery-restore'),
      )
      .some((role) =>
        role.rules.some(
          (rule) =>
            rule.verbs.some((verb) =>
              ['patch', 'update', 'create', 'delete'].includes(verb),
            ) &&
            rule.resources.some((resource) =>
              resource.startsWith('deployments'),
            ),
        ),
      ),
    false,
  );
});

test('writer observation grants exact Deployment and bootstrap Job reads with honest namespace-only Pod listing', () => {
  const documents = render('deploy/platform/azure/recovery-controls');
  for (const actor of ['backup', 'restore']) {
    const role = documents.find(
      (item) =>
        item.kind === 'Role' &&
        item.metadata.name === `equipment-recovery-${actor}-scale`,
    );
    assert.deepEqual(
      role.rules.find((rule) => rule.resources.includes('pods')),
      { apiGroups: [''], resources: ['pods'], verbs: ['list'] },
    );
    assert.deepEqual(
      role.rules.find((rule) => rule.resources.includes('deployments'))
        ?.resourceNames,
      ['web', 'inventory', 'reservations', 'notifications', 'keycloak'],
    );
    assert.deepEqual(
      role.rules.find((rule) => rule.resources.includes('deployments'))?.verbs,
      ['get'],
    );
    if (actor === 'restore') {
      assert.deepEqual(
        role.rules.find((rule) => rule.resources.includes('jobs')),
        {
          apiGroups: ['batch'],
          resources: ['jobs'],
          resourceNames: ['database-bootstrap', 'identity-bootstrap'],
          verbs: ['get'],
        },
      );
    }
  }
});

test('both actor continuity roles read only the named recovery Application without granting its AppProject', () => {
  const documents = render('deploy/platform/azure/recovery-controls');
  for (const actor of ['backup', 'restore']) {
    const role = documents.find(
      (item) =>
        item.kind === 'Role' &&
        item.metadata.namespace === 'argocd' &&
        item.metadata.name === `equipment-recovery-${actor}-continuity`,
    );
    assert.ok(role);
    assert.deepEqual(
      role.rules.filter((rule) => rule.apiGroups.includes('argoproj.io')),
      [
        {
          apiGroups: ['argoproj.io'],
          resources: ['applications', 'appprojects'],
          resourceNames: ['equipment-azure'],
          verbs: ['get'],
        },
        {
          apiGroups: ['argoproj.io'],
          resources: ['applications'],
          resourceNames: ['equipment-azure-recovery'],
          verbs: ['get'],
        },
      ],
    );
  }
});

test('continuity authority names only five Secrets and two issuers with actor-specific existing-object verbs', () => {
  const documents = render('deploy/platform/azure/recovery-controls');
  for (const actor of ['backup', 'restore']) {
    const expectedVerbs =
      actor === 'backup' ? ['get'] : ['get', 'patch', 'update'];
    for (const [namespace, names] of [
      ['equipment', ['equipment-tls', 'dashboard-public-tls']],
      [
        'cert-manager',
        ['letsencrypt-production-account', 'letsencrypt-staging-account'],
      ],
      ['argocd', ['argocd-public-tls']],
    ]) {
      const role = documents.find(
        (item) =>
          item.kind === 'Role' &&
          item.metadata.namespace === namespace &&
          item.metadata.name ===
            `equipment-recovery-${actor}-${namespace === 'equipment' ? 'scale' : 'continuity'}`,
      );
      assert.ok(
        role,
        `Missing exact ${actor} continuity role in ${namespace}.`,
      );
      assert.deepEqual(
        role.rules.find((rule) => rule.resources.includes('secrets')),
        {
          apiGroups: [''],
          resources: ['secrets'],
          resourceNames: names,
          verbs: expectedVerbs,
        },
      );
      if (namespace === 'argocd')
        assert.deepEqual(
          role.rules.find((rule) => rule.resources.includes('applications')),
          {
            apiGroups: ['argoproj.io'],
            resources: ['applications', 'appprojects'],
            resourceNames: ['equipment-azure'],
            verbs: ['get'],
          },
        );
    }
    const role = documents.find(
      (item) =>
        item.kind === 'ClusterRole' &&
        item.metadata.name === `equipment-recovery-${actor}-issuers`,
    );
    assert.ok(role);
    assert.deepEqual(role.rules, [
      {
        apiGroups: ['cert-manager.io'],
        resources: ['clusterissuers'],
        resourceNames: ['letsencrypt-production', 'letsencrypt-staging'],
        verbs: ['get'],
      },
      {
        apiGroups: ['rbac.authorization.k8s.io'],
        resources: ['clusterroles', 'clusterrolebindings'],
        resourceNames: [`equipment-recovery-${actor}-issuers`],
        verbs: ['get'],
      },
    ]);
  }
});

function render(path) {
  assert.ok(
    existsSync(resolve(root, path)),
    `Missing deployment entry point: ${path}`,
  );
  return execFileSync(kubectl, ['kustomize', resolve(root, path)], {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
  })
    .split(/^---\s*$/m)
    .filter((document) => document.trim())
    .map((document) => {
      const result = parsers.Yaml.parse(document);
      assert.equal(result.diagnostics.length, 0);
      return result.data;
    });
}

function named(documents, kind, name) {
  const found = documents.find(
    (document) => document.kind === kind && document.metadata.name === name,
  );
  assert.ok(found, `Missing ${kind}/${name}`);
  return found;
}

test('Azure storage dynamically provisions Standard SSD and retains deleted claims', () => {
  const documents = render('deploy/platform/azure/storage');
  const storage = named(documents, 'StorageClass', 'equipment-azure-retain');
  assert.equal(storage.provisioner, 'disk.csi.azure.com');
  assert.equal(storage.parameters.skuName, 'StandardSSD_LRS');
  assert.equal(storage.reclaimPolicy, 'Retain');
  assert.equal(storage.volumeBindingMode, 'WaitForFirstConsumer');
  assert.equal(storage.allowVolumeExpansion, true);
});

test('Azure application refuses rendering before reviewed runtime and image configuration exists', () => {
  if (
    !existsSync(
      resolve(root, 'deploy/environments/azure/runtime/kustomization.yaml'),
    )
  ) {
    assert.throws(() => render('deploy/environments/azure'));
  } else {
    const documents = render('deploy/environments/azure');
    for (const name of ['postgres', 'rabbitmq', 'keycloak', 'dashboard']) {
      const service = named(documents, 'Service', name);
      assert.ok(
        service.spec.type === undefined || service.spec.type === 'ClusterIP',
      );
    }
  }
});

test('Azure configuration does not change the existing local overlay storage contract', () => {
  const documents = render('deploy/environments/local');
  for (const name of ['postgres', 'rabbitmq', 'dashboard']) {
    const claim = named(documents, 'PersistentVolumeClaim', `${name}-data`);
    assert.equal(claim.spec.storageClassName, 'equipment-retain');
    assert.equal(claim.spec.volumeName, `equipment-${name}`);
  }
  assert.equal(
    readFileSync(resolve(root, 'deploy/argocd/source.json'), 'utf8').includes(
      '90dc9094bf4c5964afd9c0e35d735e1c2fcbbda4f8e36799c092d9864ed65f50',
    ),
    true,
  );
});

test('Azure application namespace denies traffic by default and explicitly permits only required provider paths', () => {
  const documents = render('deploy/platform/azure/network');
  const baseline = named(documents, 'NetworkPolicy', 'equipment-default-deny');
  assert.equal(baseline.metadata.namespace, 'equipment');
  assert.deepEqual(baseline.spec.podSelector, {});
  assert.deepEqual(baseline.spec.policyTypes, ['Ingress', 'Egress']);
  assert.deepEqual(baseline.spec.ingress, []);
  assert.deepEqual(baseline.spec.egress, []);
  const postgres = named(documents, 'NetworkPolicy', 'equipment-postgres');
  assert.equal(
    postgres.spec.podSelector.matchLabels['app.kubernetes.io/name'],
    'postgres',
  );
  assert.deepEqual(postgres.spec.ingress[0].ports, [
    { protocol: 'TCP', port: 5432 },
  ]);
  assert.equal(
    documents.some((document) =>
      document.spec?.ingress?.some((rule) =>
        rule.ports?.some((port) => port.port === 15672),
      ),
    ),
    false,
  );
});

test('Azure Argo projects separate application authority from cluster platform authority', () => {
  const documents = render('deploy/argocd/azure/projects');
  const application = named(documents, 'AppProject', 'equipment-azure');
  assert.deepEqual(application.spec.clusterResourceWhitelist, []);
  assert.deepEqual(application.spec.destinations, [
    { namespace: 'equipment', server: 'https://kubernetes.default.svc' },
  ]);
  assert.equal(
    application.spec.namespaceResourceWhitelist.some(
      (resource) => resource.kind === 'Secret',
    ),
    false,
  );
  const platform = named(documents, 'AppProject', 'equipment-azure-platform');
  assert.equal(
    platform.spec.destinations.some(
      (destination) => destination.namespace === '*',
    ),
    false,
  );
  assert.equal(
    platform.spec.clusterResourceWhitelist.some(
      (resource) => resource.kind === '*',
    ),
    false,
  );
  for (const project of [application, platform]) {
    assert.deepEqual(project.spec.sourceRepos, [
      'https://github.com/cosminstirbu/equipment-reservations-lab.git',
    ]);
    assert.match(
      project.metadata.annotations['argocd.argoproj.io/sync-options'],
      /Delete=false/,
    );
  }
});

test('Azure gateway preserves source addresses and redirects HTTP without trusting forwarded headers', () => {
  const documents = render('deploy/platform/azure/ingress');
  const service = named(documents, 'Service', 'traefik');
  assert.equal(service.spec.type, 'LoadBalancer');
  assert.equal(service.spec.externalTrafficPolicy, 'Local');
  assert.deepEqual(
    service.spec.ports.map((port) => port.port),
    [80, 443],
  );
  assert.equal(
    service.spec.ports.some((port) => port.nodePort !== undefined),
    false,
  );
  const args = named(documents, 'Deployment', 'traefik').spec.template.spec
    .containers[0].args;
  assert.ok(
    args.includes(
      '--entrypoints.web.http.redirections.entrypoint.to=websecure',
    ),
  );
  assert.ok(
    args.includes(
      '--entrypoints.web.http.redirections.entrypoint.scheme=https',
    ),
  );
  assert.equal(
    args.some((arg) => arg.includes('forwardedheaders.insecure=true')),
    false,
  );
  assert.equal(
    args.some((arg) => arg.includes('127.0.0.1')),
    false,
  );
});

test('pinned certificate controllers use DNS workload identity without stored Azure credentials', () => {
  const documents = render('deploy/platform/azure/certificates');
  const controller = named(documents, 'Deployment', 'cert-manager');
  assert.equal(
    controller.spec.template.metadata.labels['azure.workload.identity/use'],
    'true',
  );
  assert.equal(
    controller.spec.template.spec.serviceAccountName,
    'cert-manager',
  );
  for (const deployment of documents.filter(
    (item) => item.kind === 'Deployment',
  ))
    assert.match(
      deployment.spec.template.spec.containers[0].image,
      /@sha256:[a-f0-9]{64}$/,
    );
  assert.equal(
    documents.some((item) => item.kind === 'Secret'),
    false,
  );
});

test('certificate resources stage public trust and provide internal TLS without weakening verification', () => {
  const documents = render('deploy/platform/azure/certificates');
  const root = named(documents, 'Certificate', 'equipment-internal-root');
  assert.equal(root.spec.isCA, true);
  const staging = named(documents, 'Certificate', 'equipment-staging-check');
  assert.equal(staging.spec.issuerRef.name, 'letsencrypt-staging');
  for (const name of ['equipment-public', 'dashboard-public', 'argocd-public'])
    assert.equal(
      named(documents, 'Certificate', name).spec.issuerRef.name,
      'letsencrypt-production',
    );
  const collector = named(documents, 'Certificate', 'otel-collector');
  assert.ok(
    collector.spec.dnsNames.includes('otel-collector.equipment-platform.svc'),
  );
  assert.equal(collector.spec.issuerRef.name, 'equipment-internal-ca');
  for (const name of [
    'otel-collector',
    'prometheus',
    'loki',
    'tempo',
    'grafana',
    'dashboard-internal',
  ]) {
    const certificate = named(documents, 'Certificate', name);
    assert.ok(certificate.spec.dnsNames.includes('localhost'));
    assert.deepEqual(certificate.spec.ipAddresses, ['127.0.0.1']);
  }
});

test('operator and certificate controller namespaces deny ingress except their declared services', () => {
  const documents = render('deploy/platform/azure/network');
  for (const [namespace, name] of [
    ['argocd', 'argocd-default-deny'],
    ['cert-manager', 'cert-manager-default-deny'],
  ]) {
    const policy = named(documents, 'NetworkPolicy', name);
    assert.equal(policy.metadata.namespace, namespace);
    assert.deepEqual(policy.spec.policyTypes, ['Ingress', 'Egress']);
    assert.deepEqual(policy.spec.podSelector, {});
  }
});

test('bootstrap applications reconcile main without parameter overrides and cannot silently delete persistent resources', () => {
  for (const [directory, name, path] of [
    ['platform', 'equipment-azure-platform', 'deploy/platform/azure'],
    ['application', 'equipment-azure', 'deploy/environments/azure'],
  ]) {
    const application = named(
      render('deploy/argocd/azure/' + directory),
      'Application',
      name,
    );
    assert.equal(application.spec.source.targetRevision, 'main');
    assert.equal(application.spec.source.path, path);
    assert.equal(application.spec.source.kustomize, undefined);
    assert.equal(application.spec.source.helm, undefined);
    assert.equal(application.spec.syncPolicy.automated.selfHeal, true);
    assert.equal(application.spec.syncPolicy.automated.allowEmpty, false);
    assert.ok(
      application.spec.syncPolicy.syncOptions.includes(
        'FailOnSharedResource=true',
      ),
    );
  }
});
