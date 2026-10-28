import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import {
  createServer as createTlsServer,
  createSecureContext,
  connect,
} from 'node:tls';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { createHash, createPrivateKey } from 'node:crypto';
import { executeProcess } from './process.mjs';
import { createPrivateDirectory } from './local-platform.mjs';

test(
  'recovery bundle captures exact secret inventory, guards existing Secret versions and requires real TLS trust and served key agreement',
  { skip: !process.env.KUBECTL, timeout: 60000 },
  async () => {
    const { createRecoveryBundle } =
      await import('./azure-recovery-bundle.mjs');
    const directory = mkdtempSync(join(tmpdir(), 'recovery-bundle-'));
    createPrivateDirectory(directory);
    const secrets = new Map(),
      contexts = {},
      roots = [];
    const openssl =
      process.platform === 'win32'
        ? 'C:/Program Files/Git/usr/bin/openssl.exe'
        : 'openssl';
    for (const [namespace, name, hosts] of [
      [
        'equipment',
        'equipment-tls',
        ['app.codingfunlab.com', 'identity.codingfunlab.com'],
      ],
      ['equipment', 'dashboard-public-tls', ['dashboard.codingfunlab.com']],
      ['argocd', 'argocd-public-tls', ['argocd.codingfunlab.com']],
    ]) {
      const key = join(directory, name + '.key'),
        cert = join(directory, name + '.crt');
      executeProcess(
        openssl,
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-days',
          '1',
          '-keyout',
          key,
          '-out',
          cert,
          '-subj',
          "/CN=fixture/O=Let's Encrypt",
          '-addext',
          'subjectAltName=' + hosts.map((host) => 'DNS:' + host).join(','),
        ],
        {
          operation: 'Private recovery fixture certificate generation',
          tool: 'openssl',
          output: 'private-capture',
          timeout: 30000,
          maxBuffer: 65536,
        },
      );
      const keyPem = readFileSync(key, 'utf8'),
        certPem = readFileSync(cert, 'utf8');
      roots.push(certPem);
      for (const host of hosts)
        contexts[host] = createSecureContext({ key: keyPem, cert: certPem });
      secrets.set(`/api/v1/namespaces/${namespace}/secrets/${name}`, {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
          name,
          namespace,
          resourceVersion: '1',
          annotations: { 'destination-owner': 'keep' },
        },
        type: 'kubernetes.io/tls',
        data: {
          'tls.key': Buffer.from(keyPem).toString('base64'),
          'tls.crt': Buffer.from(certPem).toString('base64'),
        },
      });
    }
    const accountKey = readFileSync(
      join(directory, 'equipment-tls.key'),
      'utf8',
    );
    const hash = createHash('sha256')
      .update(
        createPrivateKey(accountKey).export({ type: 'pkcs1', format: 'der' }),
      )
      .digest('base64');
    const issuers = new Map();
    for (const stage of ['production', 'staging']) {
      const name = 'letsencrypt-' + stage + '-account',
        directoryUrl =
          stage === 'production'
            ? 'https://acme-v02.api.letsencrypt.org/directory'
            : 'https://acme-staging-v02.api.letsencrypt.org/directory';
      secrets.set('/api/v1/namespaces/cert-manager/secrets/' + name, {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: { name, namespace: 'cert-manager', resourceVersion: '1' },
        type: 'Opaque',
        data: { 'tls.key': Buffer.from(accountKey).toString('base64') },
      });
      issuers.set(
        '/apis/cert-manager.io/v1/clusterissuers/letsencrypt-' + stage,
        {
          spec: { acme: { server: directoryUrl } },
          status: {
            acme: {
              uri: new URL('/acme/acct/123', directoryUrl).href,
              lastPrivateKeyHash: hash,
            },
            conditions: [{ type: 'Ready', status: 'True' }],
          },
        },
      );
    }
    let conflict = true,
      puts = 0;
    const paths = [];
    const api = createServer(async (request, response) => {
      const path = new URL(request.url, 'http://fixture').pathname;
      paths.push([request.method, path]);
      response.setHeader('content-type', 'application/json');
      if (path.startsWith('/secrets/')) {
        const name = path.split('/')[2];
        response.end(
          JSON.stringify({
            id: `https://fixture.vault.azure.net/secrets/${name}/${'a'.repeat(32)}`,
            value: 'PRIVATE-' + name + '-1234567890abcdef',
            attributes: { enabled: true },
          }),
        );
        return;
      }
      if (request.method === 'PUT') {
        let body = '';
        for await (const chunk of request) body += chunk;
        const value = JSON.parse(body);
        puts++;
        if (conflict) {
          conflict = false;
          response.statusCode = 409;
          response.end(
            JSON.stringify({
              apiVersion: 'v1',
              kind: 'Status',
              status: 'Failure',
              reason: 'Conflict',
              code: 409,
              message: 'PRIVATE-RV-CONFLICT',
            }),
          );
          return;
        }
        assert.equal(
          value.metadata.resourceVersion,
          secrets.get(path).metadata.resourceVersion,
        );
        value.metadata.resourceVersion = String(
          Number(value.metadata.resourceVersion) + 1,
        );
        secrets.set(path, value);
        response.end(JSON.stringify(value));
        return;
      }
      const value = secrets.get(path) ?? issuers.get(path);
      if (!value) {
        response.statusCode = 404;
        response.end(JSON.stringify({ kind: 'Status', code: 404 }));
        return;
      }
      response.end(JSON.stringify(value));
    });
    const tls = createTlsServer(
      { SNICallback: (name, callback) => callback(null, contexts[name]) },
      (socket) => socket.end(),
    );
    await Promise.all([
      new Promise((resolve) => api.listen(0, '127.0.0.1', resolve)),
      new Promise((resolve) => tls.listen(0, '127.0.0.1', resolve)),
    ]);
    const kubeconfig = join(directory, 'kubeconfig.json');
    writeFileSync(
      kubeconfig,
      JSON.stringify({
        apiVersion: 'v1',
        kind: 'Config',
        clusters: [
          {
            name: 'fixture',
            cluster: { server: `http://127.0.0.1:${api.address().port}` },
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
      kubeconfig,
      kubectl: process.env.KUBECTL,
      token: async () => 'PRIVATE-TOKEN',
      request: (url, options) =>
        globalThis.fetch(
          `http://127.0.0.1:${api.address().port}${new URL(url).pathname}${new URL(url).search}`,
          options,
        ),
      connect: (options) =>
        connect({
          ...options,
          host: '127.0.0.1',
          port: tls.address().port,
          ca: roots,
        }),
    };
    try {
      const backup = createRecoveryBundle({ ...settings, actor: 'backup' });
      const bundle = await backup.capture();
      const parsed = JSON.parse(bundle.toString());
      assert.equal(parsed.kubernetes.length, 5);
      assert.equal(parsed.identity.secrets.length, 6);
      const restore = createRecoveryBundle({ ...settings, actor: 'restore' });
      const sourceIdentity = {
        vaultUri: 'https://fixture.vault.azure.net',
        vaultId:
          '/subscriptions/subscription/resourceGroups/source/providers/Microsoft.KeyVault/vaults/fixture',
        tenantId: 'tenant',
        generation: 'g1',
      };
      const sourceSecrets = parsed.identity.secrets.map(
        ({ name, version, valueHash }) => ({ name, version, valueHash }),
      );
      for (const mutate of [
        (value) =>
          (value.identity.source.vaultUri = 'https://foreign.vault.azure.net'),
        (value) => (value.identity.source.tenantId = 'foreign'),
        (value) => (value.identity.source.generation = 'foreign'),
        (value) => (value.identity.secrets[0].version = 'b'.repeat(32)),
        (value) => (value.identity.secrets[0].valueHash = 'b'.repeat(64)),
      ]) {
        const foreign = globalThis.structuredClone(parsed);
        mutate(foreign);
        const before = paths.filter(([method]) => method === 'PUT').length;
        await assert.rejects(
          restore.restore(Buffer.from(JSON.stringify(foreign)), {
            sourceGeneration: 'g1',
            sourceIdentity,
            sourceSecrets,
          }),
          /bundle/i,
        );
        assert.equal(
          paths.filter(([method]) => method === 'PUT').length,
          before,
        );
      }
      await restore.restore(bundle, {
        sourceGeneration: 'g1',
        sourceIdentity,
        sourceSecrets,
      });
      assert.equal(puts, 6);
      assert.ok(
        [...secrets.values()]
          .filter((value) => value.metadata.annotations)
          .every(
            (value) =>
              value.metadata.annotations['destination-owner'] === 'keep',
          ),
      );
      assert.ok(
        paths.every(
          ([, path]) =>
            !path.includes('internal-root') && !path.endsWith('/secrets'),
        ),
      );
      const invalid = JSON.parse(bundle.toString());
      invalid.kubernetes[0].name = 'unlisted';
      const before = puts;
      await assert.rejects(
        restore.restore(Buffer.from(JSON.stringify(invalid)), {
          sourceGeneration: 'g1',
          sourceIdentity,
          sourceSecrets,
        }),
        /bundle/i,
      );
      assert.equal(puts, before);
      const untrusted = createRecoveryBundle({
        ...settings,
        actor: 'backup',
        connect: (options) =>
          connect({ ...options, host: '127.0.0.1', port: tls.address().port }),
      });
      await assert.rejects(untrusted.capture(), (error) => {
        assert.doesNotMatch(error.message, /PRIVATE-|BEGIN.*KEY/);
        return true;
      });
    } finally {
      await Promise.all([
        new Promise((resolve) => api.close(resolve)),
        new Promise((resolve) => tls.close(resolve)),
      ]);
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
