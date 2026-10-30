import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { renderVerificationResources } from './azure-runtime.mjs';

test(
  'verification provider uses actual pinned kubectl raw requests and UID-preconditioned owned cleanup',
  { skip: !process.env.KUBECTL },
  async () => {
    const { createVerificationProvider } =
      await import('./azure-recovery-kubernetes.mjs');
    const resources = new Map();
    const calls = [];
    const server = createServer(async (request, response) => {
      response.setHeader('content-type', 'application/json');
      const path = new URL(request.url, 'http://localhost').pathname;
      let text = '';
      for await (const chunk of request) text += chunk;
      calls.push([request.method, path, text]);
      if (request.method === 'POST') {
        const value = JSON.parse(text);
        value.metadata.uid = randomUUID();
        if (value.kind === 'Job') value.status = { ready: 1, active: 1 };
        resources.set(`${path}/${value.metadata.name}`, value);
        response.statusCode = 201;
        response.end(JSON.stringify(value));
        return;
      }
      const value = resources.get(path);
      if (!value) {
        response.statusCode = 404;
        response.end(
          JSON.stringify({
            kind: 'Status',
            apiVersion: 'v1',
            status: 'Failure',
            reason: 'NotFound',
            code: 404,
          }),
        );
        return;
      }
      if (request.method === 'DELETE') {
        assert.equal(JSON.parse(text).preconditions.uid, value.metadata.uid);
        resources.delete(path);
        response.end(
          JSON.stringify({
            kind: 'Status',
            apiVersion: 'v1',
            status: 'Success',
          }),
        );
        return;
      }
      response.end(JSON.stringify(value));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const directory = mkdtempSync(join(tmpdir(), 'verification-provider-'));
    const kubeconfig = join(directory, 'kubeconfig.json');
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
    const pointId = 'daily-2026-10-26';
    const templates = renderVerificationResources(
      createHash('sha256').update(pointId).digest('hex').slice(0, 16),
    );
    try {
      const ownership = [];
      const provider = createVerificationProvider({
        kubeconfig,
        pointId,
        kubectl: process.env.KUBECTL,
        saveOwnership: async (value) => ownership.push(value),
      });
      const altered = globalThis.structuredClone(templates);
      altered.job.spec.template.spec.containers[0].image = 'unreviewed:image';
      await assert.rejects(provider.create(altered), /template/i);
      assert.equal(calls.length, 0);
      await provider.create(templates);
      await provider.wait(templates, 30000);
      assert.equal(ownership.length, 2);
      await provider.remove(templates);
      assert.equal(resources.size, 0);
      assert.equal(calls.filter(([method]) => method === 'DELETE').length, 2);
      const nextPoint = 'daily-2026-10-27';
      const next = renderVerificationResources(
        createHash('sha256').update(nextPoint).digest('hex').slice(0, 16),
      );
      const second = createVerificationProvider({
        kubeconfig,
        pointId: nextPoint,
        kubectl: process.env.KUBECTL,
        saveOwnership: async () => {},
      });
      await second.create(next);
      const jobPath = `/apis/batch/v1/namespaces/equipment-recovery/jobs/${next.job.metadata.name}`;
      resources.get(jobPath).metadata.uid = randomUUID();
      await assert.rejects(second.remove(next), /cleanup operation/);
      assert.equal(resources.size, 1);
      assert.ok(
        resources.has(jobPath),
        'never delete the replaced, unowned Job',
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
      await new Promise((resolve) => server.close(resolve));
    }
  },
);

test(
  'writer quiescence uses actual Pod objects including terminating and orphan Pods, validates selectors and fails closed on list denial',
  { skip: !process.env.KUBECTL },
  async () => {
    const { createWriterObservation } =
      await import('./azure-recovery-kubernetes.mjs');
    let pods = [],
      deny = false,
      wrongSelector = false;
    const server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      if (request.url.startsWith('/api/v1/namespaces/equipment/pods')) {
        response.statusCode = deny ? 403 : 200;
        response.end(
          JSON.stringify(
            deny
              ? { kind: 'Status', code: 403, message: 'PRIVATE-POD-ERROR' }
              : { kind: 'PodList', metadata: {}, items: pods },
          ),
        );
        return;
      }
      const pathname = new URL(request.url, 'http://localhost').pathname;
      const name = pathname.split('/')[7];
      const deployment = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name, namespace: 'equipment' },
        spec: {
          replicas: 0,
          selector: {
            matchLabels: {
              'app.kubernetes.io/name': wrongSelector ? 'wrong' : name,
            },
          },
        },
        status: { observedGeneration: 1, availableReplicas: 0 },
      };
      response.end(
        JSON.stringify(
          pathname.endsWith('/scale')
            ? {
                apiVersion: 'autoscaling/v1',
                kind: 'Scale',
                metadata: { name },
                spec: { replicas: 0 },
                status: { replicas: 0 },
              }
            : deployment,
        ),
      );
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const directory = mkdtempSync(join(tmpdir(), 'writer-observation-'));
    const kubeconfig = join(directory, 'kubeconfig.json');
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
      const observation = createWriterObservation({
        kubeconfig,
        actor: 'restore',
        kubectl: process.env.KUBECTL,
      });
      await observation.waitScale('web', 0, 5000);
      for (const pod of [
        {
          metadata: {
            name: 'terminating',
            labels: { 'app.kubernetes.io/name': 'web' },
            deletionTimestamp: new Date().toISOString(),
          },
          status: { phase: 'Succeeded' },
        },
        {
          metadata: {
            name: 'orphan',
            labels: { 'app.kubernetes.io/name': 'web' },
            ownerReferences: [{ kind: 'ReplicaSet', uid: randomUUID() }],
          },
          status: { phase: 'Pending' },
        },
      ]) {
        pods = [pod];
        await assert.rejects(observation.waitScale('web', 0, 500));
      }
      pods = [];
      wrongSelector = true;
      await assert.rejects(observation.readScale('web'), /selector/i);
      wrongSelector = false;
      deny = true;
      await assert.rejects(observation.waitScale('web', 0, 5000), (error) => {
        assert.doesNotMatch(error.message, /PRIVATE-POD-ERROR/);
        return true;
      });
      await assert.rejects(observation.scale('web', 0), /restore/i);
    } finally {
      rmSync(directory, { recursive: true, force: true });
      await new Promise((resolve) => server.close(resolve));
    }
  },
);

