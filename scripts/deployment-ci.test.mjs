import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  writeFileSync,
  readFileSync,
  statSync,
  rmSync,
  mkdtempSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { imageNames } from './deployment-validation.mjs';
import {
  buildImages,
  createEphemeralCluster,
  ciResources,
  prepareCiFixture,
} from './deployment-ci.mjs';

test('CI builds only local test images without publication; release indexes retain source', () => {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, args]);
    return JSON.stringify({
      'containerimage.digest': `sha256:${'a'.repeat(64)}`,
    });
  };
  const metadata = () => ({
    'containerimage.digest': `sha256:${'a'.repeat(64)}`,
  });
  const local = buildImages({ sourceRevision: 'b'.repeat(40), run, metadata });
  assert.deepEqual(Object.keys(local.images).sort(), [...imageNames].sort());
  assert.ok(calls.every(([, args]) => !args.includes('--push')));
  calls.length = 0;
  const release = buildImages({
    sourceRevision: 'b'.repeat(40),
    repository: 'Example/Equipment',
    publish: true,
    run,
    metadata,
  });
  assert.equal(release.images.web.image, 'ghcr.io/example/equipment-web');
  assert.ok(
    calls
      .filter(([command]) => command === 'docker')
      .every(
        ([, args]) =>
          args.includes('--push') && args.includes('linux/amd64,linux/arm64'),
      ),
  );
});

test('ephemeral cluster is named and isolated, and cannot apply without real fixture', () => {
  const calls = [];
  assert.throws(
    () => createEphemeralCluster({ run: (...args) => calls.push(args) }),
    /fixture/,
  );
  assert.equal(calls.length, 0);
});

test('CI transforms only declared app images and physical node binding while preserving canonical issuer', () => {
  const release = {
    sourceRevision: 'b'.repeat(40),
    tags: imageNames.map((name) => `equipment-ci/${name}:${'b'.repeat(40)}`),
  };
  const rendered =
    'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  template:\n    spec:\n      containers:\n        - name: web\n          image: web\n          resources:\n            requests: {cpu: 50m, memory: 32Mi}\n            limits: {cpu: 250m, memory: 128Mi}\n          env:\n            - name: AUTHORITY\n              value: https://identity.equipment.test/realms/equipment\n';
  const [resource] = ciResources(rendered, release);
  const container = resource.spec.template.spec.containers[0];
  assert.equal(container.image, `equipment-ci/web:${release.sourceRevision}`);
  assert.equal(container.imagePullPolicy, 'Never');
  assert.equal(
    container.env[0].value,
    'https://identity.equipment.test/realms/equipment',
  );
  assert.throws(
    () =>
      ciResources(
        rendered.replace('image: web', 'image: unknown-app'),
        release,
      ),
    /image/,
  );
});

test('successful CI orchestration keeps kubeconfig private and scopes validation, apply and waits to its disposable context', () => {
  const calls = [];
  const run = (command, args) => {
    calls.push({ command, args });
    if (command === 'kind' && args[0] === 'create')
      writeFileSync(args[args.indexOf('--kubeconfig') + 1], 'test-kubeconfig', {
        mode: 0o644,
      });
    return '';
  };
  const result = createEphemeralCluster({
    run,
    release: { tags: ['equipment-ci/web:test'] },
    fixture: ({ directory }) => ({
      state: directory,
      ca: 'public-ca',
      waves: [
        {
          manifests: 'temporary-wave.json',
          resources: [
            {
              kind: 'Job',
              metadata: {
                namespace: 'equipment',
                name: 'database-bootstrap-example',
                annotations: {
                  'argocd.argoproj.io/hook': 'Sync',
                  'argocd.argoproj.io/hook-delete-policy':
                    'HookSucceeded,BeforeHookCreation',
                },
              },
            },
          ],
        },
      ],
    }),
  });
  try {
    assert.equal(statSync(result.kubeconfig).mode & 0o777, 0o600);
    assert.equal(
      JSON.parse(readFileSync(`${result.directory}/kind.json`, 'utf8')).name,
      'equipment-ci',
    );
    const kubectl = calls.filter((call) => call.command === 'kubectl');
    assert.ok(
      kubectl.every(
        (call) =>
          call.args.includes('kind-equipment-ci') &&
          call.args.includes(result.kubeconfig),
      ),
    );
    assert.ok(kubectl[0].args.includes('--dry-run=server'));
    assert.ok(kubectl.at(-1).args.includes('--for=condition=Complete'));
  } finally {
    rmSync(result.directory, { recursive: true, force: true });
  }
});

test('CI tests current source even after the local overlay has a genuine digest promotion', () => {
  const sourceRevision = 'b'.repeat(40);
  const image = `ghcr.io/example/equipment-web@sha256:${'a'.repeat(64)}`;
  const rendered = JSON.stringify({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'web' },
    spec: {
      template: {
        spec: {
          containers: [
            {
              name: 'web',
              image,
              resources: {
                requests: { cpu: '50m', memory: '32Mi' },
                limits: { cpu: '250m', memory: '128Mi' },
              },
            },
          ],
        },
      },
    },
  });
  const release = {
    sourceRevision,
    tags: [`equipment-ci/web:${sourceRevision}`],
  };
  const [resource] = ciResources(rendered, release, { web: image });
  assert.equal(
    resource.spec.template.spec.containers[0].image,
    release.tags[0],
  );
});

