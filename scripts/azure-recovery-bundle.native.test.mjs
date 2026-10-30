import {
  finishNativeFixture,
  nativePrerequisitePhases,
  waitForNativeClusterIssuer,
} from './azure-native-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { createHash, createPrivateKey, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createServer, createSecureContext, connect } from 'node:tls';
import parsers from '@stoplight/spectral-parsers';
import { runPrivateProcess } from './azure-infrastructure.mjs';
import { qualityContext, verifiedTool } from './azure-quality.mjs';
import {
  azureRuntimeFixtureInput,
  removeAzureFixtureDirectory,
} from './azure-runtime-fixture.mjs';
import { createGeneratorInput } from './azure-generator-input.mjs';
import { renderRuntimeProjection } from './azure-runtime.mjs';
import { createRecoveryBundle } from './azure-recovery-bundle.mjs';
import { createPrivateDirectory } from './local-platform.mjs';

// Real Kubernetes API/RBAC/resourceVersion and native TLS are the boundaries here.
// Issuer status is explicitly seeded, with no controller or invented advancement.
// The independent azure-acme contract covers actual controller account recovery.
// External Key Vault is a response double; this test makes no Azure claim.
test(
  'native recovery bundle preserves five existing Secrets with exact RBAC, real version conflicts and trusted served TLS',
  { skip: process.env.AZURE_PROVIDER_CONTRACTS !== '1', timeout: 360000 },
  async () => {
    const root = resolve(import.meta.dirname, '..');
    const context = qualityContext(),
      kind = verifiedTool(context, 'kind'),
      kubectl = verifiedTool(context, 'kubectl');
    const provider = process.env.CONTAINER_RUNTIME ?? 'podman';
    assert.ok(['podman', 'docker'].includes(provider));
    const directory = mkdtempSync(
      resolve(tmpdir(), 'equipment-bundle-native-'),
    );
    createPrivateDirectory(directory);
    const name = `equipment-bundle-${randomUUID().slice(0, 8)}`,
      kubeconfig = resolve(directory, 'config');
    const env = { ...process.env, KIND_EXPERIMENTAL_PROVIDER: provider };
    let phase = 'kind-create';
    let primary;
    const run = (tool, args, input, timeout = 60000) =>
      runPrivateProcess(tool, args, {
        env,
        input: input === undefined ? undefined : JSON.stringify(input),
        timeout,
        operation: `Native fixture ${phase}`,
        failurePolicy:
          tool === kubectl && nativePrerequisitePhases.includes(phase)
            ? 'kubectl-prerequisite'
            : undefined,
        tool: tool === kind ? 'kind' : tool === kubectl ? 'kubectl' : 'openssl',
      });
    const kube = (args, body) => {
      if (args.includes('--patch-file') && args.at(-1) === '-') {
        const path = resolve(directory, 'private-status-patch.json');
        writeFileSync(path, JSON.stringify(body), { mode: 0o600 });
        args = [...args.slice(0, -1), path];
        body = undefined;
      }
      return run(
        kubectl,
        ['--kubeconfig', kubeconfig, '--context', `kind-${name}`, ...args],
        body,
      );
    };
    const apply = (body) => kube(['apply', '-f', '-'], body);
    const read = async (namespace, secret) =>
      JSON.parse(
        await kube(['get', 'secret', secret, '-n', namespace, '-o', 'json']),
      );
    let created = false,
      tls;
    try {
      created = true;
      await run(
        kind,
        [
          'create',
          'cluster',
          '--name',
          name,
          '--image',
          'kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0',
          '--kubeconfig',
          kubeconfig,
          '--wait',
          '120s',
        ],
        undefined,
        180000,
      );
      for (const [namespace, prerequisitePhase] of [
        ['equipment', 'prereq-namespace-equipment'],
        ['equipment-recovery', 'prereq-namespace-equipment-recovery'],
        ['cert-manager', 'prereq-namespace-cert-manager'],
        ['argocd', 'prereq-namespace-argocd'],
      ]) {
        phase = prerequisitePhase;
        await apply({
          apiVersion: 'v1',
          kind: 'Namespace',
          metadata: { name: namespace },
        });
      }
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
      phase = 'prereq-clusterissuer-crd-apply';
      await apply(
        certDocuments.find(
          (item) =>
            item.kind === 'CustomResourceDefinition' &&
            item.metadata.name === 'clusterissuers.cert-manager.io',
        ),
      );
      phase = 'prereq-clusterissuer-established';
      await waitForNativeClusterIssuer({
        kubeconfig,
        context: `kind-${name}`,
        kubectl,
      });
      const fixture = azureRuntimeFixtureInput();
      const actors = {
        backup: '11111111-1111-4111-8111-111111111111',
        restore: '33333333-3333-4333-8333-333333333333',
      };
      fixture.foundation.github_principal_ids = actors;
      const projection = renderRuntimeProjection(createGeneratorInput(fixture));
      phase = 'prereq-role-definitions';
      await apply(
        JSON.parse(
          readFileSync(
            resolve(root, 'deploy/platform/azure/recovery-controls/roles.json'),
            'utf8',
          ),
        ),
      );
      phase = 'prereq-recovery-bindings';
      await apply(JSON.parse(projection.recoveryFiles['bindings.json']));
      phase = 'prereq-continuity-bindings';
      await apply(
        JSON.parse(
          projection.platformFiles['recovery-continuity-bindings.json'],
        ),
      );
      phase = 'tls-generate';
      const contexts = {},
        roots = [],
        entries = [];
      const openssl =
        process.platform === 'win32'
          ? 'C:/Program Files/Git/usr/bin/openssl.exe'
          : 'openssl';
      for (const [namespace, secret, hosts] of [
        [
          'equipment',
          'equipment-tls',
          ['app.codingfunlab.com', 'identity.codingfunlab.com'],
        ],
        ['equipment', 'dashboard-public-tls', ['dashboard.codingfunlab.com']],
        ['argocd', 'argocd-public-tls', ['argocd.codingfunlab.com']],
      ]) {
        const keyPath = resolve(directory, secret + '.key'),
          certPath = resolve(directory, secret + '.crt');
        await run(openssl, [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-days',
          '1',
          '-keyout',
          keyPath,
          '-out',
          certPath,
          '-subj',
          "/CN=fixture/O=Let's Encrypt",
          '-addext',
          'subjectAltName=' + hosts.map((host) => 'DNS:' + host).join(','),
        ]);
        const key = readFileSync(keyPath),
          cert = readFileSync(certPath);
        roots.push(cert);
        for (const host of hosts)
          contexts[host] = createSecureContext({ key, cert });
        entries.push({
          apiVersion: 'v1',
          kind: 'Secret',
          metadata: {
            namespace,
            name: secret,
            annotations: { 'destination-owner': 'initial' },
          },
          type: 'kubernetes.io/tls',
          data: {
            'tls.key': key.toString('base64'),
            'tls.crt': cert.toString('base64'),
          },
        });
      }
      const key = entries[0].data['tls.key'],
        hash = createHash('sha256')
          .update(
            createPrivateKey(Buffer.from(key, 'base64')).export({
              type: 'pkcs1',
              format: 'der',
            }),
          )
          .digest('base64');
      phase = 'issuer-seed';
      for (const stage of ['production', 'staging']) {
        const issuerName = 'letsencrypt-' + stage,
          secret = issuerName + '-account';
        const server =
          stage === 'production'
            ? 'https://acme-v02.api.letsencrypt.org/directory'
            : 'https://acme-staging-v02.api.letsencrypt.org/directory';
        entries.push({
          apiVersion: 'v1',
          kind: 'Secret',
          metadata: { namespace: 'cert-manager', name: secret },
          type: 'Opaque',
          data: { 'tls.key': key },
        });
        await apply({
          apiVersion: 'cert-manager.io/v1',
          kind: 'ClusterIssuer',
          metadata: { name: issuerName },
          spec: {
            acme: {
              server,
              privateKeySecretRef: { name: secret },
              solvers: [],
            },
          },
        });
        await kube(
          [
            'patch',
            'clusterissuer',
            issuerName,
            '--subresource=status',
            '--type=merge',
            '--patch-file',
            '-',
          ],
          {
            status: {
              acme: {
                uri: new URL('/acme/acct/123', server).href,
                lastPrivateKeyHash: hash,
              },
              conditions: [
                {
                  type: 'Ready',
                  status: 'True',
                  lastTransitionTime: new Date().toISOString(),
                  reason: 'FixtureSeed',
                  message: 'Explicitly seeded; no controller claim',
                },
              ],
            },
          },
        );
      }
      for (const entry of entries) await apply(entry);
      phase = 'tls-start';
      tls = createServer(
        { SNICallback: (host, callback) => callback(null, contexts[host]) },
        (socket) => socket.end(),
      );
      await new Promise((resolve) => tls.listen(0, '127.0.0.1', resolve));
      const admin = JSON.parse(
        await kube(['config', 'view', '--raw', '-o', 'json']),
      );
      const actorConfig = {};
      for (const actor of ['backup', 'restore']) {
        const config = globalThis.structuredClone(admin);
        for (const user of config.users) user.user.as = actors[actor];
        actorConfig[actor] = resolve(directory, actor + '.json');
        writeFileSync(actorConfig[actor], JSON.stringify(config), {
          mode: 0o600,
        });
      }
      let vaultWrites = 0;
      const settings = {
        config: {
          environment: 'lab',
          generation: 'g1',
          tenantId: 'tenant',
          subscriptionId: 'subscription',
          domain: 'codingfunlab.com',
        },
        outputs: {
          workload_key_vault_uri: 'https://fixture.vault.azure.net/',
          ingress_public_ip: '8.8.8.8',
        },
        kubectl,
        token: async () => 'PRIVATE-FIXTURE-TOKEN',
        request: async (url, options) => {
          if (options.method === 'PUT') vaultWrites++;
          const secret = new URL(url).pathname.split('/')[2];
          const body =
            options.method === 'PUT'
              ? JSON.parse(options.body)
              : {
                  value: 'PRIVATE-' + secret + '-1234567890abcdef',
                  attributes: { enabled: true },
                };
          return new globalThis.Response(
            JSON.stringify({
              id: `https://fixture.vault.azure.net/secrets/${secret}/${'a'.repeat(32)}`,
              ...body,
            }),
            { status: 200 },
          );
        },
        connect: (options) =>
          connect({
            ...options,
            host: '127.0.0.1',
            port: tls.address().port,
            ca: roots,
          }),
      };
      const backup = createRecoveryBundle({
        ...settings,
        kubeconfig: actorConfig.backup,
        actor: 'backup',
      });
      const restore = createRecoveryBundle({
        ...settings,
        kubeconfig: actorConfig.restore,
        actor: 'restore',
      });
      phase = 'capture-inventory';
      const bytes = await backup.capture(),
        bundle = JSON.parse(bytes.toString());
      assert.equal(bundle.kubernetes.length, 5);
      assert.equal(bundle.identity.secrets.length, 6);
      // This is the independently selected original point metadata. Mutated
      // bundle payloads below never supply their own trusted source context.
      phase = 'source-validation';
      const sourceContext = {
        sourceIdentity: {
          vaultUri: 'https://fixture.vault.azure.net',
          vaultId:
            '/subscriptions/subscription/resourceGroups/source/providers/Microsoft.KeyVault/vaults/fixture',
          tenantId: 'tenant',
          generation: 'g1',
        },
        sourceSecrets: bundle.identity.secrets.map(
          ({ name, version, valueHash }) => ({ name, version, valueHash }),
        ),
      };
      const versions = () =>
        Promise.all(
          entries.map(
            async ({ metadata }) =>
              (await read(metadata.namespace, metadata.name)).metadata
                .resourceVersion,
          ),
        );
      const originalVersions = await versions();
      const foreignContext = globalThis.structuredClone(sourceContext);
      foreignContext.sourceIdentity.vaultUri =
        'https://foreign.vault.azure.net';
      foreignContext.sourceIdentity.vaultId =
        '/subscriptions/subscription/resourceGroups/source/providers/Microsoft.KeyVault/vaults/foreign';
      const malformedContext = globalThis.structuredClone(sourceContext);
      delete malformedContext.sourceIdentity.vaultId;
      const badVersions = globalThis.structuredClone(sourceContext);
      badVersions.sourceSecrets[0].valueHash = 'f'.repeat(64);
      for (const selectedContext of [
        undefined,
        {},
        foreignContext,
        malformedContext,
        badVersions,
      ]) {
        await assert.rejects(
          restore.restore(bytes, selectedContext),
          /bundle/i,
        );
        assert.equal(
          vaultWrites,
          0,
          'Untrusted source context must cause zero Key Vault writes.',
        );
        assert.deepEqual(
          await versions(),
          originalVersions,
          'Untrusted source context must cause zero Kubernetes Secret writes.',
        );
      }
      const foreignBundle = globalThis.structuredClone(bundle);
      foreignBundle.identity.source.vaultUri =
        foreignContext.sourceIdentity.vaultUri;
      await assert.rejects(
        restore.restore(
          Buffer.from(JSON.stringify(foreignBundle)),
          sourceContext,
        ),
        /bundle/i,
      );
      assert.equal(vaultWrites, 0);
      assert.deepEqual(await versions(), originalVersions);

      phase = 'secret-restore';
      const before = await read('equipment', 'equipment-tls');
      await kube([
        'annotate',
        'secret',
        'equipment-tls',
        '-n',
        'equipment',
        'destination-owner=current',
        '--overwrite',
      ]);
      const replacedTls = await read('equipment', 'equipment-tls');
      replacedTls.data = entries[1].data;
      const tlsPath = resolve(directory, 'replacement-tls.json');
      writeFileSync(tlsPath, JSON.stringify(replacedTls), { mode: 0o600 });
      await kube(['replace', '-f', tlsPath]);
      const destinationTls = await read('equipment', 'equipment-tls');
      await restore.restore(bytes, sourceContext);
      const after = await read('equipment', 'equipment-tls');
      assert.equal(after.metadata.uid, before.metadata.uid);
      assert.notEqual(
        after.metadata.resourceVersion,
        destinationTls.metadata.resourceVersion,
      );
      assert.equal(after.metadata.annotations['destination-owner'], 'current');
      assert.ok(
        JSON.stringify(after.data) === JSON.stringify(before.data),
        'Restored private Secret data must match without printing values.',
      );
      // A real stale resourceVersion is rejected by the API without overwriting current data.
      phase = 'stale-version-negative';
      const stalePath = resolve(directory, 'stale.json');
      writeFileSync(stalePath, JSON.stringify(before), { mode: 0o600 });
      await assert.rejects(kube(['replace', '-f', stalePath]));
      assert.equal(
        (await read('equipment', 'equipment-tls')).metadata.resourceVersion,
        after.metadata.resourceVersion,
      );
      phase = 'actor-authority-negative';
      const existingPath = resolve(directory, 'existing.json');
      writeFileSync(existingPath, JSON.stringify(after), { mode: 0o600 });
      await assert.rejects(
        run(kubectl, [
          '--kubeconfig',
          actorConfig.backup,
          'replace',
          '-f',
          existingPath,
        ]),
      );
      assert.equal(
        (await read('equipment', 'equipment-tls')).metadata.resourceVersion,
        after.metadata.resourceVersion,
      );
      // Neither actual actor can create even a harmless unrelated Secret.
      const forbiddenPath = resolve(directory, 'forbidden.json');
      writeFileSync(
        forbiddenPath,
        JSON.stringify({
          apiVersion: 'v1',
          kind: 'Secret',
          metadata: { namespace: 'equipment', name: 'not-allowed' },
          data: {},
        }),
        { mode: 0o600 },
      );
      for (const actor of ['backup', 'restore']) {
        await assert.rejects(
          run(kubectl, [
            '--kubeconfig',
            actorConfig[actor],
            'create',
            '-f',
            forbiddenPath,
          ]),
        );
      }
      await assert.rejects(read('equipment', 'not-allowed'));
      phase = 'untrusted-tls-negative';
      const untrusted = createRecoveryBundle({
        ...settings,
        kubeconfig: actorConfig.backup,
        actor: 'backup',
        connect: (options) =>
          connect({ ...options, host: '127.0.0.1', port: tls.address().port }),
      });
      await assert.rejects(untrusted.capture(), /bundle/i);
      // Source key/status mismatch is not accepted just because Ready remains True.
      phase = 'stale-ready-negative';
      const statusFile = resolve(directory, 'status.json');
      writeFileSync(
        statusFile,
        JSON.stringify({
          status: {
            acme: {
              uri: 'https://acme-v02.api.letsencrypt.org/acme/acct/stale',
              lastPrivateKeyHash: hash,
            },
          },
        }),
        { mode: 0o600 },
      );
      await kube([
        'patch',
        'clusterissuer',
        'letsencrypt-production',
        '--subresource=status',
        '--type=merge',
        '--patch-file',
        statusFile,
      ]);
      const replacedAccount = await read(
        'cert-manager',
        'letsencrypt-production-account',
      );
      replacedAccount.data['tls.key'] = entries[1].data['tls.key'];
      const accountPath = resolve(directory, 'replacement-account.json');
      writeFileSync(accountPath, JSON.stringify(replacedAccount), {
        mode: 0o600,
      });
      await kube(['replace', '-f', accountPath]);
      const accountBefore = await read(
        'cert-manager',
        'letsencrypt-production-account',
      );
      const tlsBefore = await read('equipment', 'equipment-tls');
      await assert.rejects(
        createRecoveryBundle({
          ...settings,
          kubeconfig: actorConfig.restore,
          actor: 'restore',
          timeoutMs: 15000,
        }).restore(bytes, sourceContext),
        /bundle/i,
      );
      assert.notEqual(
        (await read('cert-manager', 'letsencrypt-production-account')).metadata
          .resourceVersion,
        accountBefore.metadata.resourceVersion,
        'Failure must follow a real account-key PUT, not preflight timeout.',
      );
      assert.equal(
        (await read('equipment', 'equipment-tls')).metadata.resourceVersion,
        tlsBefore.metadata.resourceVersion,
        'Stale issuer status must block subsequent public TLS writes.',
      );
      // No fixture updates issuer status to manufacture convergence after this failure.
      phase = 'missing-secret-negative';
      await kube([
        'delete',
        'secret',
        'dashboard-public-tls',
        '-n',
        'equipment',
      ]);
      await assert.rejects(restore.restore(bytes, sourceContext), /bundle/i);
      await assert.rejects(read('equipment', 'dashboard-public-tls'));
    } catch (error) {
      primary = error;
    } finally {
      await finishNativeFixture({
        primary,
        phase,
        cleanups: [
          {
            phase: 'tls-close',
            tool: 'fixture',
            run: async () => {
              if (tls)
                await new Promise((resolve, reject) =>
                  tls.close((error) => (error ? reject(error) : resolve())),
                );
            },
          },
          {
            phase: 'cluster-delete',
            tool: 'kind',
            run: async () => {
              if (created)
                await run(
                  kind,
                  [
                    'delete',
                    'cluster',
                    '--name',
                    name,
                    '--kubeconfig',
                    kubeconfig,
                  ],
                  undefined,
                  60000,
                );
            },
          },
          {
            phase: 'private-directory-remove',
            tool: 'fixture',
            run: () =>
              removeAzureFixtureDirectory(
                directory,
                'equipment-bundle-native-',
              ),
          },
        ],
      });
    }
  },
);
