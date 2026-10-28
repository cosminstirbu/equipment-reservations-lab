import {
  finishNativeFixture,
  waitForNativeClusterIssuer,
} from './azure-native-fixture.mjs';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  randomUUID,
  createHash,
  createPrivateKey,
  generateKeyPairSync,
} from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import test from 'node:test';
import parsers from '@stoplight/spectral-parsers';
import { executeProcess } from './process.mjs';
import { runPrivateProcess } from './azure-infrastructure.mjs';
import { qualityContext, verifiedTool } from './azure-quality.mjs';
import { removeAzureFixtureDirectory } from './azure-runtime-fixture.mjs';
import { assertAcmeReconciliation } from './azure-recovery-kubernetes.mjs';

const root = resolve(import.meta.dirname, '..');
const nodeImage =
  'kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0';
const pebbleImage =
  'ghcr.io/letsencrypt/pebble@sha256:ddf230642b1a584f519f32e347de1b05a6e4c1f6c35c1863b33effeab5f78199';
const controllerImage =
  'quay.io/jetstack/cert-manager-controller@sha256:9f4f96a33c7774cef24466fcd85031997531a03a8d117f151126baa8d1290dcc';
const directory = 'https://pebble.cert-manager.svc:14000/dir';
const accountNames = ['letsencrypt-production', 'letsencrypt-staging'];

function keyChecksum(pem) {
  return createHash('sha256')
    .update(createPrivateKey(pem).export({ type: 'pkcs1', format: 'der' }))
    .digest('base64');
}

function newKey() {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  }).privateKey;
}