test('invalid committed source is rejected before CI credential generation or external mutation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'invalid-ci-source-'));
  let calls = 0;
  try {
    assert.throws(() =>
      prepareCiFixture({
        root: directory,
        directory,
        kubeconfig: join(directory, 'kubeconfig'),
        context: 'kind-equipment-ci',
        release: {},
        run: () => {
          calls++;
          return '';
        },
      }),
    );
    assert.equal(calls, 0);
    assert.equal(existsSync(join(directory, '.local')), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function failedJobFixture(t, diagnosticResponse) {
  const calls = [];
  let directory;
  const name = `database-bootstrap-${'a'.repeat(16)}`;
  const run = (command, args, options = {}) => {
    calls.push({ command, args, options });
    if (command === 'kind' && args[0] === 'create') {
      const path = args[args.indexOf('--kubeconfig') + 1];
      writeFileSync(path, 'test-kubeconfig', { mode: 0o600 });
    }
    if (command === 'kubectl' && args.includes('wait'))
      throw new Error('provider-private-password sentinel');
    if (command === 'kubectl' && args.includes('get'))
      return diagnosticResponse(args);
    return '';
  };
  t.after(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  return {
    calls,
    name,
    invoke: () =>
      createEphemeralCluster({
        root: process.cwd(),
        run,
        release: { tags: [] },
        fixture: (settings) => {
          directory = settings.directory;
          return {
            state: directory,
            ca: 'public-ca',
            waves: [
              {
                manifests: 'private-wave.json',
                resources: [
                  { kind: 'Job', metadata: { namespace: 'equipment', name } },
                ],
              },
            ],
          };
        },
      }),
  };
}

test('failed CI Job wait identifies exact public stage and emits only bounded allowlisted status fields', (t) => {
  const fixture = failedJobFixture(t, (args) =>
    JSON.stringify(
      args.includes(`job/${fixture.name}`)
        ? {
            status: {
              conditions: [
                {
                  type: 'Failed',
                  status: 'True',
                  reason: 'BackoffLimitExceeded',
                  message: 'private-password',
                },
              ],
            },
            spec: { secret: 'private-password' },
          }
        : {
            items: [
              {
                metadata: { name: 'private-password' },
                status: {
                  phase: 'Failed',
                  message: 'private-password',
                  initContainerStatuses: [
                    {
                      name: 'private-password',
                      state: {
                        waiting: {
                          reason: 'private-password',
                          message: 'private-password',
                        },
                      },
                    },
                  ],
                  containerStatuses: [
                    {
                      name: 'private-password',
                      state: {
                        terminated: {
                          exitCode: 1,
                          message: 'private-password',
                          reason: 'private-password',
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
    ),
  );
  assert.throws(fixture.invoke, (error) => {
    assert.match(error.message, new RegExp(`Job/equipment/${fixture.name}`));
    assert.match(error.message, /BackoffLimitExceeded/);
    assert.match(error.message, /exitCode.*1/);
    assert.match(error.message, /Other/);
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(
      error.message,
      /private-password|provider-private|sentinel/,
    );
    assert.ok(Buffer.byteLength(error.message) < 16 * 1024);
    return true;
  });
  const queries = fixture.calls.filter((call) => call.args.includes('get'));
  assert.equal(queries.length, 2);
  assert.ok(
    queries.every(
      ({ args, options }) =>
        args.includes('kind-equipment-ci') &&
        args.includes('--request-timeout=5s') &&
        options.timeout === 6000 &&
        options.maxBuffer === 128 * 1024,
    ),
  );
  assert.ok(
    queries.some(({ args }) =>
      args.includes(`batch.kubernetes.io/job-name=${fixture.name}`),
    ),
  );
  assert.ok(
    fixture.calls.every(
      ({ args }) => !args.includes('logs') && !args.includes('events'),
    ),
  );
});

test('diagnostic query failures, malformed or oversized responses preserve a sanitized named Job failure', (t) => {
  for (const response of [
    () => {
      throw new Error('private-password');
    },
    () => '{bad',
    () => 'x'.repeat(128 * 1024 + 1),
  ]) {
    const fixture = failedJobFixture(t, response);
    assert.throws(fixture.invoke, (error) => {
      assert.match(error.message, new RegExp(`Job/equipment/${fixture.name}`));
      assert.match(error.message, /diagnosticsUnavailable/);
      assert.doesNotMatch(
        error.message,
        /private-password|provider-private|sentinel/,
      );
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test('Job diagnostic enums, count and numeric projection cannot echo arbitrary provider values', (t) => {
  const fixture = failedJobFixture(t, (args) =>
    JSON.stringify(
      args.includes(`job/${fixture.name}`)
        ? {
            status: {
              conditions: Array.from({ length: 20 }, () => ({
                type: 'private-password',
                status: 'private-password',
                reason: 'private-password',
              })),
            },
          }
        : {
            items: Array.from({ length: 20 }, () => ({
              status: {
                phase: 'private-password',
                containerStatuses: Array.from({ length: 20 }, () => ({
                  state: { terminated: { exitCode: 'private-password' } },
                })),
              },
            })),
          },
    ),
  );
  assert.throws(fixture.invoke, (error) => {
    assert.doesNotMatch(error.message, /private-password|exitCode/);
    const status = JSON.parse(error.message.slice(error.message.indexOf('{')));
    assert.equal(status.jobConditions.length, 10);
    assert.equal(status.pods.length, 10);
    assert.ok(
      status.pods.every(
        (pod) => pod.phase === 'Other' && pod.containers.length === 10,
      ),
    );
    assert.ok(Buffer.byteLength(error.message) < 16 * 1024);
    return true;
  });
});