test('ACME reconciliation requires actual restored key DER checksum, original account and current resource version rather than stale Ready', async () => {
  const { assertAcmeReconciliation } =
    await import('./azure-recovery-kubernetes.mjs');
  const { generateKeyPairSync, createPrivateKey } = await import('node:crypto');
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString();
  const checksum = createHash('sha256')
    .update(createPrivateKey(key).export({ type: 'pkcs1', format: 'der' }))
    .digest('base64');
  const secret = {
    metadata: { resourceVersion: '42' },
    data: { 'tls.key': Buffer.from(key).toString('base64') },
  };
  const expected = {
    directory: 'https://acme-v02.api.letsencrypt.org/directory',
    accountUri: 'https://acme-v02.api.letsencrypt.org/acme/acct/123',
    keyChecksum: checksum,
  };
  const issuer = {
    spec: { acme: { server: expected.directory } },
    status: {
      acme: { uri: expected.accountUri, lastPrivateKeyHash: checksum },
      conditions: [{ type: 'Ready', status: 'True' }],
    },
  };
  assertAcmeReconciliation({
    issuer,
    secret,
    expected,
    restoredResourceVersion: '42',
  });
  for (const mutate of [
    (x) => (x.issuer.status.acme.lastPrivateKeyHash = 'old-cached'),
    (x) => (x.issuer.status.acme.uri += '4'),
    (x) => (x.issuer.status.conditions[0].status = 'False'),
    (x) => (x.secret.metadata.resourceVersion = '43'),
    (x) => (x.issuer.spec.acme.server = 'https://foreign.invalid/directory'),
  ]) {
    const changed = globalThis.structuredClone({
      issuer,
      secret,
      expected,
      restoredResourceVersion: '42',
    });
    mutate(changed);
    assert.throws(() => assertAcmeReconciliation(changed), /ACME/i);
  }
});
