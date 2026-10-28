import { Buffer } from 'node:buffer';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  X509Certificate,
} from 'node:crypto';
import { connect as tlsConnect } from 'node:tls';
import { isIP } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { clearTimeout, setTimeout } from 'node:timers';
import { isDeepStrictEqual } from 'node:util';
import { OperationalFailure } from './process.mjs';
import { createKubectlQualificationProbe } from './azure-qualification.mjs';
import {
  createIdentityContinuityStore,
  identityContinuityMetadata,
} from './azure-recovery-identity.mjs';
import { assertAcmeReconciliation } from './azure-recovery-kubernetes.mjs';
import { qualityContext, verifiedTool } from './azure-quality.mjs';

const fail = () => {
  throw new OperationalFailure(
    'Recovery bundle inventory, key, controller reconciliation or served TLS verification failed; private values suppressed.',
  );
};
const accounts = [
  [
    'cert-manager',
    'letsencrypt-production-account',
    'production',
    'https://acme-v02.api.letsencrypt.org/directory',
  ],
  [
    'cert-manager',
    'letsencrypt-staging-account',
    'staging',
    'https://acme-staging-v02.api.letsencrypt.org/directory',
  ],
];
const certificates = [
  ['equipment', 'equipment-tls', ['app', 'identity']],
  ['equipment', 'dashboard-public-tls', ['dashboard']],
  ['argocd', 'argocd-public-tls', ['argocd']],
];
const inventory = [...accounts, ...certificates];
const exact = (value, keys, optional = []) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  keys.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) => keys.includes(key) || optional.includes(key),
  );
