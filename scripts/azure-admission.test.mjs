import {
  finishNativeFixture,
  assertNativeProcessStarted,
  nativeFixtureFailure,
} from './azure-native-fixture.mjs';
import { createGeneratorInput } from './azure-generator-input.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import test from 'node:test';
import parsers from '@stoplight/spectral-parsers';
import {
  renderVerificationResources,
  renderRuntimeProjection,
} from './azure-runtime.mjs';
import {
  removeAzureFixtureDirectory,
  azureRuntimeFixtureInput,
} from './azure-runtime-fixture.mjs';
import { runPrivateProcess } from './azure-infrastructure.mjs';
import { qualityContext, verifiedTool } from './azure-quality.mjs';

const root = resolve(import.meta.dirname, '..');
const image =
  'kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0';
const mutations = [
  [
    'request-resource',
    (pod) => {
      pod.containers[0].resources.requests['ephemeral-storage'] = '1Mi';
    },
  ],
  [
    'limit-resource',
    (pod) => {
      pod.containers[0].resources.limits['ephemeral-storage'] = '1Mi';
    },
  ],
  [
    'csi-secret',
    (pod) => {
      pod.volumes[3].csi.nodePublishSecretRef = { name: 'unreviewed' };
    },
  ],
  [
    'csi-fstype',
    (pod) => {
      pod.volumes[3].csi.fsType = 'ext4';
    },
  ],
  [
    'csi-attribute',
    (pod) => {
      pod.volumes[3].csi.volumeAttributes.unreviewed = 'value';
    },
  ],
  [
    'dns-config',
    (pod) => {
      pod.dnsConfig = { nameservers: ['203.0.113.1'] };
    },
  ],
  [
    'termination-path',
    (pod) => {
      pod.containers[0].terminationMessagePath = '/tmp/unreviewed';
    },
  ],
  [
    'termination-policy',
    (pod) => {
      pod.containers[0].terminationMessagePolicy = 'FallbackToLogsOnError';
    },
  ],
];

