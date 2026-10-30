import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test(
  'actual recovery authority inspection reads only own exact Roles/Bindings and rejects changed permission or subject',
  { skip: !process.env.KUBECTL },
  async () => {
    const { inspectRecoveryAuthority } =
      await import('./azure-recovery-activation.mjs');
    const principal = '11111111-1111-4111-8111-111111111111';
    const roles = JSON.parse(
      readFileSync(
        'deploy/platform/azure/recovery-controls/roles.json',
        'utf8',
      ),
    ).items;
    let corrupt,
      requests = [];
    const server = createServer((request, response) => {
      const url = new URL(request.url, 'http://localhost');
      requests.push(url.pathname);
      const segments = url.pathname.split('/');
      const name = segments.at(-1),
        kind = segments.at(-2),
        namespace = segments.includes('namespaces') ? segments[5] : undefined;
      const role = roles.find(
        (item) =>
          item.metadata.name === name && item.metadata.namespace === namespace,
      );
      response.setHeader('content-type', 'application/json');
      if (
        url.pathname.includes('/providers/Microsoft.KeyVault/vaults/fixture')
      ) {
        response.end(
          JSON.stringify({
            id: '/subscriptions/subscription/resourceGroups/er-learning-workload/providers/Microsoft.KeyVault/vaults/fixture',
            tags: {
              environment: 'learning',
              generation: corrupt === 'vault-generation' ? 'foreign' : 'g1',
            },
            properties: {
              tenantId: 'tenant',
              vaultUri: 'https://fixture.vault.azure.net/',
            },
          }),
        );
        return;
      }
      if (url.pathname.startsWith('/secrets/')) {
        response.end(
          JSON.stringify({
            id:
              'https://fixture.vault.azure.net' +
              url.pathname +
              '/' +
              'a'.repeat(32),
            value: 'PRIVATE-SOURCE-' + name + '-1234567890abcdef',
            attributes: { enabled: true },
          }),
        );
        return;
      }
      if (name === 'selfsubjectreviews') {
        response.statusCode = 201;
        response.end(
          JSON.stringify({
            apiVersion: 'authentication.k8s.io/v1',
            kind: 'SelfSubjectReview',
            status: {
              userInfo: {
                username: corrupt === 'identity' ? 'foreign' : principal,
              },
            },
          }),
        );
        return;
      }
      if (kind === 'applications') {
        const source =
          name === 'equipment-azure-platform' ? 'platform' : 'application';
        const app = JSON.parse(
          readFileSync(
            'deploy/argocd/azure/' + source + '/application.json',
            'utf8',
          ),
        );
        app.status = {
          sync: { status: 'Synced', revision: 'a'.repeat(40) },
          health: { status: 'Healthy' },
        };
        if (corrupt === 'source') app.spec.source.path = 'foreign';
        response.end(JSON.stringify(app));
        return;
      }
      if (kind === 'appprojects') {
        response.end(
          JSON.stringify({
            kind: 'AppProject',
            metadata: { name: 'equipment-azure', namespace: 'argocd' },
            spec: {
              syncWindows: [
                {
                  kind: 'deny',
                  schedule: '0 20 * * *',
                  duration: '2h',
                  timeZone: 'Europe/Bucharest',
                  manualSync: false,
                  applications: ['equipment-azure'],
                },
              ],
            },
          }),
        );
        return;
      }
      if (kind === 'jobs') {
        response.statusCode = corrupt === 'seed' ? 200 : 404;
        response.end(
          JSON.stringify(
            corrupt === 'seed'
              ? { kind: 'Job', metadata: { name, namespace: 'equipment' } }
              : {
                  kind: 'Status',
                  apiVersion: 'v1',
                  status: 'Failure',
                  code: 404,
                  reason: 'NotFound',
                },
          ),
        );
        return;
      }
      if (!role) {
        response.statusCode = 403;
        response.end(JSON.stringify({ kind: 'Status', code: 403 }));
        return;
      }
      if (kind === 'roles' || kind === 'clusterroles') {
        const actual = globalThis.structuredClone(role);
        if (corrupt === 'rules')
          actual.rules.push({
            apiGroups: ['*'],
            resources: ['*'],
            verbs: ['*'],
          });
        response.end(JSON.stringify(actual));
      } else
        response.end(
          JSON.stringify({
            kind:
              kind === 'rolebindings' ? 'RoleBinding' : 'ClusterRoleBinding',
            metadata: { name, ...(namespace ? { namespace } : {}) },
            roleRef: {
              apiGroup: 'rbac.authorization.k8s.io',
              kind: role.kind,
              name,
            },
            subjects: [
              {
                apiGroup: 'rbac.authorization.k8s.io',
                kind: 'User',
                name: corrupt === 'subject' ? 'foreign' : principal,
              },
            ],
          }),
        );
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const directory = mkdtempSync(join(tmpdir(), 'recovery-authority-')),
      kubeconfig = join(directory, 'kubeconfig.json');
    writeFileSync(
      kubeconfig,
      JSON.stringify({
        apiVersion: 'v1',
        kind: 'Config',
        clusters: [
          {
            name: 'fixture',
            cluster: { server: `http://127.0.0.1:${server.address().port}` },
          },
        ],
        users: [{ name: 'fixture', user: {} }],
        contexts: [
          { name: 'fixture', context: { cluster: 'fixture', user: 'fixture' } },
        ],
        'current-context': 'fixture',
      }),
      { mode: 0o600 },
    );
    try {
      const settings = {
        kubeconfig,
        actor: 'backup',
        principalId: principal,
        kubectl: process.env.KUBECTL,
      };
      const actual = await inspectRecoveryAuthority(settings);
      assert.equal(actual.length, 5);
      assert.equal(requests.length, 10);
      assert.ok(requests.every((path) => !path.includes('restore')));
      const { observeRecoveryActor } =
        await import('./azure-recovery-activation.mjs');
      const actorSettings = {
        ...settings,
        outputs: {
          github_principal_ids: {
            backup: principal,
            restore: '22222222-2222-4222-8222-222222222222',
          },
        },
      };
      const before = requests.length;
      const observed = await observeRecoveryActor(actorSettings);
      assert.equal(observed.actor, 'backup');
      assert.equal(observed.principalId, principal);
      assert.equal(requests.length - before, 11);
      corrupt = 'identity';
      const beforeDenied = requests.length;
      await assert.rejects(observeRecoveryActor(actorSettings), /authority/i);
      assert.equal(requests.length - beforeDenied, 1);
      corrupt = undefined;
      const { collectRecoverySourceFacts } =
        await import('./azure-recovery-activation.mjs');
      const sourceSettings = {
        ...actorSettings,
        config: {
          subscriptionId: 'subscription',
          tenantId: 'tenant',
          environment: 'learning',
          generation: 'g1',
        },
        outputs: {
          ...actorSettings.outputs,
          workload_key_vault_uri: 'https://fixture.vault.azure.net/',
        },
        token: async () => 'PRIVATE-TOKEN',
        request: (url, options) =>
          globalThis.fetch(
            'http://127.0.0.1:' +
              server.address().port +
              new URL(url).pathname +
              new URL(url).search,
            options,
          ),
      };
      const facts = await collectRecoverySourceFacts(sourceSettings);
      assert.equal(facts.producerPrincipalId, principal);
      assert.equal(facts.sourceIdentity.generation, 'g1');
      assert.equal(facts.sourceSecrets.length, 6);
      assert.ok(
        facts.sourceSecrets.every(
          (value) =>
            Object.keys(value).sort().join(',') === 'name,valueHash,version',
        ),
      );
      corrupt = 'vault-generation';
      await assert.rejects(
        collectRecoverySourceFacts(sourceSettings),
        /source/i,
      );
      corrupt = undefined;
      const { observeRecoveryMaintenance } =
        await import('./azure-recovery-activation.mjs');
      const maintenance = await observeRecoveryMaintenance({
        ...settings,
        actor: 'restore',
      });
      assert.equal(maintenance.seedJobs.length, 0);
      assert.equal(maintenance.project.metadata.name, 'equipment-azure');
      corrupt = 'seed';
      assert.equal(
        (await observeRecoveryMaintenance({ ...settings, actor: 'restore' }))
          .seedJobs.length,
        2,
      );
      corrupt = 'source';
      await assert.rejects(observeRecoveryMaintenance(settings), /source/i);
      corrupt = undefined;
      const { observeAzureGitOpsTargets } =
        await import('./azure-recovery-activation.mjs');
      const targets = await observeAzureGitOpsTargets({
        kubeconfig,
        revision: 'a'.repeat(40),
        kubectl: process.env.KUBECTL,
      });
      assert.equal(targets.platform.revision, 'a'.repeat(40));
      assert.equal(targets.application.health, 'Healthy');
      corrupt = 'source';
      await assert.rejects(
        observeAzureGitOpsTargets({
          kubeconfig,
          revision: 'a'.repeat(40),
          kubectl: process.env.KUBECTL,
        }),
        /source/i,
      );
      for (corrupt of ['rules', 'subject'])
        await assert.rejects(inspectRecoveryAuthority(settings), /authority/i);
    } finally {
      rmSync(directory, { recursive: true, force: true });
      await new Promise((resolve) => server.close(resolve));
    }
  },
);

function invokeUntrustedEntry(name) {
  const module = new URL('./azure-recovery-activation.mjs', import.meta.url)
    .href;
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      'import {' +
        name +
        '} from ' +
        JSON.stringify(module) +
        ';try{await ' +
        name +
        '({record:{version:2,qualified:true},token:async()=>{throw Error("PRIVATE-PROVIDER-MARKER")}});process.exitCode=9;}catch(error){console.error(error.message);process.exitCode=1;}',
    ],
    { encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'false' } },
  );
}

test('public activation entry requires protected hosted apply before private inputs or provider execution', () => {
  const result = invokeUntrustedEntry('executeRecoveryActivation');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /protected hosted apply/i);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /PRIVATE-PROVIDER-MARKER|qualified/,
  );
});

test('established recovery validation cannot trust a caller record outside the protected actual checkout', () => {
  const result = invokeUntrustedEntry('validateEstablishedRecoveryActivation');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /protected hosted/i);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /PRIVATE-PROVIDER-MARKER|qualified/,
  );
});