function decode(value) {
  if (typeof value !== 'string' || value.length > 262144) fail();
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) fail();
  return bytes;
}
function keyChecksum(data) {
  const key = createPrivateKey(decode(data['tls.key']));
  if (key.asymmetricKeyType !== 'rsa') fail();
  return createHash('sha256')
    .update(key.export({ type: 'pkcs1', format: 'der' }))
    .digest('base64');
}
function certificate(data, hosts, allowExpired) {
  if (!exact(data, ['tls.crt', 'tls.key'], ['ca.crt'])) fail();
  const cert = new X509Certificate(decode(data['tls.crt']));
  const key = createPrivateKey(decode(data['tls.key']));
  if (
    !cert.publicKey
      .export({ type: 'spki', format: 'der' })
      .equals(createPublicKey(key).export({ type: 'spki', format: 'der' }))
  )
    fail();
  const sans = cert.subjectAltName
    ?.split(', ')
    .map((item) => (item.startsWith('DNS:') ? item.slice(4) : 'invalid'));
  if (
    !sans ||
    [...sans].sort().join(',') !== [...hosts].sort().join(',') ||
    !cert.issuer.split('\n').includes("O=Let's Encrypt")
  )
    fail();
  if (hosts.some((host) => !cert.checkHost(host, { subject: 'never' }))) fail();
  if (
    !allowExpired &&
    (Date.parse(cert.validFrom) > Date.now() ||
      Date.parse(cert.validTo) <= Date.now())
  )
    fail();
  return cert;
}
function served(connect, ip, host, expected, signal) {
  return new Promise((resolve, reject) => {
    let socket,
      done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      socket?.destroy();
      if (error)
        reject(
          new OperationalFailure(
            'Recovery bundle served TLS trust, SNI or leaf verification failed.',
          ),
        );
      else resolve();
    };
    const abort = () => finish(true),
      timer = setTimeout(abort, 10000);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      socket = connect({
        host: ip,
        port: 443,
        servername: host,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
      });
      socket.on('error', () => finish(true));
      socket.once('close', () => {
        if (!done) finish(true);
      });
      socket.once('secureConnect', () => {
        try {
          if (
            !socket.authorized ||
            !Buffer.isBuffer(socket.getPeerCertificate(true)?.raw) ||
            !expected.raw.equals(socket.getPeerCertificate(true).raw)
          )
            throw Error();
          finish();
        } catch {
          finish(true);
        }
      });
    } catch {
      finish(true);
    }
  });
}
export function createRecoveryBundle({
  config,
  outputs,
  kubeconfig,
  token,
  actor,
  signal,
  request,
  connect = tlsConnect,
  kubectl = verifiedTool(qualityContext(), 'kubectl'),
  timeoutMs = 300000,
}) {
  if (
    !['backup', 'restore'].includes(actor) ||
    isIP(outputs?.ingress_public_ip) !== 4 ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(config?.domain ?? '') ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 300000
  )
    fail();
  const source = {
    environment: config.environment,
    generation: config.generation,
    tenantId: config.tenantId,
    subscriptionId: config.subscriptionId,
  };
  const identity = (active) =>
    createIdentityContinuityStore({
      vaultUri: outputs.workload_key_vault_uri,
      tenantId: config.tenantId,
      generation: config.generation,
      actor,
      token,
      request,
      signal: active,
    });
  const secretPath = (namespace, name) =>
    '/api/v1/namespaces/' + namespace + '/secrets/' + name;
  const issuerPath = (stage) =>
    '/apis/cert-manager.io/v1/clusterissuers/letsencrypt-' + stage;
  const probe = (active) =>
    createKubectlQualificationProbe({
      kubeconfig,
      command: kubectl,
      signal: active,
    });
  const readSecret = async (api, namespace, name) => {
    const value = await api.getOptional(secretPath(namespace, name));
    if (
      value?.kind !== 'Secret' ||
      value.metadata?.name !== name ||
      value.metadata.namespace !== namespace ||
      typeof value.metadata.resourceVersion !== 'string' ||
      !value.metadata.resourceVersion
    )
      fail();
    return value;
  };
  const validateEntry = (item, index, allowExpired) => {
    const [namespace, name] = inventory[index];
    if (
      !exact(
        item,
        ['namespace', 'name', 'type', 'data'],
        index < 2 ? ['account'] : [],
      ) ||
      item.namespace !== namespace ||
      item.name !== name
    )
      fail();
    if (index < 2) {
      const [, , stage, directory] = accounts[index];
      if (
        item.type !== 'Opaque' ||
        !exact(item.data, ['tls.key']) ||
        !exact(item.account, ['directory', 'accountUri', 'keyChecksum']) ||
        item.account.directory !== directory ||
        item.account.keyChecksum !== keyChecksum(item.data)
      )
        fail();
      const uri = new URL(item.account.accountUri),
        base = new URL(directory);
      if (
        uri.origin !== base.origin ||
        !/^\/acme\/acct\/[a-zA-Z0-9_-]+$/.test(uri.pathname) ||
        uri.search ||
        uri.hash ||
        uri.username ||
        uri.password ||
        !stage
      )
        fail();
    } else {
      if (item.type !== 'kubernetes.io/tls') fail();
      certificate(
        item.data,
        certificates[index - 2][2].map((host) => host + '.' + config.domain),
        allowExpired,
      );
    }
  };
  const replace = async (api, item) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await readSecret(api, item.namespace, item.name);
      if (current.type !== item.type) fail();
      const metadata = { ...current.metadata };
      delete metadata.managedFields;
      const body = {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata,
        type: item.type,
        data: item.data,
        ...(current.immutable !== undefined
          ? { immutable: current.immutable }
          : {}),
      };
      const response = await api.replaceContinuitySecret(
        item.namespace,
        item.name,
        body,
      );
      if (!response.conflict) {
        if (
          !isDeepStrictEqual(response.value.data, item.data) ||
          response.value.type !== item.type
        )
          fail();
        return response.value;
      }
      await delay(
        100 * 2 ** attempt + Math.floor(Math.random() * 50),
        undefined,
        { signal },
      );
    }
    fail();
  };
  const verifyTls = async (api, active) => {
    for (const [namespace, name, prefixes] of certificates) {
      const current = await readSecret(api, namespace, name);
      const hosts = prefixes.map((prefix) => prefix + '.' + config.domain),
        cert = certificate(current.data, hosts, false);
      for (const host of hosts)
        await served(connect, outputs.ingress_public_ip, host, cert, active);
    }
  };
  return {
    async capture() {
      if (actor !== 'backup') fail();
      const active = globalThis.AbortSignal.any([
          ...(signal ? [signal] : []),
          globalThis.AbortSignal.timeout(timeoutMs),
        ]),
        api = probe(active),
        kubernetes = [];
      try {
        for (let index = 0; index < inventory.length; index++) {
          const [namespace, name] = inventory[index],
            actual = await readSecret(api, namespace, name);
          const item = {
            namespace,
            name,
            type: actual.type,
            data: actual.data,
          };
          if (index < 2) {
            const issuer = (
              await api.json('GET', issuerPath(accounts[index][2]))
            ).value;
            item.account = {
              directory: accounts[index][3],
              accountUri: issuer.status?.acme?.uri,
              keyChecksum: keyChecksum(item.data),
            };
            assertAcmeReconciliation({
              issuer,
              secret: actual,
              expected: item.account,
              restoredResourceVersion: actual.metadata.resourceVersion,
            });
          }
          validateEntry(item, index, false);
          kubernetes.push(item);
        }
        await verifyTls(api, active);
        return Buffer.from(
          JSON.stringify({
            version: 1,
            source,
            identity: await identity(active).capture(),
            kubernetes,
          }),
        );
      } catch {
        fail();
      }
    },
    async restore(bytes, { sourceIdentity, sourceSecrets } = {}) {
      if (
        actor !== 'restore' ||
        !Buffer.isBuffer(bytes) ||
        bytes.length > 2097152
      )
        fail();
      const active = globalThis.AbortSignal.any([
          ...(signal ? [signal] : []),
          globalThis.AbortSignal.timeout(timeoutMs),
        ]),
        api = probe(active);
      try {
        const bundle = JSON.parse(bytes.toString('utf8'));
        if (
          !exact(bundle, ['version', 'source', 'identity', 'kubernetes']) ||
          bundle.version !== 1 ||
          !exact(bundle.source, [
            'environment',
            'generation',
            'tenantId',
            'subscriptionId',
          ]) ||
          bundle.source.environment !== config.environment ||
          bundle.source.tenantId !== config.tenantId ||
          bundle.source.subscriptionId !== config.subscriptionId ||
          bundle.source.generation !== sourceIdentity?.generation ||
          sourceIdentity?.tenantId !== config.tenantId ||
          !sourceIdentity?.vaultId?.startsWith(
            '/subscriptions/' + config.subscriptionId + '/',
          ) ||
          !Array.isArray(bundle.kubernetes) ||
          bundle.kubernetes.length !== 5
        )
          fail();
        const trusted = identityContinuityMetadata(
          bundle.identity,
          sourceIdentity,
        );
        if (!isDeepStrictEqual(trusted.sourceSecrets, sourceSecrets)) fail();
        bundle.kubernetes.forEach((item, index) =>
          validateEntry(item, index, true),
        );
        for (const [namespace, name] of inventory)
          await readSecret(api, namespace, name);
        const expectedIdentity = {
          vaultUri: sourceIdentity.vaultUri,
          tenantId: sourceIdentity.tenantId,
          generation: sourceIdentity.generation,
        };
        await identity(active).restore(bundle.identity, expectedIdentity);
        for (let index = 0; index < 2; index++) {
          const item = bundle.kubernetes[index],
            restored = await replace(api, item);
          while (true) {
            const secret = await readSecret(api, item.namespace, item.name),
              issuer = (await api.json('GET', issuerPath(accounts[index][2])))
                .value;
            if (issuer.spec?.acme?.server !== item.account.directory) fail();
            try {
              assertAcmeReconciliation({
                issuer,
                secret,
                expected: item.account,
                restoredResourceVersion: restored.metadata.resourceVersion,
              });
              break;
            } catch {
              await delay(1000, undefined, { signal: active });
            }
          }
        }
        for (const item of bundle.kubernetes.slice(2)) await replace(api, item);
        while (true) {
          try {
            await verifyTls(api, active);
            break;
          } catch {
            await delay(1000, undefined, { signal: active });
          }
        }
        return { outcome: 'continuity-restored' };
      } catch {
        fail();
      }
    },
  };
}