// API-server admission is the public boundary. Unsafe templates are seeded before
// binding while a zero-Pod quota prevents execution. No-op UPDATE then tests CEL,
// rather than accidentally passing because Job template mutation is immutable.
// This qualifies native Kubernetes only; hosted Entra/AKS identity proof is separate.
test(
  'pinned native admission permits the reviewed defaulted template and rejects independent CREATE and UPDATE mutations',
  { skip: process.env.AZURE_PROVIDER_CONTRACTS !== '1', timeout: 360000 },
  async () => {
    const context = qualityContext();
    const kind = verifiedTool(context, 'kind');
    const kubectl = verifiedTool(context, 'kubectl');
    const directory = mkdtempSync(resolve(tmpdir(), 'equipment-admission-'));
    const name = `equipment-admission-${randomUUID().slice(0, 8)}`;
    const kubeconfig = resolve(directory, 'config');
    const provider = process.env.CONTAINER_RUNTIME ?? 'podman';
    assert.ok(['podman', 'docker'].includes(provider));
    const env = { ...process.env, KIND_EXPERIMENTAL_PROVIDER: provider };
    const args = ['--kubeconfig', kubeconfig, '--context', `kind-${name}`];
    let phase = 'kind-create';
    let primary;
    const call = (command, commandArgs, input) => {
      const started = globalThis.performance.now();
      const result = spawnSync(command, commandArgs, {
        env,
        input: input === undefined ? undefined : JSON.stringify(input),
        encoding: 'utf8',
        timeout: 60000,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
      });
      assertNativeProcessStarted({
        error: result.error,
        phase,
        tool: command === kind ? 'kind' : 'kubectl',
        durationMs: globalThis.performance.now() - started,
      });
      return {
        failure: nativeFixtureFailure(
          {
            status: result.status,
            signal: result.signal,
            durationMs: globalThis.performance.now() - started,
          },
          phase,
          command === kind ? 'kind' : 'kubectl',
        ),
        ok: result.status === 0,
        stdout: result.stdout,
        denied: result.stderr.includes(
          'Only the reviewed isolated verification template is permitted.',
        ),
      };
    };
    const kube = (commandArgs, input) =>
      call(kubectl, [...args, ...commandArgs], input);
    const apply = (input) => {
      const result = kube(['apply', '-f', '-'], input);
      assert.ok(result.ok, result.failure);
    };
    let created = false;
    try {
      assert.match(call(kind, ['version']).stdout, /kind v0[.]33[.]0/);
      created = true;
      await runPrivateProcess(
        kind,
        [
          'create',
          'cluster',
          '--name',
          name,
          '--image',
          image,
          '--kubeconfig',
          kubeconfig,
          '--wait',
          '120s',
        ],
        {
          env,
          operation: 'Native fixture kind-create',
          tool: 'kind',
          timeout: 180000,
        },
      );
      phase = 'prerequisites-install';
      apply({
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: { name: 'equipment-recovery' },
      });
      apply({
        apiVersion: 'v1',
        kind: 'ResourceQuota',
        metadata: { name: 'never-run-pods', namespace: 'equipment-recovery' },
        spec: { hard: { pods: '0' } },
      });
      phase = 'native-admission';
      const cases = [['reviewed', undefined], ...mutations].map(
        ([label, mutate], index) => {
          const { job } = renderVerificationResources(
            index.toString(16).padStart(16, '0'),
          );
          mutate?.(job.spec.template.spec);
          assert.ok(
            kube(['create', '-f', '-'], job).ok,
            `Pre-policy seed rejected: ${label}`,
          );
          return { label, job };
        },
      );
      const policies = JSON.parse(
        readFileSync(
          resolve(
            root,
            'deploy/platform/azure/recovery-controls/admission.json',
          ),
          'utf8',
        ),
      );
      const services = [false, true].map((unsafe, index) => {
        const { service } = renderVerificationResources(
          (512 + index).toString(16).padStart(16, '0'),
        );
        if (unsafe) service.spec.externalIPs = ['203.0.113.1'];
        assert.ok(kube(['create', '-f', '-'], service).ok);
        return { service, unsafe };
      });
      apply(policies);
      let checked = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        const result = kube([
          'get',
          'validatingadmissionpolicy',
          'equipment-verification-jobs',
          '-o',
          'json',
        ]);
        assert.ok(result.ok);
        const policy = JSON.parse(result.stdout);
        if (policy.status?.typeChecking) {
          assert.equal(
            (policy.status.typeChecking.expressionWarnings ?? []).length,
            0,
            'Native CEL type checking reported warnings.',
          );
          checked = true;
          break;
        }
        await wait(1000);
      }
      assert.ok(checked, 'Native CEL type checking never completed.');
      await wait(2000);
      for (const { label, job } of cases) {
        const original = kube([
          'get',
          'job',
          job.metadata.name,
          '-n',
          'equipment-recovery',
          '-o',
          'json',
        ]);
        assert.ok(original.ok);
        const update = kube(
          ['replace', '--dry-run=server', '-f', '-'],
          JSON.parse(original.stdout),
        );
        const candidate = globalThis.structuredClone(job);
        const hash = (
          BigInt(`0x${job.metadata.labels['equipment.verify/point']}`) + 256n
        )
          .toString(16)
          .padStart(16, '0');
        candidate.metadata.name = `equipment-verify-${hash}`;
        candidate.metadata.labels['equipment.verify/point'] = hash;
        candidate.spec.template.metadata.labels['equipment.verify/point'] =
          hash;
        const create = kube(
          ['create', '--dry-run=server', '-f', '-'],
          candidate,
        );
        if (label === 'reviewed') {
          assert.ok(create.ok, 'Reviewed CREATE rejected by native admission.');
          assert.ok(
            update.ok,
            'Defaulted reviewed UPDATE rejected by native admission.',
          );
        } else {
          assert.ok(
            !create.ok && create.denied,
            `Policy did not deny CREATE: ${label}`,
          );
          assert.ok(
            !update.ok && update.denied,
            `Policy did not deny UPDATE: ${label}`,
          );
        }
      }
      for (const { service, unsafe } of services) {
        const original = kube([
          'get',
          'service',
          service.metadata.name,
          '-n',
          'equipment-recovery',
          '-o',
          'json',
        ]);
        assert.ok(original.ok);
        const update = kube(
          ['replace', '--dry-run=server', '-f', '-'],
          JSON.parse(original.stdout),
        );
        const candidate = globalThis.structuredClone(service);
        const hash = (
          BigInt(`0x${service.metadata.labels['equipment.verify/point']}`) +
          256n
        )
          .toString(16)
          .padStart(16, '0');
        candidate.metadata.name = `equipment-verify-${hash}`;
        candidate.metadata.labels['equipment.verify/point'] = hash;
        candidate.spec.selector['equipment.verify/point'] = hash;
        const create = kube(
          ['create', '--dry-run=server', '-f', '-'],
          candidate,
        );
        if (unsafe) {
          assert.ok(
            !create.ok && create.denied,
            'Service external routing CREATE escaped admission.',
          );
          assert.ok(
            !update.ok && update.denied,
            'Service external routing UPDATE escaped admission.',
          );
        } else {
          assert.ok(create.ok, 'Reviewed Service CREATE rejected.');
          assert.ok(update.ok, 'Defaulted reviewed Service UPDATE rejected.');
        }
      }
      apply({
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: { name: 'equipment' },
      });
      const roles = JSON.parse(
        readFileSync(
          resolve(root, 'deploy/platform/azure/recovery-controls/roles.json'),
          'utf8',
        ),
      );
      const role = roles.items.find(
        (item) => item.metadata.name === 'equipment-recovery-restore-scale',
      );
      apply(role);
      const actor = '33333333-3333-4333-8333-333333333333';
      apply({
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'RoleBinding',
        metadata: { name: role.metadata.name, namespace: 'equipment' },
        roleRef: {
          apiGroup: 'rbac.authorization.k8s.io',
          kind: 'Role',
          name: role.metadata.name,
        },
        subjects: [
          { apiGroup: 'rbac.authorization.k8s.io', kind: 'User', name: actor },
        ],
      });
      const writers = [
        'web',
        'inventory',
        'reservations',
        'notifications',
        'keycloak',
      ];
      for (const writer of [...writers, 'unrelated']) {
        apply({
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: writer, namespace: 'equipment' },
          spec: {
            replicas: 0,
            selector: { matchLabels: { fixture: writer } },
            template: {
              metadata: { labels: { fixture: writer } },
              spec: {
                containers: [
                  {
                    name: 'never-run',
                    image:
                      renderVerificationResources('000000000000ffff').job.spec
                        .template.spec.containers[0].image,
                  },
                ],
              },
            },
          },
        });
      }
      for (const writer of writers) {
        assert.ok(
          kube(['--as', actor, 'get', 'deployment', writer, '-n', 'equipment'])
            .ok,
          'Restore cannot GET an exact named Deployment.',
        );
        assert.ok(
          kube([
            '--as',
            actor,
            'get',
            '--raw',
            `/apis/apps/v1/namespaces/equipment/deployments/${writer}/scale`,
          ]).ok,
          'Restore cannot GET an exact named scale.',
        );
      }
      assert.equal(
        kube([
          '--as',
          actor,
          'get',
          'deployment',
          'unrelated',
          '-n',
          'equipment',
        ]).ok,
        false,
      );
      assert.equal(
        kube([
          '--as',
          actor,
          'get',
          '--raw',
          '/apis/apps/v1/namespaces/equipment/deployments/unrelated/scale',
        ]).ok,
        false,
      );
      for (const resource of ['deployments', 'deployments/scale']) {
        for (const verb of [
          'create',
          'patch',
          'update',
          'delete',
          'list',
          'watch',
        ]) {
          assert.equal(
            kube([
              '--as',
              actor,
              'auth',
              'can-i',
              verb,
              'deployments/web',
              ...(resource.includes('/') ? ['--subresource=scale'] : []),
              '-n',
              'equipment',
            ]).stdout.trim(),
            'no',
            `Restore unexpectedly authorized ${verb} ${resource}.`,
          );
        }
      }
      phase = 'native-authorization';
      verifyExpandedAuthorization(kube, apply, directory);
    } catch (error) {
      primary = error;
    } finally {
      await finishNativeFixture({
        primary,
        phase,
        cleanups: [
          {
            phase: 'cluster-delete',
            tool: 'kind',
            run: async () => {
              if (created)
                await runPrivateProcess(
                  kind,
                  [
                    'delete',
                    'cluster',
                    '--name',
                    name,
                    '--kubeconfig',
                    kubeconfig,
                  ],
                  {
                    env,
                    operation: 'Native fixture cluster-delete',
                    tool: 'kind',
                    timeout: 60000,
                  },
                );
            },
          },
          {
            phase: 'private-directory-remove',
            tool: 'fixture',
            run: () =>
              removeAzureFixtureDirectory(directory, 'equipment-admission-'),
          },
        ],
      });
    }
  },
);