// Real controller+CRDs and Pebble's real ACME registration endpoint are retained.
// No DNS/HTTP challenge, public issuance, renewal, Azure identity or browser claim.
// Controller outage preserves Pebble's in-memory accounts in a separate Pod.
// All account keys, provider status and kubeconfig stay in the private fixture.
test(
  'pinned cert-manager restores both original Pebble accounts after cached new accounts and rejects stale Ready, wrong key and directory',
  { skip: process.env.AZURE_PROVIDER_CONTRACTS !== '1', timeout: 600000 },
  async () => {
    const context = qualityContext();
    const kind = verifiedTool(context, 'kind');
    const kubectl = verifiedTool(context, 'kubectl');
    const provider = process.env.CONTAINER_RUNTIME ?? 'podman';
    assert.ok(['podman', 'docker'].includes(provider));
    const temporary = mkdtempSync(resolve(tmpdir(), 'equipment-acme-'));
    const cluster = `equipment-acme-${randomUUID().slice(0, 8)}`;
    const kubeconfig = resolve(temporary, 'config');
    const env = { ...process.env, KIND_EXPERIMENTAL_PROVIDER: provider };
    let phase = 'kind-create';
    let primary;
    const run = (tool, args, input, timeout = 60000) =>
      runPrivateProcess(tool, args, {
        env,
        input,
        timeout,
        operation: `Private pinned ACME fixture ${phase}`,
        tool: tool === kind ? 'kind' : 'kubectl',
        maxBuffer: 16 * 1024 * 1024,
      });
    const kube = (args, input) =>
      run(
        kubectl,
        ['--kubeconfig', kubeconfig, '--context', `kind-${cluster}`, ...args],
        input === undefined ? undefined : JSON.stringify(input),
      );
    const apply = (value) => kube(['apply', '-f', '-'], value);
    const get = async (kind, name, namespace) =>
      JSON.parse(
        await kube([
          'get',
          kind,
          name,
          ...(namespace ? ['-n', namespace] : []),
          '-o',
          'json',
        ]),
      );
    const poll = async (observe, predicate, label, attempts = 120) => {
      for (let attempt = 0; attempt < attempts; attempt++) {
        const value = await observe();
        if (predicate(value)) return value;
        await wait(500);
      }
      throw new Error(
        `Pinned ACME provider did not reach ${label} within its bound.`,
      );
    };
    const ready = (issuer) =>
      issuer.status?.conditions?.some(
        (condition) =>
          condition.type === 'Ready' && condition.status === 'True',
      );
    const replaceKey = async (name, pem) => {
      const secret = await get('secret', name + '-account', 'cert-manager');
      secret.data = { 'tls.key': Buffer.from(pem).toString('base64') };
      const replaced = JSON.parse(
        await kube(['replace', '-f', '-', '-o', 'json'], secret),
      );
      return replaced.metadata.resourceVersion;
    };
    let created = false;
    try {
      phase = 'tls-generate';
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
          resolve(temporary, 'tls.key'),
          '-out',
          resolve(temporary, 'tls.crt'),
          '-days',
          '1',
          '-subj',
          '/CN=pebble.cert-manager.svc',
          '-addext',
          'subjectAltName=DNS:pebble.cert-manager.svc',
        ],
        {
          operation: 'Ephemeral ACME fixture TLS',
          tool: 'openssl',
          output: 'private-capture',
          timeout: 30000,
        },
      );
      phase = 'kind-create';
      created = true;
      await run(
        kind,
        [
          'create',
          'cluster',
          '--name',
          cluster,
          '--image',
          nodeImage,
          '--kubeconfig',
          kubeconfig,
          '--wait',
          '120s',
        ],
        undefined,
        180000,
      );
      phase = 'prerequisites-install';
      const rendered = await kube([
        'kustomize',
        resolve(root, 'deploy/platform/azure/certificates/controller'),
      ]);
      const documents = rendered
        .split(/^---\s*$/m)
        .filter((part) => part.trim())
        .map((part) => {
          const parsed = parsers.Yaml.parse(part);
          assert.equal(parsed.diagnostics.length, 0);
          return parsed.data;
        });
      const prerequisites = documents.filter((item) =>
        [
          'Namespace',
          'CustomResourceDefinition',
          'ServiceAccount',
          'Role',
          'RoleBinding',
          'ClusterRole',
          'ClusterRoleBinding',
        ].includes(item.kind),
      );
      await apply({ apiVersion: 'v1', kind: 'List', items: prerequisites });
      phase = 'prereq-clusterissuer-established';
      await waitForNativeClusterIssuer({
        kubeconfig,
        context: `kind-${cluster}`,
        kubectl,
      });
      phase = 'prerequisites-install';
      const certificate = readFileSync(resolve(temporary, 'tls.crt'));
      await apply({
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: { name: 'pebble-fixture', namespace: 'cert-manager' },
        type: 'Opaque',
        data: {
          'tls.crt': certificate.toString('base64'),
          'tls.key': readFileSync(resolve(temporary, 'tls.key')).toString(
            'base64',
          ),
          'config.json': Buffer.from(
            JSON.stringify({
              pebble: {
                listenAddress: '0.0.0.0:14000',
                managementListenAddress: '0.0.0.0:15000',
                certificate: '/fixture/tls.crt',
                privateKey: '/fixture/tls.key',
                httpPort: 5002,
                tlsPort: 5001,
              },
            }),
          ).toString('base64'),
        },
      });
      await apply({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'pebble', namespace: 'cert-manager' },
        spec: {
          replicas: 1,
          selector: { matchLabels: { fixture: 'pebble' } },
          template: {
            metadata: { labels: { fixture: 'pebble' } },
            spec: {
              automountServiceAccountToken: false,
              securityContext: {
                runAsNonRoot: true,
                runAsUser: 1001,
                runAsGroup: 1001,
                seccompProfile: { type: 'RuntimeDefault' },
              },
              containers: [
                {
                  name: 'pebble',
                  image: pebbleImage,
                  imagePullPolicy: 'IfNotPresent',
                  args: ['-config', '/fixture/config.json'],
                  env: [{ name: 'PEBBLE_WFE_NONCEREJECT', value: '0' }],
                  securityContext: {
                    allowPrivilegeEscalation: false,
                    readOnlyRootFilesystem: true,
                    capabilities: { drop: ['ALL'] },
                  },
                  resources: {
                    requests: { cpu: '100m', memory: '64Mi' },
                    limits: { cpu: '500m', memory: '256Mi' },
                  },
                  ports: [{ containerPort: 14000 }],
                  readinessProbe: {
                    tcpSocket: { port: 14000 },
                    periodSeconds: 1,
                  },
                  volumeMounts: [
                    { name: 'fixture', mountPath: '/fixture', readOnly: true },
                  ],
                },
              ],
              volumes: [
                { name: 'fixture', secret: { secretName: 'pebble-fixture' } },
              ],
            },
          },
        },
      });
      await apply({
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: 'pebble', namespace: 'cert-manager' },
        spec: {
          selector: { fixture: 'pebble' },
          ports: [{ name: 'acme', port: 14000, targetPort: 14000 }],
        },
      });
      const controller = documents.find(
        (item) =>
          item.kind === 'Deployment' && item.metadata.name === 'cert-manager',
      );
      assert.ok(controller);
      assert.equal(
        controller.spec.template.spec.containers[0].image,
        controllerImage,
      );
      await apply(controller);
      await kube([
        'rollout',
        'status',
        'deployment/pebble',
        '-n',
        'cert-manager',
        '--timeout=120s',
      ]);
      await kube([
        'rollout',
        'status',
        'deployment/cert-manager',
        '-n',
        'cert-manager',
        '--timeout=120s',
      ]);
      phase = 'account-register';
      for (const name of accountNames) {
        await apply({
          apiVersion: 'cert-manager.io/v1',
          kind: 'ClusterIssuer',
          metadata: { name },
          spec: {
            acme: {
              server: directory,
              caBundle: certificate.toString('base64'),
              privateKeySecretRef: { name: name + '-account' },
              solvers: [
                { http01: { ingress: { ingressClassName: 'unused-fixture' } } },
              ],
            },
          },
        });
      }
      const originals = new Map();
      for (const name of accountNames) {
        const issuer = await poll(
          () => get('clusterissuer', name),
          ready,
          'original account registration',
        );
        const secret = await get('secret', name + '-account', 'cert-manager');
        const pem = Buffer.from(secret.data['tls.key'], 'base64');
        const expected = {
          directory,
          accountUri: issuer.status.acme.uri,
          keyChecksum: keyChecksum(pem),
        };
        assertAcmeReconciliation({
          issuer,
          secret,
          expected,
          restoredResourceVersion: secret.metadata.resourceVersion,
        });
        originals.set(name, { pem, expected });
        const replacement = newKey();
        phase = 'account-key-replace';
        await replaceKey(name, replacement);
        phase = 'account-reconcile';
        const changed = await poll(
          () => get('clusterissuer', name),
          (value) =>
            ready(value) &&
            value.status.acme.lastPrivateKeyHash === keyChecksum(replacement) &&
            value.status.acme.uri !== expected.accountUri,
          'new cached account registration',
        );
        assert.ok(
          changed.status.acme.uri !== expected.accountUri,
          'Fresh key unexpectedly retained original account.',
        );
        const changedSecret = await get(
          'secret',
          name + '-account',
          'cert-manager',
        );
        assert.throws(() =>
          assertAcmeReconciliation({
            issuer: changed,
            secret: changedSecret,
            expected,
            restoredResourceVersion: changedSecret.metadata.resourceVersion,
          }),
        );
      }
      await kube([
        'scale',
        'deployment/cert-manager',
        '-n',
        'cert-manager',
        '--replicas=0',
      ]);
      await poll(
        async () =>
          JSON.parse(
            await kube([
              'get',
              'pods',
              '-n',
              'cert-manager',
              '-l',
              'app.kubernetes.io/component=controller',
              '-o',
              'json',
            ]),
          ),
        (value) => value.items.length === 0,
        'controller outage',
      );
      const restoredVersions = new Map();
      phase = 'account-key-replace';
      for (const name of accountNames)
        restoredVersions.set(
          name,
          await replaceKey(name, originals.get(name).pem),
        );
      for (let attempt = 0; attempt < 3; attempt++) {
        for (const name of accountNames) {
          const issuer = await get('clusterissuer', name);
          const secret = await get('secret', name + '-account', 'cert-manager');
          assert.ok(
            ready(issuer),
            'No-reconciliation control lost the stale Ready condition.',
          );
          assert.throws(() =>
            assertAcmeReconciliation({
              issuer,
              secret,
              expected: originals.get(name).expected,
              restoredResourceVersion: restoredVersions.get(name),
            }),
          );
        }
        await wait(250);
      }
      await kube([
        'scale',
        'deployment/cert-manager',
        '-n',
        'cert-manager',
        '--replicas=1',
      ]);
      await kube([
        'rollout',
        'status',
        'deployment/cert-manager',
        '-n',
        'cert-manager',
        '--timeout=120s',
      ]);
      for (const name of accountNames) {
        const expected = originals.get(name).expected;
        const issuer = await poll(
          () => get('clusterissuer', name),
          (value) =>
            ready(value) &&
            value.status.acme.uri === expected.accountUri &&
            value.status.acme.lastPrivateKeyHash === expected.keyChecksum,
          'original restored account',
        );
        const secret = await get('secret', name + '-account', 'cert-manager');
        assertAcmeReconciliation({
          issuer,
          secret,
          expected,
          restoredResourceVersion: restoredVersions.get(name),
        });
        assert.throws(() =>
          assertAcmeReconciliation({
            issuer,
            secret,
            expected: { ...expected, directory: directory + '/wrong' },
            restoredResourceVersion: restoredVersions.get(name),
          }),
        );
      }
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
                await run(
                  kind,
                  [
                    'delete',
                    'cluster',
                    '--name',
                    cluster,
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
              removeAzureFixtureDirectory(temporary, 'equipment-acme-'),
          },
        ],
      });
    }
  },
);
