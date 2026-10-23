import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import parsers from '@stoplight/spectral-parsers';

function resource(path) {
  return parsers.Yaml.parse(
    readFileSync(new URL(`../deploy/base/${path}`, import.meta.url), 'utf8'),
  ).data;
}

function wave(document) {
  return Number(
    document.metadata.annotations?.['argocd.argoproj.io/sync-wave'] ?? 0,
  );
}

test('Argo creates dependency services before bootstrap Jobs and workload readiness', () => {
  const consumers = {
    postgres: ['jobs/database/job.yaml'],
    dashboard: ['dashboard.yaml', 'jobs/database/job.yaml', 'rabbitmq.yaml'],
    rabbitmq: ['jobs/identity/job.yaml'],
    keycloak: ['jobs/identity/job.yaml'],
  };
  for (const [name, paths] of Object.entries(consumers)) {
    const service = resource(`${name}-service.yaml`);
    assert.equal(service.kind, 'Service');
    for (const path of paths)
      assert.ok(
        wave(service) <= wave(resource(path)),
        `${name} service must exist before ${path}`,
      );
  }
});

test('local ingress publishes its actual loopback endpoint for Argo health', () => {
  const documents = readFileSync(
    new URL('../deploy/platform/traefik.yaml', import.meta.url),
    'utf8',
  )
    .split(/^---\s*$/m)
    .filter((text) => text.trim())
    .map((text) => parsers.Yaml.parse(text).data);
  const traefik = documents.find((document) => document.kind === 'Deployment');
  assert.ok(
    traefik.spec.template.spec.containers[0].args.includes(
      '--providers.kubernetesingress.ingressendpoint.ip=127.0.0.1',
    ),
  );
});

test('broker pod replacement does not recursively widen the retained Erlang cookie permissions', () => {
  const pod = resource('rabbitmq.yaml').spec.template.spec;
  assert.equal(pod.securityContext.fsGroupChangePolicy, 'OnRootMismatch');
});

test('local Argo project admits workload children while retaining private and cluster resource boundaries', () => {
  const text = readFileSync(
    new URL('../deploy/argocd/local.yaml', import.meta.url),
    'utf8',
  );
  const project = parsers.Yaml.parse(text.split(/^---\s*$/m)[0]).data;
  const allowed = project.spec.namespaceResourceWhitelist;
  for (const [group, kind] of [
    ['', 'Pod'],
    ['apps', 'ReplicaSet'],
  ])
    assert.ok(
      allowed.some((entry) => entry.group === group && entry.kind === kind),
      `${group || 'core'}/${kind} must be permitted`,
    );
  assert.ok(
    allowed.every(
      (entry) =>
        entry.group !== '*' && entry.kind !== '*' && entry.kind !== 'Secret',
    ),
  );
  assert.deepEqual(project.spec.clusterResourceWhitelist, []);
});