function verifyExpandedAuthorization(kube, apply, directory) {
  const actors = {
    backup: '11111111-1111-4111-8111-111111111111',
    restore: '33333333-3333-4333-8333-333333333333',
  };
  const input = azureRuntimeFixtureInput();
  Object.assign(input.foundation.github_principal_ids, actors);
  const projection = renderRuntimeProjection(createGeneratorInput(input));
  for (const namespace of ['cert-manager', 'argocd'])
    apply({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { name: namespace },
    });
  const definitions = JSON.parse(
    readFileSync(
      resolve(root, 'deploy/platform/azure/recovery-controls/roles.json'),
      'utf8',
    ),
  );
  apply(definitions);
  apply(JSON.parse(projection.recoveryFiles['bindings.json']));
  apply(
    JSON.parse(projection.platformFiles['recovery-continuity-bindings.json']),
  );
  const certDocuments = readFileSync(
    resolve(
      root,
      'deploy/platform/azure/certificates/controller/cert-manager.yaml',
    ),
    'utf8',
  )
    .split(/^---\s*$/m)
    .filter((part) => part.trim())
    .map((part) => parsers.Yaml.parse(part).data);
  apply(
    certDocuments.find(
      (item) =>
        item.kind === 'CustomResourceDefinition' &&
        item.metadata.name === 'clusterissuers.cert-manager.io',
    ),
  );
  apply(
    JSON.parse(
      readFileSync(
        resolve(root, 'deploy/platform/azure/schema-sources/argocd-crds.json'),
        'utf8',
      ),
    ),
  );
  for (const name of [
    'letsencrypt-production',
    'letsencrypt-staging',
    'unrelated',
  ])
    apply({
      apiVersion: 'cert-manager.io/v1',
      kind: 'ClusterIssuer',
      metadata: { name },
      spec: { selfSigned: {} },
    });
  for (const name of ['equipment-azure', 'unrelated']) {
    apply({
      apiVersion: 'argoproj.io/v1alpha1',
      kind: 'AppProject',
      metadata: { name, namespace: 'argocd' },
      spec: { sourceRepos: [] },
    });
    apply({
      apiVersion: 'argoproj.io/v1alpha1',
      kind: 'Application',
      metadata: { name, namespace: 'argocd' },
      spec: {
        project: name,
        source: {
          repoURL: 'https://github.com/example/equipment',
          path: 'deploy/environments/azure',
          targetRevision: 'main',
        },
        destination: {
          namespace: 'equipment',
          server: 'https://kubernetes.default.svc',
        },
      },
    });
  }
  const secrets = [
    ['equipment', 'equipment-tls'],
    ['equipment', 'dashboard-public-tls'],
    ['cert-manager', 'letsencrypt-production-account'],
    ['cert-manager', 'letsencrypt-staging-account'],
    ['argocd', 'argocd-public-tls'],
  ];
  for (const [namespace, name] of [
    ...secrets,
    ['equipment', 'unrelated'],
    ['cert-manager', 'equipment-internal-root'],
    ['equipment-recovery', 'unrelated'],
  ])
    apply({
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name, namespace },
      type: 'Opaque',
      data: { fixture: 'c3ludGhldGlj' },
    });
  const pod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'never-scheduled-observation', namespace: 'equipment' },
    spec: {
      automountServiceAccountToken: false,
      schedulingGates: [{ name: 'equipment.test/never-run' }],
      containers: [
        {
          name: 'never-run',
          image:
            renderVerificationResources('000000000000ffff').job.spec.template
              .spec.containers[0].image,
        },
      ],
    },
  };
  apply(pod);
  for (const name of ['database-bootstrap', 'identity-bootstrap', 'unrelated'])
    apply({
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: { name, namespace: 'equipment' },
      spec: {
        suspend: true,
        template: {
          spec: {
            restartPolicy: 'Never',
            automountServiceAccountToken: false,
            containers: [
              { name: 'never-run', image: pod.spec.containers[0].image },
            ],
          },
        },
      },
    });
  const namespaceArgs = (namespace) => (namespace ? ['-n', namespace] : []);
  const can = (actor, verb, resource, name, namespace) => {
    const result = kube([
      '--as',
      actors[actor],
      'auth',
      'can-i',
      verb,
      name ? `${resource}/${name}` : resource,
      ...namespaceArgs(namespace),
    ]);
    assert.ok(
      ['yes', 'no'].includes(result.stdout.trim()),
      'Native authorization review did not return a decision.',
    );
    return result.stdout.trim() === 'yes';
  };
  const requireAccess = (actor, resource, name, namespace) => {
    assert.ok(
      can(actor, 'get', resource, name, namespace),
      'An exact reviewed GET was denied.',
    );
    assert.ok(
      kube([
        '--as',
        actors[actor],
        'get',
        resource,
        name,
        ...namespaceArgs(namespace),
        '-o',
        'name',
      ]).ok,
      'An actual reviewed object GET failed.',
    );
  };
  const requireDenied = (actor, verb, resource, name, namespace) =>
    assert.equal(
      can(actor, verb, resource, name, namespace),
      false,
      `Unreviewed ${actor} ${verb} ${resource} authority was admitted.`,
    );
  const forbiddenVerbs = [
    'list',
    'watch',
    'create',
    'patch',
    'update',
    'delete',
  ];
  for (const actor of ['backup', 'restore']) {
    const other = actor === 'backup' ? 'restore' : 'backup';
    for (const [namespace, suffix] of [
      ['equipment-recovery', ''],
      ['equipment', '-scale'],
      ['cert-manager', '-continuity'],
      ['argocd', '-continuity'],
    ]) {
      for (const resource of ['roles', 'rolebindings']) {
        const name = `equipment-recovery-${actor}${suffix}`;
        requireAccess(actor, resource, name, namespace);
        requireDenied(
          actor,
          'get',
          resource,
          `equipment-recovery-${other}${suffix}`,
          namespace,
        );
        assert.equal(
          kube([
            '--as',
            actors[actor],
            'get',
            resource,
            `equipment-recovery-${other}${suffix}`,
            ...namespaceArgs(namespace),
          ]).ok,
          false,
          'Other actor authority metadata was readable.',
        );
        requireDenied(
          actor,
          'get',
          resource,
          name,
          namespace === 'equipment' ? 'argocd' : 'equipment',
        );
        for (const verb of forbiddenVerbs)
          requireDenied(actor, verb, resource, name, namespace);
      }
    }
    for (const resource of ['clusterroles', 'clusterrolebindings']) {
      const name = `equipment-recovery-${actor}-issuers`;
      requireAccess(actor, resource, name);
      requireDenied(
        actor,
        'get',
        resource,
        `equipment-recovery-${other}-issuers`,
      );
      assert.equal(
        kube([
          '--as',
          actors[actor],
          'get',
          resource,
          `equipment-recovery-${other}-issuers`,
        ]).ok,
        false,
      );
      requireDenied(actor, 'get', resource, 'cluster-admin');
      for (const verb of forbiddenVerbs)
        requireDenied(actor, verb, resource, name);
    }
    for (const name of ['letsencrypt-production', 'letsencrypt-staging'])
      requireAccess(actor, 'clusterissuers', name);
    requireDenied(actor, 'get', 'clusterissuers', 'unrelated');
    assert.equal(
      kube(['--as', actors[actor], 'get', 'clusterissuers', 'unrelated']).ok,
      false,
    );
    for (const verb of forbiddenVerbs)
      requireDenied(actor, verb, 'clusterissuers', 'letsencrypt-production');
    for (const resource of ['applications', 'appprojects']) {
      requireAccess(actor, resource, 'equipment-azure', 'argocd');
      requireDenied(actor, 'get', resource, 'unrelated', 'argocd');
      assert.equal(
        kube([
          '--as',
          actors[actor],
          'get',
          resource,
          'unrelated',
          '-n',
          'argocd',
        ]).ok,
        false,
      );
      for (const verb of forbiddenVerbs)
        requireDenied(actor, verb, resource, 'equipment-azure', 'argocd');
    }
    for (const [namespace, name] of secrets) {
      requireAccess(actor, 'secrets', name, namespace);
      const secret = JSON.parse(
        kube(['get', 'secret', name, '-n', namespace, '-o', 'json']).stdout,
      );
      const update = kube(
        [
          '--as',
          actors[actor],
          'replace',
          '--dry-run=server',
          '-f',
          '-',
          '-o',
          'name',
        ],
        secret,
      );
      const patchFile = resolve(directory, 'secret-patch.json');
      writeFileSync(
        patchFile,
        JSON.stringify([
          {
            op: 'test',
            path: '/metadata/resourceVersion',
            value: secret.metadata.resourceVersion,
          },
        ]),
        { mode: 0o600 },
      );
      const patch = kube([
        '--as',
        actors[actor],
        'patch',
        'secret',
        name,
        '-n',
        namespace,
        '--type=json',
        '--patch-file',
        patchFile,
        '--dry-run=server',
        '-o',
        'name',
      ]);
      assert.equal(
        update.ok,
        actor === 'restore',
        'Existing Secret update scope disagrees with approved actor.',
      );
      assert.equal(
        patch.ok,
        actor === 'restore',
        'Existing Secret patch scope disagrees with approved actor.',
      );
      for (const verb of ['list', 'watch', 'create', 'delete'])
        requireDenied(actor, verb, 'secrets', name, namespace);
      for (const verb of ['patch', 'update'])
        assert.equal(
          can(actor, verb, 'secrets', name, namespace),
          actor === 'restore',
        );
    }
    for (const [namespace, name] of [
      ['equipment', 'unrelated'],
      ['cert-manager', 'equipment-internal-root'],
      ['equipment-recovery', 'unrelated'],
    ]) {
      requireDenied(actor, 'get', 'secrets', name, namespace);
      assert.equal(
        kube(['--as', actors[actor], 'get', 'secrets', name, '-n', namespace])
          .ok,
        false,
      );
    }
    assert.ok(can(actor, 'list', 'pods', undefined, 'equipment'));
    assert.ok(
      kube([
        '--as',
        actors[actor],
        'get',
        'pods',
        '-n',
        'equipment',
        '-o',
        'name',
      ]).ok,
    );
    for (const verb of ['get', 'watch', 'create', 'patch', 'update', 'delete'])
      requireDenied(
        actor,
        verb,
        'pods',
        'never-scheduled-observation',
        'equipment',
      );
    requireDenied(actor, 'list', 'pods', undefined, 'cert-manager');
    for (const name of ['database-bootstrap', 'identity-bootstrap']) {
      assert.equal(
        can(actor, 'get', 'jobs', name, 'equipment'),
        actor === 'restore',
      );
      assert.equal(
        kube([
          '--as',
          actors[actor],
          'get',
          'jobs',
          name,
          '-n',
          'equipment',
          '-o',
          'name',
        ]).ok,
        actor === 'restore',
      );
    }
    requireDenied(actor, 'get', 'jobs', 'unrelated', 'equipment');
    for (const name of [
      'web',
      'inventory',
      'reservations',
      'notifications',
      'keycloak',
    ])
      requireAccess(actor, 'deployments', name, 'equipment');
  }
}
